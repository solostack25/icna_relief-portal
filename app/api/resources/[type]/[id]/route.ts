import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { ASSETS, isAssetType, pickFields } from "@/lib/resources/schema";
import { getResourcesUser } from "@/lib/resources/access";
import { friendlyDbError } from "@/lib/resources/db";
import { notifyResources } from "@/lib/resources/notify";

type P = { params: Promise<{ type: string; id: string }> };

export async function GET(_req: NextRequest, { params }: P) {
  const { type, id } = await params;
  if (!isAssetType(type)) return NextResponse.json({ error: "Unknown type" }, { status: 404 });
  const supabase = await createClient();
  const me = await getResourcesUser(supabase);
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const cfg = ASSETS[type];

  const { data: asset, error } = await supabase.from(cfg.table).select("*, b2s_offices(field_office, region)").eq("id", id).maybeSingle();
  if (error) return NextResponse.json({ error: friendlyDbError(error) }, { status: 500 });
  if (!asset) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const [policies, documents, requests, activity, drivers, canWrite] = await Promise.all([
    supabase.from("res_insurance_policies").select("*").eq(cfg.fk, id).order("coverage_start", { ascending: false, nullsFirst: false }),
    supabase.from("res_documents").select("*").eq(cfg.fk, id).is("deleted_at", null).order("uploaded_at", { ascending: false }),
    supabase.from("res_insurance_requests").select("id, ticket_number, request_type, status, created_at").eq(cfg.fk, id).order("created_at", { ascending: false }),
    supabase.from("res_activity").select("id, action, summary, at").eq(cfg.fk, id).order("at", { ascending: false }).limit(50),
    type === "vehicles"
      ? supabase.from("res_drivers").select("id, full_name").eq("office_id", asset.office_id).eq("status", "active").order("full_name")
      : Promise.resolve({ data: [] as { id: string; full_name: string }[] }),
    supabase.rpc("res_can_write_office", { p_office: asset.office_id }),
  ]);

  return NextResponse.json({
    asset: { ...asset, office_name: (asset as any).b2s_offices?.field_office ?? "", title: cfg.title(asset) },
    policies: policies.data ?? [],
    documents: documents.data ?? [],
    requests: requests.data ?? [],
    activity: activity.data ?? [],
    drivers: drivers.data ?? [],
    canWrite: !!canWrite.data,
    canManage: me.canManage,
  });
}

export async function PATCH(request: NextRequest, { params }: P) {
  const { type, id } = await params;
  if (!isAssetType(type)) return NextResponse.json({ error: "Unknown type" }, { status: 404 });
  const supabase = await createClient();
  const me = await getResourcesUser(supabase);
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const cfg = ASSETS[type];
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;

  const { data: before } = await supabase.from(cfg.table).select("*").eq("id", id).maybeSingle();
  if (!before) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (body.action === "remove") {
    const reason = String(body.removed_reason ?? "").trim();
    if (!reason) return NextResponse.json({ error: "Please give a reason for removing it." }, { status: 400 });
    const removedOn = String(body.removed_on ?? "") || new Date().toISOString().slice(0, 10);
    const { error } = await supabase.from(cfg.table).update({ status: "removed", removed_on: removedOn, removed_reason: reason }).eq("id", id);
    if (error) return NextResponse.json({ error: friendlyDbError(error) }, { status: 400 });
    await notifyResources({
      event: "asset_removed",
      officeId: before.office_id,
      subject: `${cfg.singular} removed: ${cfg.title(before)}`,
      heading: `A ${cfg.singular.toLowerCase()} was removed`,
      rows: [
        [cfg.singular, cfg.title(before)],
        ["Effective date", removedOn],
        ["Reason", reason],
        ["Removed by", me.name || me.email],
        ["Required action", "Remove from insurance coverage (a removal request was created)"],
      ],
      path: `/resources/${type}/${id}`,
      related: { type, id },
    });
    return NextResponse.json({ ok: true });
  }

  const patch = pickFields(cfg, body);
  const changed = Object.keys(patch).filter((k) => String(patch[k] ?? "") !== String((before as any)[k] ?? ""));
  if (!changed.length) return NextResponse.json({ ok: true, changed: 0 });
  const { error } = await supabase.from(cfg.table).update(patch).eq("id", id);
  if (error) return NextResponse.json({ error: friendlyDbError(error) }, { status: 400 });

  const labels = changed.map((k) => cfg.fields.find((f) => f.key === k)?.label ?? k);
  await supabase.from("res_activity").insert({
    office_id: before.office_id,
    [cfg.fk]: id,
    action: `${type.slice(0, -1).replace("ie", "y")}_updated`,
    summary: `Updated ${labels.join(", ")}`,
    details: Object.fromEntries(changed.map((k) => [k, { from: (before as any)[k], to: patch[k] }])),
  });
  await notifyResources({
    event: "asset_updated",
    officeId: before.office_id,
    subject: `${cfg.singular} updated: ${cfg.title({ ...before, ...patch })}`,
    heading: `A ${cfg.singular.toLowerCase()} record was changed`,
    rows: [
      [cfg.singular, cfg.title({ ...before, ...patch })],
      ...changed.map((k) => [cfg.fields.find((f) => f.key === k)?.label ?? k, `${(before as any)[k] ?? "—"} → ${patch[k] ?? "—"}`] as [string, string]),
      ["Changed by", me.name || me.email],
    ],
    path: `/resources/${type}/${id}`,
    related: { type, id, changed },
  });
  return NextResponse.json({ ok: true, changed: changed.length });
}
