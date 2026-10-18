import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { getReportsAccess } from "@/lib/reportsAccess";

export const dynamic = "force-dynamic";

const isDate = (s: string | null) => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);

// GET /api/admin/insights/profile?from=&to=
// Regional Profiles: facts by office × program × metric, volunteer headcounts,
// goals for the year(s) in range, and per-state community reference numbers.
export async function GET(req: NextRequest) {
  const access = await getReportsAccess();
  if (!access.ok) return NextResponse.json({ error: "Unauthorized" }, { status: access.status });
  let region: string | null = null;
  if (access.role === "regional_director") {
    if (!access.assignedRegion) return NextResponse.json({ error: "No region assigned" }, { status: 403 });
    region = access.assignedRegion;
  } else if (!access.isAdmin && access.role !== "program_director") {
    return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  }

  const from = req.nextUrl.searchParams.get("from");
  const to = req.nextUrl.searchParams.get("to");
  if (!isDate(from) || !isDate(to) || from! > to!) return NextResponse.json({ error: "Bad date range" }, { status: 400 });

  const admin = createAdminClient();
  const [{ data, error }, { data: goals }, { data: reference }] = await Promise.all([
    admin.rpc("insights_profile", { p_from: from, p_to: to, p_region: region }),
    admin.from("insights_goals").select("year, scope, scope_key, metric, amount").gte("year", Number(from!.slice(0, 4))).lte("year", Number(to!.slice(0, 4))),
    admin.from("insights_state_reference").select("state, muslim_population, mosques"),
  ]);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ...(data as object), goals: goals ?? [], reference: reference ?? [], canEdit: access.isAdmin });
}

// POST (admins)
//   { action: "goal", year, scope: "org"|"region"|"state", scope_key, amount }   amount null/"" clears
//   { action: "reference", state, muslim_population, mosques }
export async function POST(req: Request) {
  const access = await getReportsAccess();
  if (!access.ok || !access.isAdmin) return NextResponse.json({ error: "Admins only" }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const admin = createAdminClient();

  if (body.action === "goal") {
    const year = Number(body.year);
    const scope = String(body.scope);
    const scope_key = scope === "org" ? "" : String(body.scope_key ?? "").trim();
    if (!(year >= 2000 && year <= 2100) || !["org", "region", "state"].includes(scope) || (scope !== "org" && !scope_key)) {
      return NextResponse.json({ error: "Bad goal" }, { status: 400 });
    }
    if (body.amount === null || body.amount === "") {
      const { error } = await admin.from("insights_goals").delete().match({ year, scope, scope_key, metric: "value_of_services" });
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ ok: true });
    }
    const amount = Number(body.amount);
    if (!(amount >= 0)) return NextResponse.json({ error: "Enter a dollar amount" }, { status: 400 });
    const { error } = await admin
      .from("insights_goals")
      .upsert({ year, scope, scope_key, metric: "value_of_services", amount, updated_by: access.employeeId, updated_at: new Date().toISOString() });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
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
