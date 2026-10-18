import { createAdminClient } from "@/lib/supabase/server";
import { getSalesforceAuth, isSalesforceConfigured } from "@/lib/inkind/salesforceAuth";
import { getIntegrationSetting } from "@/lib/integrationSettings";
import { ensureZipListLoaded } from "@/lib/geo/zipOffices";

// Nightly pull of donations/payments from ICNA's Salesforce into
// revenue_transactions — replaces uploading Salesforce revenue exports to
// the Master Cleaner.
//
// Only reporting fields are stored: amount, date, method, campaign, record
// type, program, and the donor's city/state/zip (to credit an office).
// Donor names, emails and phone numbers are never copied — Salesforce /
// CharityStack stay the system of record for donor details.
//
// Off until integration_settings.revenue_sync_enabled = "true".
//
// TO CONFIRM once Salesforce access is available (run
// /api/admin/salesforce/discover?q=payment,opportunity,campaign): the
// object and field names below follow the standard Nonprofit Success Pack
// (NPSP) Payments model, which matches the columns in the old revenue
// export ("Payment Number", "Payment Amount", "Primary Campaign Source",
// "Opportunity Record Type", "Contact: Mailing Zip", "Contact: Region").
export const REVENUE_SYNC_CONFIG = {
  object: "npe01__OppPayment__c",
  fields: {
    id: "Id",
    paymentNumber: "Name",
    amount: "npe01__Payment_Amount__c",
    date: "npe01__Payment_Date__c",
    paid: "npe01__Paid__c",
    method: "npe01__Payment_Method__c",
    recordType: "npe01__Opportunity__r.RecordType.Name",
    donationType: "npe01__Opportunity__r.Type",
    campaign: "npe01__Opportunity__r.Campaign.Name",
    campaignSource: "npe01__Opportunity__r.LeadSource",
    program: "npe01__Opportunity__r.Program__c",
    fund: null as string | null,
    city: "npe01__Opportunity__r.npsp__Primary_Contact__r.MailingCity",
    state: "npe01__Opportunity__r.npsp__Primary_Contact__r.MailingState",
    zip: "npe01__Opportunity__r.npsp__Primary_Contact__r.MailingPostalCode",
    region: "npe01__Opportunity__r.npsp__Primary_Contact__r.Region__c",
    modified: "LastModifiedDate",
  },
  // Only paid payments count as revenue.
  where: "npe01__Paid__c = true",
  // First run pulls this far back; later runs pick up from the last change.
  initialSince: "2025-01-01T00:00:00Z",
};

type SyncResult = { status: "success" | "error" | "not_configured"; rows: number; error?: string };

function pick(rec: any, path: string | null): any {
  if (!path) return null;
  return path.split(".").reduce((o, k) => (o == null ? null : o[k]), rec);
}

export async function syncSalesforceRevenue(): Promise<SyncResult> {
  const admin = createAdminClient();
  const enabled = (await getIntegrationSetting("revenue_sync_enabled")) === "true";

  if (!enabled || !isSalesforceConfigured()) {
    await admin.from("revenue_sync_runs").insert({
      status: "not_configured",
      finished_at: new Date().toISOString(),
      error: !isSalesforceConfigured() ? "Salesforce credentials not set" : "Revenue sync is turned off (revenue_sync_enabled)",
    });
    return { status: "not_configured", rows: 0 };
  }

  const { data: run } = await admin.from("revenue_sync_runs").insert({ status: "running" }).select("id").single();
  const runId = run?.id as string;

  try {
    await ensureZipListLoaded();
    const { data: last } = await admin
      .from("revenue_sync_runs")
      .select("cursor")
      .eq("source", "salesforce")
      .eq("status", "success")
      .not("cursor", "is", null)
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const since = last?.cursor ?? REVENUE_SYNC_CONFIG.initialSince;

    const f = REVENUE_SYNC_CONFIG.fields;
    const cols = [...new Set(Object.values(f).filter(Boolean) as string[])];
    const soql = `SELECT ${cols.join(", ")} FROM ${REVENUE_SYNC_CONFIG.object} WHERE ${REVENUE_SYNC_CONFIG.where} AND ${f.modified} > ${since} ORDER BY ${f.modified} ASC`;

    const auth = await getSalesforceAuth();
    let url: string | null = `${auth.instanceUrl}/services/data/v60.0/query?q=${encodeURIComponent(soql)}`;
    let total = 0;
    let cursor = since;

    while (url) {
      const res: Response = await fetch(url, { headers: { Authorization: `Bearer ${auth.accessToken}` } });
      const json: any = await res.json();
      if (!res.ok) throw new Error(`Salesforce query failed: ${JSON.stringify(json).slice(0, 500)}`);

      const rows = (json.records as any[])
        .map((r) => {
          const date = pick(r, f.date);
          const amount = Number(pick(r, f.amount));
          if (!date || !Number.isFinite(amount)) return null;
          const modified = pick(r, f.modified);
          if (modified) {
            // Salesforce returns "2026-10-18T05:00:00.000+0000"; SOQL wants "…T05:00:00Z".
            const iso = new Date(modified).toISOString().replace(/\.\d{3}Z$/, "Z");
            if (new Date(iso) > new Date(cursor)) cursor = iso;
          }
          return {
            source: "salesforce",
            source_id: pick(r, f.id),
            received_on: String(date).slice(0, 10),
            amount,
            record_type: pick(r, f.recordType),
            donation_type: pick(r, f.donationType),
            payment_method: pick(r, f.method),
            campaign_name: pick(r, f.campaign),
            campaign_source: pick(r, f.campaignSource),
            program: pick(r, f.program),
            fund: pick(r, f.fund),
            donor_city: pick(r, f.city),
            donor_state: pick(r, f.state),
            donor_zip: pick(r, f.zip),
            sf_region: pick(r, f.region),
            synced_at: new Date().toISOString(),
          };
        })
        .filter(Boolean);

      if (rows.length) {
        const { error } = await admin.from("revenue_transactions").upsert(rows, { onConflict: "source,source_id" });
        if (error) throw new Error(error.message);
        total += rows.length;
      }
      url = json.nextRecordsUrl ? `${auth.instanceUrl}${json.nextRecordsUrl}` : null;
    }

    await admin
      .from("revenue_sync_runs")
      .update({ status: "success", finished_at: new Date().toISOString(), rows_upserted: total, cursor })
      .eq("id", runId);
    return { status: "success", rows: total };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await admin.from("revenue_sync_runs").update({ status: "error", finished_at: new Date().toISOString(), error: message.slice(0, 2000) }).eq("id", runId);
    return { status: "error", rows: 0, error: message };
  }
}
