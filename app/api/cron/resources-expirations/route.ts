import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { ASSETS, DOC_TYPES, type AssetType } from "@/lib/resources/schema";
import { notifyResources } from "@/lib/resources/notify";

// Daily (see vercel.json): 90 / 60 / 30-day and on-expiry alerts for vehicle registrations, property leases,
// driver's licenses, insurance coverage and documents. Idempotent: res_expiry_alerts_sent has a unique
// (source, source_id, expires_on, threshold), so each alert goes out once, and a changed date starts fresh.
// Items first seen inside a window get only the most urgent applicable alert, not every earlier one.
const THRESHOLDS = [90, 60, 30];

const today = () => new Date().toISOString().slice(0, 10);
const daysUntil = (d: string) => Math.round((Date.parse(d + "T00:00:00Z") - Date.parse(today() + "T00:00:00Z")) / 86400000);
/** 0 = expired/expiring today; otherwise the tightest of 90/60/30 that the item is inside. */
const thresholdFor = (days: number) => (days <= 0 ? 0 : THRESHOLDS.filter((t) => days <= t).sort((a, b) => a - b)[0]);

type Item = { source: string; id: string; officeId: string; expiresOn: string; what: string; title: string; path: string };

async function run() {
  const admin = createAdminClient();
  const horizon = new Date(Date.now() + 90 * 86400000).toISOString().slice(0, 10);
  const graceStart = new Date(Date.now() - 14 * 86400000).toISOString().slice(0, 10); // expired within the last 2 weeks
  const items: Item[] = [];

  for (const t of Object.keys(ASSETS) as AssetType[]) {
    const cfg = ASSETS[t];
    for (const ex of cfg.expiries) {
      const { data } = await admin.from(cfg.table).select("*").eq("status", "active").gte(ex.key, graceStart).lte(ex.key, horizon);
      for (const r of data ?? []) {
        items.push({ source: `${cfg.table}.${ex.key}`, id: r.id, officeId: r.office_id, expiresOn: (r as any)[ex.key], what: ex.label, title: cfg.title(r), path: `/resources/${t}/${r.id}` });
      }
    }
  }

  const { data: pols } = await admin
    .from("res_insurance_policies")
    .select("*, res_vehicles(year, make, model, plate, status), res_properties(name, status), res_drivers(full_name, status)")
    .gte("coverage_end", graceStart)
    .lte("coverage_end", horizon);
  for (const p of pols ?? []) {
    const a = (p as any).res_vehicles ?? (p as any).res_properties ?? (p as any).res_drivers;
    if (a?.status === "removed") continue;
    const t: AssetType = p.vehicle_id ? "vehicles" : p.property_id ? "properties" : "drivers";
    items.push({
      source: "res_insurance_policies.coverage_end",
      id: p.id,
      officeId: p.office_id,
      expiresOn: p.coverage_end,
      what: `Insurance coverage (${p.provider})`,
      title: ASSETS[t].title(a ?? {}),
      path: `/resources/${t}/${p.vehicle_id ?? p.property_id ?? p.driver_id}`,
    });
  }

  const { data: docs } = await admin.from("res_documents").select("*").is("deleted_at", null).gte("expires_on", graceStart).lte("expires_on", horizon);
  for (const d of docs ?? []) {
    const t: AssetType | null = d.vehicle_id ? "vehicles" : d.property_id ? "properties" : d.driver_id ? "drivers" : null;
    items.push({
      source: "res_documents.expires_on",
      id: d.id,
      officeId: d.office_id,
      expiresOn: d.expires_on,
      what: DOC_TYPES.find((x) => x.value === d.doc_type)?.label ?? "Document",
      title: d.title,
      path: t ? `/resources/${t}/${d.vehicle_id ?? d.property_id ?? d.driver_id}` : "/resources",
    });
  }

  let sent = 0;
  for (const it of items) {
    const days = daysUntil(it.expiresOn);
    const threshold = thresholdFor(days);
    if (threshold === undefined) continue;
    // Claim this alert first; if it was already sent, the unique key makes this a no-op.
    const { data: claimed } = await admin
      .from("res_expiry_alerts_sent")
      .upsert({ source: it.source, source_id: it.id, expires_on: it.expiresOn, threshold }, { onConflict: "source,source_id,expires_on,threshold", ignoreDuplicates: true })
      .select("id");
    if (!claimed?.length) continue;
    const when = days < 0 ? `expired ${-days} day${days === -1 ? "" : "s"} ago` : days === 0 ? "expires today" : `expires in ${days} days`;
    await notifyResources({
      event: "expiry",
      officeId: it.officeId,
      subject: `${days <= 0 ? "Expired" : `Expires in ${days} days`}: ${it.what} for ${it.title}`,
      heading: `${it.what} ${when}`,
      rows: [
        ["Item", it.title],
        ["What", it.what],
        ["Expiration date", it.expiresOn],
        ["Required action", days <= 0 ? "Renew immediately" : "Start the renewal"],
      ],
      path: it.path,
      related: { source: it.source, id: it.id, threshold },
    });
    sent++;
  }
  return { checked: items.length, sent };
}

// GET: Vercel Cron with `Authorization: Bearer $CRON_SECRET`.
export async function GET(request: NextRequest) {
  if (request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json(await run());
}
