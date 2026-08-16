import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { getResendClient } from "@/lib/resendClient";
import { getSkyetelCreds, sendSkyetelSms, sleep } from "@/lib/skyetel";
import { ORG_NAME, ORG_MAILING_ADDRESS, ORG_APP_BASE_URL } from "@/lib/orgConfig";

// Runs every 15 min (see vercel.json). For every active enrollment
// whose next_step_due_at has passed, sends that step and advances
// the enrollment - or marks it completed if there's no next step.
//
// Batch-capped per run (BATCH_LIMIT) so this stays well inside a
// serverless timeout; anything left over just gets picked up on the
// next 15-minute tick, so nothing is lost, only delayed slightly.
const BATCH_LIMIT = 200;
const SMS_THROTTLE_MS = 1100; // Skyetel's 1/sec limit

function emailFooter(bodyHtml: string, contactId: string): string {
  const unsubscribeUrl = `${ORG_APP_BASE_URL}/api/marketing/unsubscribe?contact=${contactId}`;
  return `
    ${bodyHtml}
    <hr style="margin-top:32px;border:none;border-top:1px solid #ddd;" />
    <p style="font-size:11px;color:#888;margin-top:12px;">
      ${ORG_NAME} &middot; ${ORG_MAILING_ADDRESS}<br/>
      <a href="${unsubscribeUrl}" style="color:#888;">Unsubscribe</a> from future emails.
    </p>
  `;
}

async function runDispatch() {
  const admin = createAdminClient();
  const now = new Date().toISOString();

  const { data: dueEnrollments } = await admin
    .from("sequence_enrollments")
    .select("id, sequence_id, contact_id, current_step, campaign_sequences!inner(status)")
    .eq("status", "active")
    .eq("campaign_sequences.status", "active")
    .lte("next_step_due_at", now)
    .order("next_step_due_at", { ascending: true })
    .limit(BATCH_LIMIT);

  if (!dueEnrollments || dueEnrollments.length === 0) {
    return { processed: 0, sent: 0, skipped: 0, completed: 0, failed: 0 };
  }

  const resend = await getResendClient();
  const skyetelCreds = await getSkyetelCreds();

  let sent = 0;
  let skipped = 0;
  let completed = 0;
  let failed = 0;

  for (const enrollment of dueEnrollments as {
    id: string;
    sequence_id: string;
    contact_id: string;
    current_step: number;
  }[]) {
    const nextStepOrder = enrollment.current_step + 1;

    const { data: step } = await admin
      .from("sequence_steps")
      .select("id, channel, delay_after_previous_hours, subject, body")
      .eq("sequence_id", enrollment.sequence_id)
      .eq("step_order", nextStepOrder)
      .maybeSingle();

    if (!step) {
      await admin
        .from("sequence_enrollments")
        .update({ status: "completed", exit_reason: "completed", next_step_due_at: null })
        .eq("id", enrollment.id);
      completed++;
      continue;
    }

    const { data: contact } = await admin
      .from("contacts")
      .select("id, email, phone, first_name, email_opt_out, sms_opt_out")
      .eq("id", enrollment.contact_id)
      .single();

    let sendStatus: "sent" | "failed" | "skipped_opted_out" = "sent";
    let sendError: string | null = null;

    if (!contact) {
      sendStatus = "failed";
      sendError = "Contact not found";
      failed++;
    } else if (step.channel === "email") {
      if (contact.email_opt_out || !contact.email) {
        sendStatus = "skipped_opted_out";
        skipped++;
      } else if (!resend) {
        sendStatus = "failed";
        sendError = "Email not connected";
        failed++;
      } else {
        const { error } = await resend.client.emails.send({
          from: resend.fromAddress,
          to: contact.email,
          subject: step.subject ?? "",
          html: emailFooter(step.body, contact.id),
        });
        if (error) {
          sendStatus = "failed";
          sendError = error.message;
          failed++;
        } else {
          sent++;
        }
      }
    } else {
      // sms
      if (contact.sms_opt_out || !contact.phone) {
        sendStatus = "skipped_opted_out";
        skipped++;
      } else if (!skyetelCreds) {
        sendStatus = "failed";
        sendError = "Texting not connected";
        failed++;
      } else {
        const result = await sendSkyetelSms(skyetelCreds, contact.phone, step.body);
        if (!result.ok) {
          sendStatus = "failed";
          sendError = result.error;
          failed++;
        } else {
          sent++;
        }
        await sleep(SMS_THROTTLE_MS);
      }
    }

    await admin.from("sequence_step_sends").insert({
      enrollment_id: enrollment.id,
      step_id: step.id,
      channel: step.channel,
      status: sendStatus,
      error: sendError,
    });

    // Advance regardless of send outcome - a failed/skipped step
    // shouldn't stall the rest of someone's sequence indefinitely.
    const { data: followingStep } = await admin
      .from("sequence_steps")
      .select("delay_after_previous_hours")
      .eq("sequence_id", enrollment.sequence_id)
      .eq("step_order", nextStepOrder + 1)
      .maybeSingle();

    if (followingStep) {
      const dueAt = new Date(Date.now() + followingStep.delay_after_previous_hours * 60 * 60 * 1000).toISOString();
      await admin
        .from("sequence_enrollments")
        .update({ current_step: nextStepOrder, next_step_due_at: dueAt })
        .eq("id", enrollment.id);
    } else {
      await admin
        .from("sequence_enrollments")
        .update({ current_step: nextStepOrder, status: "completed", exit_reason: "completed", next_step_due_at: null })
        .eq("id", enrollment.id);
      completed++;
    }
  }

  return { processed: dueEnrollments.length, sent, skipped, completed, failed };
}

// GET — called by Vercel Cron with `Authorization: Bearer $CRON_SECRET`.
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const expected = `Bearer ${process.env.CRON_SECRET}`;
  if (!process.env.CRON_SECRET || authHeader !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const result = await runDispatch();
  return NextResponse.json(result);
}
