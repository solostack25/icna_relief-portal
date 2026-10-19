import { createAdminClient } from "@/lib/supabase/server";
import { buildReport } from "@/lib/reportsSuite/build";
import type { ReportPayload, Unit } from "@/lib/reportsSuite/catalog";
import { executeDax, firstNumber, getPowerBiConfig, PowerBiError } from "@/lib/powerbi";

// Temporary: compares each configured metric's portal number (a KPI tile
// from the Reports suite) with its Power BI number (a DAX query), for one
// year or one month. Every run is stored in pbi_compare_runs.

export type Metric = {
  id: string;
  label: string;
  report_key: string;
  kpi_label: string;
  dataset_id: string;
  dataset_name: string | null;
  dax: string;
  tolerance_pct: number;
  is_active: boolean;
  sort: number;
  notes: string | null;
};

export type Period = { year: number; month: number | null };

export type CompareResult = {
  metricId: string;
  label: string;
  unit: Unit | null;
  portal: number | null;
  pbi: number | null;
  portalError: string | null;
  pbiError: string | null;
  diff: number | null;
  diffPct: number | null;
  status: "match" | "close" | "off" | "error" | "not-run";
  runAt: string | null;
};

// {year}, {start}, {end} -> values for the period. {start}/{end} are DAX
// DATE() expressions so they drop straight into a filter, e.g.
//   'Donations'[Date] >= {start} && 'Donations'[Date] <= {end}
export function fillDax(dax: string, p: Period): string {
  const lastDay = p.month ? new Date(Date.UTC(p.year, p.month, 0)).getUTCDate() : 31;
  const start = `DATE(${p.year}, ${p.month ?? 1}, 1)`;
  const end = `DATE(${p.year}, ${p.month ?? 12}, ${lastDay})`;
  return dax.replaceAll("{year}", String(p.year)).replaceAll("{start}", start).replaceAll("{end}", end);
}

export function classify(portal: number | null, pbi: number | null, tolerancePct: number): CompareResult["status"] {
  if (portal == null || pbi == null) return "error";
  if (portal === pbi) return "match";
  const base = Math.max(Math.abs(pbi), Math.abs(portal));
  const pct = base === 0 ? 0 : (Math.abs(portal - pbi) / base) * 100;
  if (pct <= tolerancePct) return "match";
  if (pct <= Math.max(5, tolerancePct * 5)) return "close";
  return "off";
}

type RunRow = { portal_value: number | null; pbi_value: number | null; portal_error: string | null; pbi_error: string | null; unit: string | null; run_at: string };

function toResult(m: Metric, run: RunRow | null): CompareResult {
  const unit = (run?.unit as Unit | null) ?? null;
  if (!run) {
    return { metricId: m.id, label: m.label, unit, portal: null, pbi: null, portalError: null, pbiError: null, diff: null, diffPct: null, status: "not-run", runAt: null };
  }
  const portal = run.portal_value == null ? null : Number(run.portal_value);
  const pbi = run.pbi_value == null ? null : Number(run.pbi_value);
  const diff = portal != null && pbi != null ? portal - pbi : null;
  const diffPct = diff != null && pbi ? (diff / Math.abs(pbi)) * 100 : null;
  return {
    metricId: m.id,
    label: m.label,
    unit,
    portal,
    pbi,
    portalError: run.portal_error,
    pbiError: run.pbi_error,
    diff,
    diffPct,
    status: classify(portal, pbi, Number(m.tolerance_pct)),
    runAt: run.run_at,
  };
}

function findKpi(payload: ReportPayload, label: string) {
  const want = label.trim().toLowerCase();
  return payload.kpis.find((k) => k.label.trim().toLowerCase() === want) ?? null;
}

// Portal numbers for every metric, building each report once.
async function portalValues(metrics: Metric[], p: Period) {
  const reports = new Map<string, Promise<ReportPayload>>();
  const out = new Map<string, { value: number | null; unit: Unit | null; error: string | null }>();
  for (const m of metrics) {
    if (!reports.has(m.report_key)) {
      reports.set(
        m.report_key,
        buildReport(m.report_key, { year: p.year, month: p.month, region: null, state: null, office: null, program: null, lockedRegion: null, lockedOffice: null })
      );
    }
    try {
      const payload = await reports.get(m.report_key)!;
      const kpi = findKpi(payload, m.kpi_label);
      if (!kpi) out.set(m.id, { value: null, unit: null, error: `No "${m.kpi_label}" tile in this report` });
      else out.set(m.id, { value: kpi.value, unit: kpi.unit, error: kpi.value == null ? "Tile has no value yet" : null });
    } catch (e) {
      out.set(m.id, { value: null, unit: null, error: e instanceof Error ? e.message : String(e) });
    }
  }
  return out;
}

export async function runComparison(p: Period, trigger: "manual" | "cron", onlyMetricId?: string): Promise<CompareResult[]> {
  const admin = createAdminClient();
  let q = admin.from("pbi_compare_metrics").select("*").eq("is_active", true).order("sort").order("label");
  if (onlyMetricId) q = q.eq("id", onlyMetricId);
  const { data } = await q;
  const metrics = (data ?? []) as Metric[];
  if (!metrics.length) return [];

  const cfg = await getPowerBiConfig();
  const portal = await portalValues(metrics, p);

  const rows = [];
  // Sequential on purpose: Power BI allows 120 queries a minute and the
  // list is short.
  for (const m of metrics) {
    let pbiValue: number | null = null;
    let pbiError: string | null = null;
    if (!cfg) pbiError = "Power BI isn't connected (Settings → Connectors → Power BI)";
    else {
      try {
        pbiValue = firstNumber(await executeDax(cfg, m.dataset_id, fillDax(m.dax, p)));
        if (pbiValue == null) pbiError = "Query returned no number";
      } catch (e) {
        pbiError = e instanceof PowerBiError || e instanceof Error ? e.message : String(e);
      }
    }
    const pv = portal.get(m.id)!;
    rows.push({
      metric_id: m.id,
      year: p.year,
      month: p.month,
      portal_value: pv.value,
      pbi_value: pbiValue,
      portal_error: pv.error,
      pbi_error: pbiError,
      unit: pv.unit,
      triggered_by: trigger,
    });
  }

  const { data: inserted, error } = await admin.from("pbi_compare_runs").insert(rows).select("metric_id, portal_value, pbi_value, portal_error, pbi_error, unit, run_at");
  if (error) throw new Error(error.message);
  const byMetric = new Map(((inserted ?? []) as (RunRow & { metric_id: string })[]).map((r) => [r.metric_id as string, r]));
  return metrics.map((m) => toResult(m, (byMetric.get(m.id) as RunRow | undefined) ?? null));
}

// Latest stored result per metric for a period, plus each metric's recent
// history (newest first) so the page can show whether the gap is closing.
export async function latestResults(p: Period) {
  const admin = createAdminClient();
  const { data: metricRows } = await admin.from("pbi_compare_metrics").select("*").order("sort").order("label");
  const metrics = (metricRows ?? []) as Metric[];
  if (!metrics.length) return { metrics, results: [] as CompareResult[], history: {} as Record<string, { run_at: string; portal: number | null; pbi: number | null }[]> };

  let q = admin
    .from("pbi_compare_runs")
    .select("metric_id, portal_value, pbi_value, portal_error, pbi_error, unit, run_at")
    .in("metric_id", metrics.map((m) => m.id))
    .eq("year", p.year)
    .order("run_at", { ascending: false })
    .limit(2000);
  q = p.month ? q.eq("month", p.month) : q.is("month", null);
  const { data: runs } = await q;

  const history: Record<string, { run_at: string; portal: number | null; pbi: number | null }[]> = {};
  const latest = new Map<string, NonNullable<typeof runs>[number]>();
  for (const r of runs ?? []) {
    const id = r.metric_id as string;
    if (!latest.has(id)) latest.set(id, r);
    (history[id] ??= []);
    if (history[id].length < 30) {
      history[id].push({ run_at: r.run_at, portal: r.portal_value == null ? null : Number(r.portal_value), pbi: r.pbi_value == null ? null : Number(r.pbi_value) });
    }
  }

  const results = metrics.filter((m) => m.is_active).map((m) => toResult(m, (latest.get(m.id) as RunRow | undefined) ?? null));
  return { metrics, results, history };
}
