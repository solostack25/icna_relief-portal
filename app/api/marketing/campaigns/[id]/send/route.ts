import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { getMarketingContactsAccess } from "@/lib/marketingContactsAccess";
import { resolveCampaignRecipients } from "@/lib/campaignRecipients";
import { getResendClient } from "@/lib/resendClient";
import { ORG_NAME, ORG_MAILING_ADDRESS, ORG_APP_BASE_URL } from "@/lib/orgConfig";

function withFooter(bodyHtml: string, contactId: string): string {
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

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const access = await getMarketingContactsAccess();
  if (!access.ok) return NextResponse.json({ error: "Not authorized" }, { status: access.status });

  const resend = await getResendClient();
  if (!resend) {
    return NextResponse.json(
      { error: "Email isn't connected yet. Add a Resend API key and From address in Admin > Connectors first." },
      { status: 400 }
    );
  }

  const admin = createAdminClient();
  const { data: campaign } = await admin
    .from("email_campaigns")
    .select("id, subject, body_html, segment_id, status")
    .eq("id", params.id)
    .single();

  if (!campaign) return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  if (campaign.status === "sending" || campaign.status === "sent") {
    return NextResponse.json({ error: `Campaign is already ${campaign.status}` }, { status: 400 });
  }
  if (!campaign.segment_id) {
    return NextResponse.json({ error: "Campaign has no segment assigned" }, { status: 400 });
  }

  await admin.from("email_campaigns").update({ status: "sending" }).eq("id", campaign.id);

  const recipients = await resolveCampaignRecipients(campaign.segment_id);

  if (recipients.length === 0) {
    await admin.from("email_campaigns").update({ status: "failed" }).eq("id", campaign.id);
    return NextResponse.json({ error: "No sendable recipients in this segment (empty, or all opted out / missing email)" }, { status: 400 });
  }

  let sent = 0;
  let failed = 0;

  // Sequential, not Promise.all - Resend rate limits, and this keeps
  // failures isolated to one recipient instead of one throttling
  // error taking down the whole batch.
  for (const recipient of recipients) {
    try {
      const { data, error } = await resend.client.emails.send({
        from: resend.fromAddress,
        to: recipient.email,
        subject: campaign.subject,
        html: withFooter(campaign.body_html, recipient.id),
      });

      if (error) throw new Error(error.message);

      await admin.from("email_sends").insert({
        campaign_id: campaign.id,
        contact_id: recipient.id,
        resend_message_id: data?.id ?? null,
        status: "sent",
        sent_at: new Date().toISOString(),
      });
      sent++;
    } catch (err) {
      await admin.from("email_sends").insert({
        campaign_id: campaign.id,
        contact_id: recipient.id,
        status: "failed",
        error: err instanceof Error ? err.message : "unknown error",
      });
      failed++;
    }
  }

  await admin
    .from("email_campaigns")
    .update({ status: "sent", sent_at: new Date().toISOString() })
    .eq("id", campaign.id);

  return NextResponse.json({ sent, failed, total: recipients.length });
}
