import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { ASSETS, isAssetType, missingRequired, pickFields } from "@/lib/resources/schema";
import { getResourcesUser } from "@/lib/resources/access";
import { friendlyDbError, toCsv } from "@/lib/resources/db";
import { notifyResources } from "@/lib/resources/notify";

export async function GET(request: NextRequest, { params }: { params: Promise<{ type: string }> }) {
  const { type } = await params;
  if (!isAssetType(type)) return NextResponse.json({ error: "Unknown type" }, { status: 404 });
  const supabase = await createClient();
  const me = await getResourcesUser(supabase);
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const cfg = ASSETS[type];
  const sp = request.nextUrl.searchParams;
  const status = sp.get("status") ?? "active";

  let q = supabase.from(cfg.table).select("*, b2s_offices(field_office, region, state)").order("created_at", { ascending: false }).limit(2000);
  if (status !== "all") q = q.eq("status", status);
  if (sp.get("office")) q = q.eq("office_id", sp.get("office")!);
  const { data, error } = await q;
  if (error) return NextResponse.json({ error: friendlyDbError(error) }, { status: 500 });

  const term = (sp.get("q") ?? "").trim().toLowerCase();
  const rows = (data ?? [])
    .map((r: any) => ({ ...r, office_name: r.b2s_offices?.field_office ?? "", region: r.b2s_offices?.region ?? "", title: cfg.title(r) }))
    .filter((r) => !term || JSON.stringify(r).toLowerCase().includes(term));

  if (sp.get("format") === "csv") {
    const cols = [
      { key: "office_name", label: "Office" },
      { key: "region", label: "Region" },
      ...cfg.fields.filter((f) => f.kind !== "driver").map((f) => ({ key: f.key, label: f.label })),
      { key: "status", label: "Status" },
      { key: "removed_on", label: "Removed on" },
      { key: "removed_reason", label: "Removed reason" },
      { key: "created_at", label: "Added" },
    ];
    return new NextResponse(toCsv(rows, cols), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${type}-${new Date().toISOString().slice(0, 10)}.csv"`,
      },
    });
  }
  return NextResponse.json({ rows });
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ type: string }> }) {
  const { type } = await params;
  if (!isAssetType(type)) return NextResponse.json({ error: "Unknown type" }, { status: 404 });
  const supabase = await createClient();
  const me = await getResourcesUser(supabase);
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const cfg = ASSETS[type];
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;

  const officeId = (me.canManage ? (body.office_id as string) : me.assignedOfficeId) ?? null;
  if (!officeId) return NextResponse.json({ error: "Choose an office." }, { status: 400 });
  const row = { ...pickFields(cfg, body), office_id: officeId };
  const missing = missingRequired(cfg, row);
  if (missing.length) return NextResponse.json({ error: `Please fill in: ${missing.join(", ")}.` }, { status: 400 });

  const { data, error } = await supabase.from(cfg.table).insert(row).select("*").single();
  if (error) return NextResponse.json({ error: friendlyDbError(error) }, { status: 400 });

  const { data: ticket } = await supabase.from("res_insurance_requests").select("ticket_number").eq(cfg.fk, data.id).order("created_at", { ascending: false }).limit(1).maybeSingle();
  await notifyResources({
    event: "asset_added",
    officeId,
    subject: `${cfg.singular} added: ${cfg.title(data)}`,
    heading: `A ${cfg.singular.toLowerCase()} was added`,
    rows: [
      [cfg.singular, cfg.title(data)],
      ["Effective date", new Date().toISOString().slice(0, 10)],
      ["Added by", me.name || me.email],
      ["Required action", ticket ? `Complete insurance request ${ticket.ticket_number}` : "Review the new record"],
    ],
    path: `/resources/${type}/${data.id}`,
    related: { type, id: data.id },
  });
  return NextResponse.json({ id: data.id, ticket: ticket?.ticket_number ?? null });
}
