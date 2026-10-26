import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { getInsightsAccess } from "@/lib/insightsAccess";
import { saveTarget } from "@/lib/goalAgreements";

export const dynamic = "force-dynamic";

const isDate = (s: string | null) => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);

// GET /api/admin/insights/profile?from=&to=
// Regional Profiles: facts by office × program × metric, volunteer headcounts,
// spending by billing office (finance tickets paid), goals & budgets for the
// year(s) in range, imported pre-portal history and per-state reference numbers.
// Area managers only ever receive their own office's rows.
export async function GET(req: NextRequest) {
  const access = await getInsightsAccess();
  if (!access.ok) return NextResponse.json({ error: "Not allowed" }, { status: access.status });

  const from = req.nextUrl.searchParams.get("from");
  const to = req.nextUrl.searchParams.get("to");
  if (!isDate(from) || !isDate(to) || from! > to!) return NextResponse.json({ error: "Bad date range" }, { status: 400 });
  const y0 = Number(from!.slice(0, 4));
  const y1 = Number(to!.slice(0, 4));

  const admin = createAdminClient();
  const [{ data, error }, { data: targets }, { data: history }, { data: reference }, { data: tickets }] = await Promise.all([
    admin.rpc("insights_profile", { p_from: from, p_to: to, p_region: access.lockedRegion }),
    admin.from("insights_targets").select("year, scope, scope_key, metric, amount").gte("year", y0).lte("year", y1),
    access.lockedOffice
      ? Promise.resolve({ data: [] as any[] })
      : admin.from("insights_history").select("year, scope, scope_key, metric, value, source").gte("year", y0).lte("year", y1),
    admin.from("insights_state_reference").select("state, muslim_population, mosques"),
    admin
      .from("finance_tickets")
      .select("billing_office_id, total")
      .eq("status", "processed")
      .gte("technician_ended_at", `${from}T00:00:00`)
      .lte("technician_ended_at", `${to}T23:59:59`)
      .limit(5000),
  ]);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const p = data as any;
  const spend: Record<string, number> = {};
  for (const t of tickets ?? []) spend[t.billing_office_id ?? ""] = (spend[t.billing_office_id ?? ""] ?? 0) + Number(t.total ?? 0);

  let facts = p.facts ?? [];
  let volunteers = p.volunteers;
  let scopedTargets = targets ?? [];
  let scopedSpend = spend;
  if (access.lockedOffice) {
    const id = access.lockedOffice;
    facts = facts.filter((f: any) => f.o === id);
    volunteers = {
      by_office: { [id]: volunteers.by_office?.[id] ?? 0 },
      by_state: {},
      by_region: {},
      total: volunteers.by_office?.[id] ?? 0,
      reported_by_office: { [id]: volunteers.reported_by_office?.[id] ?? 0 },
    };
    scopedTargets = scopedTargets.filter((t: any) => t.scope === "office" && t.scope_key === id);
    scopedSpend = { [id]: spend[id] ?? 0 };
  } else if (access.lockedRegion) {
    scopedTargets = scopedTargets.filter((t: any) => t.scope !== "org");
  }

  return NextResponse.json({
    facts,
    volunteers,
    targets: scopedTargets,
    history: history ?? [],
    spend: scopedSpend,
    reference: reference ?? [],
    canEdit: access.isAdmin,
    lockedOffice: access.lockedOffice,
  });
}

// POST (admins)
//   { action: "target", year, scope: "org"|"region"|"state"|"office", scope_key, metric, amount }   amount ""/null clears
//   { action: "reference", state, muslim_population, mosques }
export async function POST(req: Request) {
  const access = await getInsightsAccess();
  if (!access.ok || !access.isAdmin) return NextResponse.json({ error: "Admins only" }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const admin = createAdminClient();

  if (body.action === "target") {
    // Same path as Settings → Goals & Budgets, so office goals edited here
    // also send the area manager an agreement to sign.
    try {
      const r = await saveTarget({ year: Number(body.year), scope: String(body.scope), scope_key: String(body.scope_key ?? ""), metric: String(body.metric), amount: body.amount, actorId: access.employeeId });
      if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
      return NextResponse.json(r);
    } catch (e) {
      return NextResponse.json({ error: e instanceof Error ? e.message : "Saved, but the agreement couldn't be created" }, { status: 500 });
    }
  }

  if (body.action === "reference") {
    const state = String(body.state ?? "").toUpperCase();
    if (!/^[A-Z]{2}$/.test(state)) return NextResponse.json({ error: "Bad state" }, { status: 400 });
    const num = (v: unknown) => (v === "" || v === null || v === undefined ? null : Math.max(0, Math.round(Number(v))));
    const row = { state, muslim_population: num(body.muslim_population), mosques: num(body.mosques), updated_by: access.employeeId, updated_at: new Date().toISOString() };
    if ([row.muslim_population, row.mosques].some((v) => v !== null && !Number.isFinite(v))) return NextResponse.json({ error: "Enter whole numbers" }, { status: 400 });
    const { error } = await admin.from("insights_state_reference").upsert(row);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
