import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { ASSETS, isAssetType } from "@/lib/resources/schema";
import { getResourcesUser } from "@/lib/resources/access";
import { friendlyDbError } from "@/lib/resources/db";
import { notifyResources } from "@/lib/resources/notify";

// Add an insurance policy period (cost, dates, provider) to an asset.
export async function POST(request: NextRequest, { params }: { params: Promise<{ type: string; id: string }> }) {
  const { type, id } = await params;
  if (!isAssetType(type)) return NextResponse.json({ error: "Unknown type" }, { status: 404 });
  const supabase = await createClient();
  const me = await getResourcesUser(supabase);
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const cfg = ASSETS[type];
  const { data: asset } = await supabase.from(cfg.table).select("*").eq("id", id).maybeSingle();
  if (!asset) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const b = (await request.json().catch(() => ({}))) as Record<string, any>;
  const s = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
  const provider = s(b.provider);
  if (!provider) return NextResponse.json({ error: "Insurance provider is required." }, { status: 400 });
  const premium = b.premium === "" || b.premium == null ? null : Number(b.premium);
  const row = {
    office_id: asset.office_id,
    [cfg.fk]: id,
    provider,
    policy_number: s(b.policy_number),
    coverage_type: s(b.coverage_type),
    policy_year: b.policy_year ? Number(b.policy_year) : s(b.coverage_start) ? Number(String(b.coverage_start).slice(0, 4)) : null,
    coverage_start: s(b.coverage_start),
    coverage_end: s(b.coverage_end),
    renewal_date: s(b.renewal_date),
    premium: Number.isFinite(premium as number) ? premium : null,
    notes: s(b.notes),
  };
  const { error } = await supabase.from("res_insurance_policies").insert(row);
  if (error) return NextResponse.json({ error: friendlyDbError(error) }, { status: 400 });

  await supabase.from("res_activity").insert({
    office_id: asset.office_id,
    [cfg.fk]: id,
    action: "policy_added",
    summary: `Insurance policy added: ${provider}${row.coverage_start ? ` (${row.coverage_start} to ${row.coverage_end ?? "…"})` : ""}`,
  });
  await notifyResources({
    event: "policy_added",
    officeId: asset.office_id,
    subject: `Insurance policy added: ${cfg.title(asset)}`,
    heading: "An insurance policy period was added",
    rows: [
      [cfg.singular, cfg.title(asset)],
      ["Provider", provider],
      ["Policy number", row.policy_number],
      ["Coverage", row.coverage_start ? `${row.coverage_start} to ${row.coverage_end ?? "…"}` : null],
      ["Renewal date", row.renewal_date],
      ["Premium", row.premium != null ? `$${row.premium.toLocaleString("en-US", { minimumFractionDigits: 2 })}` : null],
      ["Added by", me.name || me.email],
    ],
    path: `/resources/${type}/${id}`,
    related: { type, id },
  });
  return NextResponse.json({ ok: true });
}
