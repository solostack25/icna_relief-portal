import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getResourcesUser } from "@/lib/resources/access";
import { ASSETS, OPEN_STATUSES, DOC_TYPES, type AssetType } from "@/lib/resources/schema";
import { ASSET_TITLE_SELECT, embeddedAssetTitle } from "@/lib/resources/db";

const daysUntil = (d: string) => Math.round((Date.parse(d + "T00:00:00Z") - Date.parse(new Date().toISOString().slice(0, 10) + "T00:00:00Z")) / 86400000);

export async function GET() {
  const supabase = await createClient();
  const me = await getResourcesUser(supabase);
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const horizon = new Date(Date.now() + 90 * 86400000).toISOString().slice(0, 10);

  const counts: Record<string, number> = {};
  const expiring: { kind: string; title: string; office: string; date: string; days: number; href: string }[] = [];

  for (const t of Object.keys(ASSETS) as AssetType[]) {
    const cfg = ASSETS[t];
    const { count } = await supabase.from(cfg.table).select("id", { count: "exact", head: true }).eq("status", "active");
    counts[t] = count ?? 0;
    for (const ex of cfg.expiries) {
      const { data } = await supabase.from(cfg.table).select(`*, b2s_offices(field_office)`).eq("status", "active").not(ex.key, "is", null).lte(ex.key, horizon).limit(200);
      for (const r of data ?? []) {
        const date = (r as any)[ex.key];
        expiring.push({ kind: ex.label, title: cfg.title(r), office: (r as any).b2s_offices?.field_office ?? "", date, days: daysUntil(date), href: `/resources/${t}/${r.id}` });
      }
    }
  }
  const { data: pols } = await supabase.from("res_insurance_policies").select(`*, b2s_offices(field_office), ${ASSET_TITLE_SELECT}`).lte("coverage_end", horizon).limit(300);
  for (const p of pols ?? []) {
    const a = embeddedAssetTitle(p);
    if (!p.coverage_end || daysUntil(p.coverage_end) < -30) continue;
    expiring.push({ kind: `Insurance (${p.provider})`, title: a.title, office: (p as any).b2s_offices?.field_office ?? "", date: p.coverage_end, days: daysUntil(p.coverage_end), href: `/resources/${a.type}/${a.id}` });
  }
  const { data: docs } = await supabase.from("res_documents").select(`*, b2s_offices(field_office), ${ASSET_TITLE_SELECT}`).is("deleted_at", null).lte("expires_on", horizon).limit(300);
  for (const d of docs ?? []) {
    const a = embeddedAssetTitle(d);
    if (!d.expires_on || daysUntil(d.expires_on) < -30) continue;
    expiring.push({
      kind: DOC_TYPES.find((x) => x.value === d.doc_type)?.label ?? "Document",
      title: `${d.title}${a.id ? ` · ${a.title}` : ""}`,
      office: (d as any).b2s_offices?.field_office ?? "",
      date: d.expires_on,
      days: daysUntil(d.expires_on),
      href: a.id ? `/resources/${a.type}/${a.id}` : "/resources",
    });
  }
  expiring.sort((a, b) => a.days - b.days);

  const { data: open } = await supabase.from("res_insurance_requests").select("status").in("status", OPEN_STATUSES);
  const openByStatus: Record<string, number> = {};
  for (const r of open ?? []) openByStatus[r.status] = (openByStatus[r.status] ?? 0) + 1;

  const { data: activity } = await supabase.from("res_activity").select(`id, action, summary, at, vehicle_id, property_id, driver_id, request_id, b2s_offices(field_office)`).order("at", { ascending: false }).limit(15);

  return NextResponse.json({
    counts,
    expiring: expiring.slice(0, 50),
    openByStatus,
    openTotal: (open ?? []).length,
    activity: (activity ?? []).map((a: any) => ({
      ...a,
      office: a.b2s_offices?.field_office ?? "",
      href: a.vehicle_id ? `/resources/vehicles/${a.vehicle_id}` : a.property_id ? `/resources/properties/${a.property_id}` : a.driver_id ? `/resources/drivers/${a.driver_id}` : a.request_id ? `/resources/requests/${a.request_id}` : null,
    })),
    me: { canManage: me.canManage, seesAll: me.seesAll, assignedOfficeId: me.assignedOfficeId },
  });
}
