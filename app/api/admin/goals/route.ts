import { NextRequest, NextResponse } from "next/server";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { loadTargetsWithActuals } from "@/lib/insightsTargetsServer";
import { agreementsForYear, createAgreements, requestSignature, resendAgreement, saveTarget, METRICS } from "@/lib/goalAgreements";
import type { TargetMetric } from "@/lib/insightsTargets";

export const dynamic = "force-dynamic";

async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: me } = await supabase.from("employees").select("id, role").eq("auth_user_id", user.id).maybeSingle();
  return me?.role === "admin" ? me : null;
}

// GET ?year=2026 → targets + actuals for every org/region/office, office goal
// agreements (with signer names), and how many targets last year had.
export async function GET(req: NextRequest) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Admins only" }, { status: 403 });
  const year = Number(req.nextUrl.searchParams.get("year")) || new Date().getFullYear();
  const admin = createAdminClient();
  const [{ targets, actuals }, { count: lastYearCount }, agreements] = await Promise.all([
    loadTargetsWithActuals(year),
    admin.from("insights_targets").select("year", { count: "exact", head: true }).eq("year", year - 1),
    agreementsForYear(year),
  ]);
  const ids = Array.from(new Set(agreements.flatMap((a) => [a.created_by, a.signed_by]).filter(Boolean))) as string[];
  const names: Record<string, string> = {};
  if (ids.length) {
    const { data } = await admin.from("employees").select("id, first_name, last_name").in("id", ids);
    for (const e of data ?? []) names[e.id as string] = `${e.first_name ?? ""} ${e.last_name ?? ""}`.trim();
  }
  return NextResponse.json({
    year,
    targets,
    actuals,
    lastYearCount: lastYearCount ?? 0,
    agreements: agreements.map((a) => ({ ...a, created_by_name: a.created_by ? names[a.created_by] ?? null : null })),
  });
}

// POST { action: "set", year, scope, scope_key, metric, amount }   amount ""/null clears
// POST { action: "copy", year }                      copies last year's targets into blank cells
// POST { action: "resend", id }                      re-sends an unsigned office goal agreement
// POST { action: "request", year, office_id, metric } sends an agreement for a goal that has none
export async function POST(req: Request) {
  const me = await requireAdmin();
  if (!me) return NextResponse.json({ error: "Admins only" }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const admin = createAdminClient();

  if (body.action === "resend") {
    const r = await resendAgreement(String(body.id ?? ""));
    return NextResponse.json(r, { status: r.ok ? 200 : 400 });
  }

  const year = Number(body.year);
  if (!(year >= 2000 && year <= 2100)) return NextResponse.json({ error: "Bad year" }, { status: 400 });

  if (body.action === "set") {
    try {
      const r = await saveTarget({ year, scope: String(body.scope), scope_key: String(body.scope_key ?? ""), metric: String(body.metric), amount: body.amount, actorId: me.id });
      if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
      return NextResponse.json(r);
    } catch (e) {
      return NextResponse.json({ error: e instanceof Error ? e.message : "Saved, but the agreement couldn't be created" }, { status: 500 });
    }
  }

  if (body.action === "request") {
    const metric = String(body.metric) as TargetMetric;
    if (!METRICS.includes(metric) || !body.office_id) return NextResponse.json({ error: "Bad goal" }, { status: 400 });
    const r = await requestSignature(year, String(body.office_id), metric, me.id);
    return NextResponse.json(r, { status: r.ok ? 200 : 400 });
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
    // One agreement email per office covering all of its copied goals.
    const byOffice = new Map<string, { metric: TargetMetric; amount: number; previous: null }[]>();
    for (const r of rows.filter((r: any) => r.scope === "office")) {
      const list = byOffice.get(r.scope_key) ?? [];
      list.push({ metric: r.metric, amount: Number(r.amount), previous: null });
      byOffice.set(r.scope_key, list);
    }
    let sent = 0;
    for (const [officeId, items] of byOffice) {
      try {
        await createAgreements(officeId, year, items, me.id);
        sent++;
      } catch {
        /* the goal is saved; the page shows it with no agreement and a Send button */
      }
    }
    return NextResponse.json({ ok: true, copied: rows.length, officesEmailed: sent });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
