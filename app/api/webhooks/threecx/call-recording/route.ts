import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { getIntegrationSetting } from "@/lib/integrationSettings";
import { getThreeCxConfig, downloadThreeCxRecording } from "@/lib/threecx";
import { transcribeAudio } from "@/lib/ai/azureOpenAI";
import { getSalesforceAuth, isSalesforceConfigured } from "@/lib/inkind/salesforceAuth";
import { findOrCreateDonorContact } from "@/lib/inkind/salesforceDonor";
import { attachTranscriptToSalesforceTask } from "@/lib/marketing/salesforceDonorCall";

// Called by 3CX once a recorded call finishes - configured on the 3CX
// side as a Call Flow Designer "REST Data Source" / webhook action (3CX
// doesn't push this automatically; someone has to wire a CFD script or
// equivalent to POST here after a recording is ready). Expected body
// shape - adjust the field names below to match whatever 3CX actually
// sends once that's configured, this is the best-guess shape based on
// 3CX's standard call-event fields:
//   {
//     callId: string,              // 3CX's internal call/recording id
//     callerNumber: string,        // extension or DID that placed the call
//     calleeNumber: string,        // number that was dialed
//     recordingUrl: string,        // path or URL to fetch the audio from
//     durationSeconds?: number,
//     endedAt?: string             // ISO timestamp
//   }
//
// Auth: a shared secret in the X-Webhook-Secret header, checked against
// the 'threecx_recording_webhook_secret' integration setting (Admin >
// Connectors) - set the same value in whatever 3CX sends as a header.
export async function POST(req: Request) {
  const expectedSecret = await getIntegrationSetting("threecx_recording_webhook_secret");
  const providedSecret = req.headers.get("x-webhook-secret");
  if (!expectedSecret || providedSecret !== expectedSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });

  const { callId, callerNumber, calleeNumber, recordingUrl, durationSeconds, endedAt } = body as {
    callId?: string;
    callerNumber?: string;
    calleeNumber?: string;
    recordingUrl?: string;
    durationSeconds?: number;
    endedAt?: string;
  };

  if (!recordingUrl) {
    return NextResponse.json({ error: "recordingUrl is required" }, { status: 400 });
  }

  const admin = createAdminClient();
  const callEndedAt = endedAt ? new Date(endedAt) : new Date();

  // Best-effort match back to the call we placed: same dialed number,
  // logged within the last few hours before this call ended. Not
  // exact-science (two calls to the same number in a short window
  // would match the wrong one), but there's nothing more precise to
  // join on - 3CX's callback doesn't know our internal call log id.
  let matchedCallLog: { id: string; caller_employee_id: string; target_id: string | null; target_type: string } | null = null;
  if (calleeNumber) {
    const normalizedCallee = calleeNumber.replace(/\D/g, "").slice(-10);
    const since = new Date(callEndedAt.getTime() - 4 * 60 * 60 * 1000).toISOString();
    const { data: candidates } = await admin
      .from("portal_call_logs")
      .select("id, caller_employee_id, target_id, target_type, target_number, created_at")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(20);
    matchedCallLog =
      (candidates ?? []).find((c: { target_number: string | null }) => c.target_number?.replace(/\D/g, "").slice(-10) === normalizedCallee) ?? null;
  }

  const contactId = matchedCallLog?.target_type === "contact" ? matchedCallLog.target_id : null;

  const { data: recording, error: insertError } = await admin
    .from("call_recordings")
    .insert({
      portal_call_log_id: matchedCallLog?.id ?? null,
      contact_id: contactId,
      employee_id: matchedCallLog?.caller_employee_id ?? null,
      threecx_call_id: callId ?? null,
      recording_url: recordingUrl,
      duration_seconds: durationSeconds ?? null,
      call_ended_at: callEndedAt.toISOString(),
      status: "received",
    })
    .select("id")
    .single();

  if (insertError || !recording) {
    return NextResponse.json({ error: insertError?.message ?? "Failed to record webhook event" }, { status: 500 });
  }

  // Transcription + Salesforce push happen after responding 202 isn't
  // an option here (no background job queue in this app) - do it
  // inline, but every step is wrapped so a failure updates the row's
  // status/error instead of throwing past a 200 3CX would just retry.
  try {
    await admin.from("call_recordings").update({ status: "transcribing" }).eq("id", recording.id);

    const config = await getThreeCxConfig();
    if (!config) throw new Error("3CX not configured");

    const audio = await downloadThreeCxRecording(config, recordingUrl);
    const transcript = await transcribeAudio(audio, `${recording.id}.mp3`);

    await admin
      .from("call_recordings")
      .update({ transcript, status: "transcribed", transcribed_at: new Date().toISOString() })
      .eq("id", recording.id);

    if (contactId && isSalesforceConfigured()) {
      const { data: contact } = await admin
        .from("contacts")
        .select("id, first_name, last_name, email, phone, salesforce_contact_id")
        .eq("id", contactId)
        .single();

      if (contact) {
        let sfContactId = contact.salesforce_contact_id as string | null;
        if (!sfContactId) {
          const auth = await getSalesforceAuth();
          sfContactId = await findOrCreateDonorContact(auth, {
            name: [contact.first_name, contact.last_name].filter(Boolean).join(" ") || null,
            email: contact.email,
            phone: contact.phone,
            address: null,
          });
          if (sfContactId) {
            await admin.from("contacts").update({ salesforce_contact_id: sfContactId }).eq("id", contact.id);
          }
        }

        if (sfContactId) {
          const result = await attachTranscriptToSalesforceTask(sfContactId, transcript);
          await admin
            .from("call_recordings")
            .update({ status: result.ok ? "pushed_to_salesforce" : "failed", error: result.ok ? null : result.error })
            .eq("id", recording.id);
        }
      }
    }

    return NextResponse.json({ ok: true, callRecordingId: recording.id });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    await admin.from("call_recordings").update({ status: "failed", error: message }).eq("id", recording.id);
    // Still 200 - the event was received and logged even though
    // processing failed; a 4xx/5xx here would make 3CX retry the same
    // webhook indefinitely for a problem retrying won't fix.
    return NextResponse.json({ ok: false, error: message });
  }
}
