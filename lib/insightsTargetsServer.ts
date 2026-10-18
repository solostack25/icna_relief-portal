import { createAdminClient } from "@/lib/supabase/server";
import { computeActuals, type Fact, type Target } from "@/lib/insightsTargets";

// Goals, budgets and the actuals measured against them for one calendar year.
export async function loadTargetsWithActuals(year: number, opts: { region?: string | null; officeId?: string | null } = {}) {
  const admin = createAdminClient();
  const from = `${year}-01-01`;
  const to = `${year}-12-31`;
  const [{ data: profile }, { data: targets }, { data: offices }, spend] = await Promise.all([
    admin.rpc("insights_profile", { p_from: from, p_to: to, p_region: opts.region ?? null }),
    admin.from("insights_targets").select("year, scope, scope_key, metric, amount, note").eq("year", year),
    admin.from("b2s_offices").select("id, region, state"),
    (async () => {
      const out: Record<string, number> = {};
      for (let f = 0; ; f += 1000) {
        const { data } = await admin
          .from("finance_tickets")
          .select("billing_office_id, total")
          .eq("status", "processed")
          .gte("technician_ended_at", `${from}T00:00:00`)
          .lte("technician_ended_at", `${to}T23:59:59`)
          .range(f, f + 999);
        for (const t of data ?? []) out[t.billing_office_id ?? ""] = (out[t.billing_office_id ?? ""] ?? 0) + Number(t.total ?? 0);
        if ((data ?? []).length < 1000) break;
      }
      return out;
    })(),
  ]);
  let facts: Fact[] = ((profile as any)?.facts ?? []) as Fact[];
  if (opts.officeId) facts = facts.filter((f) => f.o === opts.officeId);
  const spendScoped = opts.officeId ? { [opts.officeId]: spend[opts.officeId] ?? 0 } : spend;
  const actuals = computeActuals(facts, (offices ?? []) as any, spendScoped);
  return { targets: (targets ?? []) as Target[], actuals: Object.fromEntries(actuals) };
}
