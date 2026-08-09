import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { sendMailAs } from "@/lib/msgraph";
import { IT_SUPPORT_MAILBOX } from "@/lib/helpdesk";

// Sends an email to a ticket's submitter from the shared IT Support
// mailbox, logs it, and awards the +2 "emailed within 5 hours of
// opening" bonus exactly once per ticket -- checked against
// helpdesk_email_log rather than trusting the client to only call
// this once, since a second email to the same person shouldn't be a
// second bonus.
//
// Requires the Mail.Send Application permission on the Portal app
// registration (Entra ID -> App registrations -> Portal -> API
// permissions -> Add a permission -> Microsoft Graph -> Application
// permissions -> Mail.Send -> Grant admin consent). Not granted as of
// this writing -- this route will fail with a Graph 403 until that's
// done. Depending on the tenant's Exchange Online setup, an
// Application Access Policy scoping which mailboxes this app can
// send from may also be required (ask a Microsoft 365 admin if a
// plain permission grant isn't enough).
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: me } = await supabase
    .from("employees")
    .select("id, role")
    .eq("auth_user_id", user.id)
    .single();
  if (!me) return NextResponse.json({ error: "No employee record" }, { status: 403 });

  const body = await request.json();
  const { legId, subject, message } = body as { legId: string; subject: string; message: string };

  if (!legId || !subject?.trim() || !message?.trim()) {
    return NextResponse.json({ error: "legId, subject, and message are required" }, { status: 400 });
  }

  const admin = createAdminClient();

  const { data: leg } = await admin
    .from("helpdesk_request_legs")
    .select("id, request_id, department, created_at")
    .eq("id", legId)
    .single();
  if (!leg) return NextResponse.json({ error: "Ticket not found" }, { status: 404 });

  const { data: helpdeskRequest } = await admin
    .from("helpdesk_requests")
    .select("submitted_by_email, submitted_by")
    .eq("id", leg.request_id)
    .single();
  if (!helpdeskRequest) return NextResponse.json({ error: "Request not found" }, { status: 404 });

  try {
    await sendMailAs({
      fromMailbox: IT_SUPPORT_MAILBOX,
      to: helpdeskRequest.submitted_by_email,
      subject: subject.trim(),
      body: message.trim(),
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? "Failed to send email" }, { status: 502 });
  }

  await admin.from("helpdesk_email_log").insert({
    leg_id: legId,
    sent_by_employee_id: me.id,
    to_email: helpdeskRequest.submitted_by_email,
    subject: subject.trim(),
    body: message.trim(),
  });

  let bonusAwarded = false;
  if (leg.department === "it") {
    const hoursOpen = (Date.now() - new Date(leg.created_at).getTime()) / (1000 * 60 * 60);
    if (hoursOpen <= 5) {
      const { data: existingBonus } = await admin
        .from("helpdesk_points_ledger")
        .select("id")
        .eq("leg_id", legId)
        .eq("reason", "email_within_5h_bonus")
        .maybeSingle();

      if (!existingBonus) {
        await admin.from("helpdesk_points_ledger").insert({
          leg_id: legId,
          employee_id: me.id,
          points: 2,
          reason: "email_within_5h_bonus",
        });
        bonusAwarded = true;
      }
    }
  }

  return NextResponse.json({ ok: true, bonusAwarded });
}
