import { NextRequest, NextResponse } from "next/server";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { loadTargetsWithActuals } from "@/lib/insightsTargetsServer";

export const dynamic = "force-dynamic";

const METRICS = ["fundraising", "value_of_services", "people_served", "budget"];
const SCOPES = ["org", "region", "state", "office"];

async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: me } = await supabase.from("employees").select("id, role").eq("auth_user_id", user.id).maybeSingle();
  return me?.role === "admin" ? me : null;
}

// GET ?year=2026 → targets + actuals for every org/region/office, plus how
// many targets last year had (for "copy from last year").
export async function GET(req: NextRequest) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Admins only" }, { status: 403 });
  const year = Number(req.nextUrl.searchParams.get("year")) || new Date().getFullYear();
  const admin = createAdminClient();
  const [{ targets, actuals }, { count: lastYearCount }] = await Promise.all([
    loadTargetsWithActuals(year),
    admin.from("insights_targets").select("year", { count: "exact", head: true }).eq("year", year - 1),
  ]);
  return NextResponse.json({ year, targets, actuals, lastYearCount: lastYearCount ?? 0 });
}

// POST { action: "set", year, scope, scope_key, metric, amount }   amount ""/null clears
// POST { action: "copy", year }   copies last year's targets into blank cells
export async function POST(req: Request) {
  const me = await requireAdmin();
  if (!me) return NextResponse.json({ error: "Admins only" }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const admin = createAdminClient();
  const year = Number(body.year);
  if (!(year >= 2000 && year <= 2100)) return NextResponse.json({ error: "Bad year" }, { status: 400 });

  if (body.action === "set") {
    const scope = String(body.scope);
    const metric = String(body.metric);
    const scope_key = scope === "org" ? "" : String(body.scope_key ?? "").trim();
    if (!SCOPES.includes(scope) || !METRICS.includes(metric) || (scope !== "org" && !scope_key)) return NextResponse.json({ error: "Bad target" }, { status: 400 });
    if (body.amount === null || body.amount === "" || body.amount === undefined) {
      const { error } = await admin.from("insights_targets").delete().match({ year, scope, scope_key, metric });
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ ok: true, cleared: true });
    }
    const amount = Number(String(body.amount).replace(/[$,\s]/g, ""));
    if (!Number.isFinite(amount) || amount < 0) return NextResponse.json({ error: "Enter a number" }, { status: 400 });
    const { error } = await admin
      .from("insights_targets")
      .upsert({ year, scope, scope_key, metric, amount, updated_by: me.id, updated_at: new Date().toISOString() });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (body.action === "copy") {
    const [{ data: prev }, { data: cur }] = await Promise.all([
      admin.from("insights_targets").select("scope, scope_key, metric, amount").eq("year", year - 1),
      admin.from("insights_targets").select("scope, scope_key, metric").eq("year", year),
    ]);
    const have = new Set((cur ?? []).map((t: any) => `${t.scope}|${t.scope_key}|${t.metric}`));
    const rows = (prev ?? [])
      .filter((t: any) => !have.has(`${t.scope}|${t.scope_key}|${t.metric}`))
      .map((t: any) => ({ ...t, year, updated_by: me.id, updated_at: new Date().toISOString(), note: `Copied from ${year - 1}` }));
    if (rows.length) {
      const { error } = await admin.from("insights_targets").insert(rows);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true, copied: rows.length });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
