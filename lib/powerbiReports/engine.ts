import { createAdminClient } from "@/lib/supabase/server";
import { getIntegrationSetting } from "@/lib/integrationSettings";
import { executeDax, getPowerBiConfig, lastRefresh, listDatasets, PowerBiError, type PowerBiConfig, type QueryRow } from "@/lib/powerbi";
import { REPORT, type Chart, type Kpi, type Matrix, type MatrixRow, type ReportPayload } from "@/lib/reportsSuite/catalog";
import { REGION_ORDER } from "@/lib/reportsSuite/build";
import { PBI_REPORTS, SHARED_MAP } from "./specs";
import type { ChartSpec, KpiSpec, MatrixSpec, ModelMap, PbiReportSpec, TimeShift } from "./types";

export type PbiFilters = {
  year: number;
  month: number | null;
  region: string | null;
  state: string | null;
  officeId: string | null;
  program: string | null;
};

type Run = { cfg: PowerBiConfig; datasetId: string; map: ModelMap; f: PbiFilters; officeName: string | null };

export function isMapped(key: string): boolean {
  const spec = PBI_REPORTS[key];
  return !!spec && !!(spec.kpis?.length || spec.matrices?.length || spec.charts?.length);
}

// ─── DAX helpers ────────────────────────────────────────────────────────────

const str = (v: string) => `"${v.replace(/"/g, '""')}"`;
// 'Table'[Column] -> Column, [Measure] -> Measure (how executeDax names them)
const colName = (ref: string) => ref.replace(/^.*\[(.*)\]$/, "$1");

function timeFilters(map: ModelMap, f: PbiFilters, t: TimeShift = {}): string[] {
  if (t.noTime) return [];
  const y = f.year + (t.yearOffset ?? 0);
  const m = t.wholeYear ? null : f.month;
  if (map.date) {
    const last = m ? new Date(Date.UTC(y, m, 0)).getUTCDate() : 31;
    const d = map.date;
    return [`FILTER(ALL(${d}), ${d} >= DATE(${y}, ${m ?? 1}, 1) && ${d} <= DATE(${y}, ${m ?? 12}, ${last}))`];
  }
  const out: string[] = [];
  if (map.year) out.push(`TREATAS({${y}}, ${map.year})`);
  if (map.month && m) out.push(`TREATAS({${m}}, ${map.month})`);
  return out;
}

function scopeFilters(run: Run): string[] {
  const { map, f } = run;
  const out: string[] = [];
  if (map.region && f.region) out.push(`TREATAS({${str(f.region)}}, ${map.region})`);
  if (map.state && f.state) out.push(`TREATAS({${str(f.state)}}, ${map.state})`);
  if (map.office && run.officeName) out.push(`TREATAS({${str(run.officeName)}}, ${map.office})`);
  if (map.program && f.program) out.push(`TREATAS({${str(f.program)}}, ${map.program})`);
  return out;
}

const calc = (expr: string, filters: string[]) => (filters.length ? `CALCULATE(${expr}, ${filters.join(", ")})` : `CALCULATE(${expr})`);
const num = (v: unknown) => (v == null || v === "" ? null : Number.isFinite(Number(v)) ? Number(v) : null);

// Identical queries within a few minutes (several people opening the same
// report) reuse the answer instead of spending Power BI's 120/minute.
const cache = new Map<string, { at: number; rows: QueryRow[] }>();
async function q(run: Run, dax: string): Promise<QueryRow[]> {
  const key = `${run.datasetId}\n${dax}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < 5 * 60_000) return hit.rows;
  const rows = await executeDax(run.cfg, run.datasetId, dax);
  cache.set(key, { at: Date.now(), rows });
  if (cache.size > 500) cache.delete(cache.keys().next().value!);
  return rows;
}

// ─── Builders ───────────────────────────────────────────────────────────────

async function buildKpis(run: Run, kpis: KpiSpec[]): Promise<Kpi[]> {
  if (!kpis.length) return [];
  const scope = scopeFilters(run);
  const cols = kpis.map((k, i) => `"k${i}", ${calc(k.expr, [...timeFilters(run.map, run.f, k), ...scope])}`);
  const [row] = await q(run, `EVALUATE ROW(${cols.join(", ")})`);
  return kpis.map((k, i) => ({ label: k.label, unit: k.unit, value: num(row?.[`k${i}`]), sub: k.sub }));
}

const yearLabel = (label: string, year: number) => label.replace(/\{year([+-]\d+)?\}/g, (_, off) => String(year + (off ? Number(off) : 0)));

async function buildMatrix(run: Run, m: MatrixSpec): Promise<Matrix> {
  const scope = scopeFilters(run);
  const measures = m.columns.map((c, i) => `"c${i}", ${calc(c.expr, timeFilters(run.map, run.f, c))}`);
  const filterArgs = scope.length ? `, ${scope.join(", ")}` : "";
  const [rows, totalRows] = await Promise.all([
    q(run, `EVALUATE SUMMARIZECOLUMNS(${m.dim}${filterArgs}, ${measures.join(", ")})`),
    m.total ? q(run, `EVALUATE ROW(${m.columns.map((c, i) => `"c${i}", ${calc(c.expr, [...timeFilters(run.map, run.f, c), ...scope])}`).join(", ")})`) : Promise.resolve([]),
  ]);

  const dimKey = colName(m.dim);
  let out: MatrixRow[] = rows.map((r) => {
    const label = r[dimKey] == null || r[dimKey] === "" ? "(blank)" : String(r[dimKey]);
    return { key: label, label, values: Object.fromEntries(m.columns.map((c, i) => [c.key, num(r[`c${i}`])])) };
  });
  const first = m.columns[0]?.key;
  if (m.order === "regions") {
    const pos = (l: string) => {
      const i = REGION_ORDER.indexOf(l.toUpperCase());
      return i === -1 ? 999 : i;
    };
    out.sort((a, b) => pos(a.label) - pos(b.label) || a.label.localeCompare(b.label));
  } else if (m.order === "label") out.sort((a, b) => a.label.localeCompare(b.label));
  else if (first) out.sort((a, b) => (b.values[first] ?? -Infinity) - (a.values[first] ?? -Infinity));
  if (m.limit) out = out.slice(0, m.limit);

  return {
    title: m.title,
    dim: m.dimLabel,
    note: m.note,
    columns: m.columns.map((c) => ({ key: c.key, label: yearLabel(c.label, run.f.year), unit: c.unit })),
    rows: out,
    total: m.total && totalRows[0] ? Object.fromEntries(m.columns.map((c, i) => [c.key, num(totalRows[0][`c${i}`])])) : undefined,
  };
}

async function buildChart(run: Run, c: ChartSpec): Promise<Chart> {
  const scope = scopeFilters(run);
  if (c.kind === "share") {
    const filterArgs = scope.length ? `, ${scope.join(", ")}` : "";
    const rows = await q(run, `EVALUATE SUMMARIZECOLUMNS(${c.dim}${filterArgs}, "v", ${calc(c.expr, timeFilters(run.map, run.f, c))})`);
    const dimKey = colName(c.dim);
    const items = rows
      .map((r) => ({ label: r[dimKey] == null ? "(blank)" : String(r[dimKey]), value: num(r.v) ?? 0 }))
      .filter((i) => i.value)
      .sort((a, b) => b.value - a.value)
      .slice(0, c.limit ?? 12);
    return { kind: "share", title: c.title, unit: c.unit, items, note: c.note };
  }

  // Months: one series per year (oldest first), Jan-Dec.
  const years = Array.from({ length: c.years ?? 3 }, (_, i) => run.f.year - (c.years ?? 3) + 1 + i);
  const map = run.map;
  const monthFilter = (y: number) =>
    map.date
      ? `FILTER(ALL(${map.date}), YEAR(${map.date}) = ${y} && MONTH(${map.date}) = m)`
      : [map.year && `TREATAS({${y}}, ${map.year})`, map.month && `TREATAS({m}, ${map.month})`].filter(Boolean).join(", ");
  const cols = years.map((y) => `"y${y}", VAR m = [Value] RETURN ${calc(c.expr, [monthFilter(y), ...scope].filter(Boolean))}`);
  const rows = await q(run, `EVALUATE ADDCOLUMNS(GENERATESERIES(1, 12, 1), ${cols.join(", ")})`);
  const byMonth = new Map(rows.map((r) => [Number(r.Value), r]));
  const running: Record<string, number> = {};
  const data = Array.from({ length: 12 }, (_, i) => {
    const r = byMonth.get(i + 1);
    const point: { month: number } & Record<string, number> = { month: i + 1 } as { month: number } & Record<string, number>;
    for (const y of years) {
      const v = num(r?.[`y${y}`]) ?? 0;
      running[y] = (running[y] ?? 0) + v;
      point[String(y)] = c.cumulative ? running[y] : v;
    }
    return point;
  });
  return { kind: "months", title: c.title, unit: c.unit, series: years.map(String), data, note: c.note };
}

// ─── Entry point ────────────────────────────────────────────────────────────

async function resolveDataset(cfg: PowerBiConfig, spec: PbiReportSpec): Promise<string> {
  const datasets = await listDatasets(cfg);
  if (spec.dataset) {
    const d = datasets.find((x) => x.name.toLowerCase() === spec.dataset!.toLowerCase());
    if (d) return d.id;
    throw new PowerBiError(`Power BI model "${spec.dataset}" not found in the workspace`);
  }
  const configured = await getIntegrationSetting("powerbi_reports_dataset_id", process.env.PBI_REPORTS_DATASET_ID);
  if (configured) return configured;
  if (datasets.length === 1) return datasets[0].id;
  throw new PowerBiError("More than one Power BI model in the workspace; set which one the reports use");
}

export async function buildPowerBiReport(key: string, f: PbiFilters): Promise<ReportPayload> {
  const def = REPORT.get(key);
  const spec = PBI_REPORTS[key];
  if (!def) throw new Error("Unknown report");
  if (!spec || !isMapped(key)) throw new Error("This report isn't mapped to Power BI yet");
  const cfg = await getPowerBiConfig();
  if (!cfg) throw new PowerBiError("Power BI isn't connected (Settings → Connectors → Power BI)");

  const datasetId = await resolveDataset(cfg, spec);
  let officeName: string | null = null;
  if (f.officeId) {
    const { data } = await createAdminClient().from("b2s_offices").select("field_office").eq("id", f.officeId).maybeSingle();
    officeName = (data?.field_office as string) ?? null;
  }
  const run: Run = { cfg, datasetId, map: { ...SHARED_MAP, ...(spec.map ?? {}) }, f, officeName };

  const [kpis, matrices, charts, refreshed] = await Promise.all([
    buildKpis(run, spec.kpis ?? []),
    Promise.all((spec.matrices ?? []).map((m) => buildMatrix(run, m))),
    Promise.all((spec.charts ?? []).map((c) => buildChart(run, c))),
    lastRefresh(cfg, datasetId),
  ]);

  const notes = [...(spec.notes ?? [])];
  const ignored = (["region", "state", "office", "program"] as const).filter((k) => (k === "office" ? f.officeId : f[k]) && !run.map[k]);
  if (ignored.length) notes.push(`The Power BI model has no ${ignored.join("/")} column mapped, so that filter isn't applied here.`);

  return {
    key,
    title: def.title,
    asOf: refreshed
      ? new Date(refreshed).toLocaleString("en-US", { timeZone: "America/Chicago", month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }) + " (last Power BI refresh)"
      : "the last Power BI publish",
    notes,
    kpis,
    matrices,
    charts,
  };
}
