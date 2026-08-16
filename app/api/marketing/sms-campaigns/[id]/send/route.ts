import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { getMarketingContactsAccess } from "@/lib/marketingContactsAccess";
import { resolveSmsCampaignRecipients } from "@/lib/campaignRecipients";
import { getSkyetelCreds, sendSkyetelSms, sleep } from "@/lib/skyetel";

// Skyetel rate-limits to 300 sends / 5 min (1/sec). This route sends
// synchronously with a throttle, which works within a single request
// for smaller lists but will hit serverless function time limits on
// large ones (roughly >250 recipients on a 5-minute function
// timeout). For real bulk sends past that size, this needs to become
// a queued job processed by the same cron dispatcher the drip
// sequence engine will use - noted here rather than built now since
// this is still pre-launch/testing scale.
const MAX_SYNCHRONOUS_RECIPIENTS = 250;
const THROTTLE_MS = 1100; // just over 1/sec to stay safely under the limit

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const access = await getMarketingContactsAccess();
  if (!access.ok) return NextResponse.json({ error: "Not authorized" }, { status: access.status });

  const creds = await getSkyetelCreds();
  if (!creds) {
    return NextResponse.json(
      { error: "Texting isn't connected yet. Add Skyetel API credentials in Admin > Connectors first." },
      { status: 400 }
    );
  }

  const admin = createAdminClient();
  const { data: campaign } = await admin
    .from("sms_campaigns")
    .select("id, body, segment_id, status")
    .eq("id", params.id)
    .single();

  if (!campaign) return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  if (campaign.status === "sending" || campaign.status === "sent") {
    return NextResponse.json({ error: `Campaign is already ${campaign.status}` }, { status: 400 });
  }
  if (!campaign.segment_id) return NextResponse.json({ error: "Campaign has no segment assigned" }, { status: 400 });

  const recipients = await resolveSmsCampaignRecipients(campaign.segment_id);

  if (recipients.length === 0) {
    return NextResponse.json(
      { error: "No sendable recipients (empty segment, or all opted out / missing phone)" },
      { status: 400 }
    );
  }
  if (recipients.length > MAX_SYNCHRONOUS_RECIPIENTS) {
    return NextResponse.json(
      {
        error: `This segment has ${recipients.length} recipients — above the ${MAX_SYNCHRONOUS_RECIPIENTS} synchronous send limit. Large bulk sends need the queued sender (not built yet); split into smaller segments for now.`,
      },
      { status: 400 }
    );
  }

  await admin.from("sms_campaigns").update({ status: "sending" }).eq("id", campaign.id);

  let sent = 0;
  let failed = 0;

  for (const recipient of recipients) {
    const result = await sendSkyetelSms(creds, recipient.phone, campaign.body);

    await admin.from("sms_sends").insert({
      campaign_id: campaign.id,
      contact_id: recipient.id,
      to_number: recipient.phone,
      status: result.ok ? "sent" : "failed",
      error: result.ok ? null : result.error,
      sent_at: result.ok ? new Date().toISOString() : null,
    });

    if (result.ok) sent++;
    else failed++;

    await sleep(THROTTLE_MS);
  }

  await admin.from("sms_campaigns").update({ status: "sent", sent_at: new Date().toISOString() }).eq("id", campaign.id);

  return NextResponse.json({ sent, failed, total: recipients.length });
}
