// Shared server-side logic for InKind Cash & Check donations.
//
// Lifecycle of a row in inkind_cash_donations:
//   received  -> entered at the scanning station (donor PII + check photo held)
//   batched   -> included in a money order (inkind_money_orders)
//   synced    -> pushed to ICNA Relief Salesforce as its own record; donor PII
//                is nulled and the check photo is replaced with a blurred copy
//
// The Salesforce field mapping is intentionally NOT done yet - see
// buildSalesforcePayload / CASH_CHECK_SF_OBJECT below.

import { Resend } from "resend";
import { createAdminClient } from "@/lib/supabase/server";
import { getSalesforceAuth, isSalesforceConfigured } from "./salesforceAuth";

export const CHECK_BUCKET = "inkind-checks";

// Same single-kiosk assumption as app/inkind/page.tsx: the only InKind
// station today is Houston. Move to per-device config if a second office
// gets a station.
export const KIOSK_OFFICE = { name: "Houston", id: "c2892dfa-dbf4-48f5-b64c-31a8585a0c03", receiptPrefix: "CCHOU" };

import { donorDisplayName, money, type CashDonationRow, type MoneyOrderRow } from "./cashCheck.shared";
export * from "./cashCheck.shared";

// ---------------------------------------------------------------- receipt

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export async function sendCashCheckReceipt(donationId: string): Promise<{ sent: boolean; error?: string }> {
  const admin = createAdminClient();
  const { data } = await admin.from("inkind_cash_donations").select("*").eq("id", donationId).single();
  const d = data as CashDonationRow | null;
  if (!d) return { sent: false, error: "Donation not found" };
  if (!d.donor_email) return { sent: false, error: "No donor email on file" };

  const resendKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!resendKey || !from) return { sent: false, error: "Email not configured" };

  const name = donorDisplayName(d);
  const methodLine = d.method === "check" ? `Check${d.check_number ? ` #${esc(d.check_number)}` : ""}` : "Cash";
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
  const logo = siteUrl
    ? `<img src="${siteUrl.replace(/\/$/, "")}/logo.png" alt="ICNA Relief" style="height:36px;width:auto;margin-bottom:16px;" />`
    : "";

  const html = `${logo}
<p>Dear ${esc(name)},</p>
<p>Thank you for your generous donation to ICNA Relief USA. This email is your receipt.</p>
<table style="border-collapse:collapse;font-size:14px;margin:12px 0;">
  <tr><td style="padding:4px 16px 4px 0;color:#666;">Receipt #</td><td><strong>${esc(d.receipt_number)}</strong></td></tr>
  <tr><td style="padding:4px 16px 4px 0;color:#666;">Date received</td><td>${esc(d.date_received)}</td></tr>
  <tr><td style="padding:4px 16px 4px 0;color:#666;">Amount</td><td><strong>${money(d.amount)}</strong></td></tr>
  <tr><td style="padding:4px 16px 4px 0;color:#666;">Payment</td><td>${methodLine}</td></tr>
  ${d.office ? `<tr><td style="padding:4px 16px 4px 0;color:#666;">Office</td><td>${esc(d.office)}</td></tr>` : ""}
</table>
<p style="font-size:12px;color:#666;">ICNA Relief USA is a 501(c)(3) nonprofit organization. No goods or services were provided in exchange for this contribution. Please keep this receipt for your tax records.</p>`;

  const resend = new Resend(resendKey);
  const { error } = await resend.emails.send({
    from,
    to: d.donor_email,
    subject: `Your ICNA Relief donation receipt — ${d.receipt_number}`,
    html,
  });

  const now = new Date().toISOString();
  await admin
    .from("inkind_cash_donations")
    .update(error ? { receipt_error: error.message ?? "Send failed" } : { receipt_sent_at: now, receipt_error: null })
    .eq("id", d.id);

  return error ? { sent: false, error: error.message } : { sent: true };
}

// ------------------------------------------------------------- Salesforce

// TODO(salesforce mapping): set the target object + field map once the
// ICNA Relief Salesforce mapping is decided. Until CASH_CHECK_SF_OBJECT is
// set, pushes fail cleanly with "mapping not configured" and nothing is
// purged, so no data is lost.
const CASH_CHECK_SF_OBJECT = process.env.SALESFORCE_CASH_CHECK_OBJECT || "";

export function isCashCheckSalesforceReady(): boolean {
  return isSalesforceConfigured() && !!CASH_CHECK_SF_OBJECT;
}

function buildSalesforcePayload(d: CashDonationRow, mo: MoneyOrderRow): Record<string, unknown> {
  // Placeholder field names - replace with the real API names during mapping.
  return {
    Amount__c: Number(d.amount),
    Payment_Method__c: d.method === "check" ? "Check" : "Cash",
    Check_Number__c: d.check_number,
    Date_Received__c: d.date_received,
    Portal_Receipt_Number__c: d.receipt_number,
    Money_Order_Number__c: mo.money_order_number,
    Office__c: d.office,
    Donor_Type__c: d.donor_kind,
    Donor_First_Name__c: d.donor_first_name,
    Donor_Last_Name__c: d.donor_last_name,
    Donor_Organization__c: d.donor_org_name,
    Donor_Email__c: d.donor_email,
    Donor_Phone__c: d.donor_phone,
    Donor_Street__c: [d.address_line1, d.address_line2].filter(Boolean).join("\n") || null,
    Donor_City__c: d.city,
    Donor_State__c: d.state,
    Donor_Zip__c: d.zip,
    Notes__c: d.notes,
  };
}

async function createSalesforceRecord(payload: Record<string, unknown>): Promise<string> {
  const auth = await getSalesforceAuth();
  const res = await fetch(`${auth.instanceUrl}/services/data/v60.0/sobjects/${CASH_CHECK_SF_OBJECT}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${auth.accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const msg = Array.isArray(body) ? body.map((e: { message?: string }) => e.message).join("; ") : res.statusText;
    throw new Error(`Salesforce ${res.status}: ${msg}`);
  }
  return body.id as string;
}

// Replaces the original check photo with a heavily blurred copy and
// deletes the original. Runs only after a successful Salesforce push.
async function blurCheckImage(path: string): Promise<boolean> {
  const admin = createAdminClient();
  const { data: file, error } = await admin.storage.from(CHECK_BUCKET).download(path);
  if (error || !file) return false;
  const sharp = (await import("sharp")).default;
  const blurred = await sharp(Buffer.from(await file.arrayBuffer()))
    .rotate()
    .resize({ width: 900, withoutEnlargement: true })
    .blur(25)
    .jpeg({ quality: 60 })
    .toBuffer();
  const { error: upErr } = await admin.storage
    .from(CHECK_BUCKET)
    .upload(path, blurred, { contentType: "image/jpeg", upsert: true });
  return !upErr;
}

export type PushResult = { id: string; receipt_number: string; success: boolean; error?: string; salesforceId?: string };

// Pushes every not-yet-synced donation in a money order to Salesforce,
// one record per donation. Each success purges that donation's PII and
// blurs its check image; failures keep their data and record the error
// so the push can be retried.
export async function pushMoneyOrderToSalesforce(moneyOrderId: string, employeeId: string): Promise<{ results: PushResult[]; error?: string }> {
  const admin = createAdminClient();
  const { data: moData } = await admin.from("inkind_money_orders").select("*").eq("id", moneyOrderId).single();
  const mo = moData as MoneyOrderRow | null;
  if (!mo) return { results: [], error: "Money order not found" };

  if (!isCashCheckSalesforceReady()) {
    return { results: [], error: "Salesforce mapping for cash/check donations is not configured yet." };
  }

  const { data: rowData } = await admin
    .from("inkind_cash_donations")
    .select("*")
    .eq("money_order_id", moneyOrderId)
    .neq("status", "synced");
  const rows = rowData as CashDonationRow[] | null;

  const results: PushResult[] = [];
  for (const d of rows ?? []) {
    try {
      const sfId = await createSalesforceRecord(buildSalesforcePayload(d, mo));
      const blurred = d.check_image_path ? await blurCheckImage(d.check_image_path) : false;
      const now = new Date().toISOString();
      await admin
        .from("inkind_cash_donations")
        .update({
          status: "synced",
          salesforce_record_id: sfId,
          synced_at: now,
          sync_error: null,
          check_image_blurred: blurred,
          // Purge donor PII - Salesforce is now the system of record.
          pii_purged_at: now,
          donor_first_name: null,
          donor_last_name: null,
          donor_org_name: null,
          donor_email: null,
          donor_phone: null,
          address_line1: null,
          address_line2: null,
          city: null,
          state: null,
          zip: null,
        })
        .eq("id", d.id);
      results.push({ id: d.id, receipt_number: d.receipt_number, success: true, salesforceId: sfId });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await admin.from("inkind_cash_donations").update({ sync_error: msg }).eq("id", d.id);
      results.push({ id: d.id, receipt_number: d.receipt_number, success: false, error: msg });
    }
  }

  const { count: remaining } = await admin
    .from("inkind_cash_donations")
    .select("id", { count: "exact", head: true })
    .eq("money_order_id", moneyOrderId)
    .neq("status", "synced");
  if (!remaining) {
    await admin
      .from("inkind_money_orders")
      .update({ pushed_at: new Date().toISOString(), pushed_by: employeeId })
      .eq("id", moneyOrderId);
  }

  return { results };
}
