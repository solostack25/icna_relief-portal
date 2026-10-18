"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { GoalsStrip } from "@/components/insights/GoalsPanel";
// Map + topology only load when the Regional profiles tab is opened
const RegionalProfiles = dynamic(() => import("./RegionalProfiles"), { ssr: false });
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";

type Office = { id: string; name: string; region: string; state: string };
type Row = { metric: string; value: number };
type Data = {
  totals: Record<string, number>;
  prev_totals: Record<string, number>;
  monthly: (Row & { month: string })[];
  prev_monthly: (Row & { month: string })[];
  by_office: (Row & { office_id: string | null })[];
  by_program: (Row & { program: string })[];
  data_range: { min: string | null; max: string | null } | null;
};

type Unit = "count" | "money" | "lbs" | "hours";
const METRICS: { key: string; label: string; unit: Unit; note: string }[] = [
  { key: "people_served", label: "People served", unit: "count", note: "Individuals reached: food distributions, bulk drives, Refugee Services, IRFAS households, TH admissions, DRS & FATE reports" },
  { key: "households_served", label: "Households served", unit: "count", note: "Bulk distributions plus B2S and DRS monthly reports" },
  { key: "food_lbs", label: "Food distributed", unit: "lbs", note: "Pounds of food from client distributions, Orlando live distributions and bulk food drives" },
  { key: "food_value", label: "Food value", unit: "money", note: "Food distributed, valued at the national in-kind price list (Admin → Rates & Values)" },
  { key: "inkind_value", label: "In-kind received", unit: "money", note: "Donated goods logged at the intake station, plus B2S / DRS / FATE reported in-kind" },
  { key: "services_value", label: "Value of services", unit: "money", note: "Refugee Services case services, non-food bulk distributions, DRS and FATE service value" },
  { key: "financial_assistance", label: "Financial assistance", unit: "money", note: "IRFAS approved or paid (not voided), plus B2S SFA / Empower disbursed" },
  { key: "volunteer_hours", label: "Volunteer hours", unit: "hours", note: "Volunteer check-in/out hours plus DRS & FATE reported hours" },
  { key: "volunteer_value", label: "Volunteer value", unit: "money", note: "Volunteer hours × the volunteer hourly rate" },
  { key: "revenue", label: "Donations (Salesforce)", unit: "money", note: "Paid donations synced nightly from Salesforce, credited by donor zip — appears once the sync is connected" },
  { key: "grants", label: "Grants", unit: "money", note: "Grants entered in the portal, by received date (or fiscal year)" },
  { key: "cash_received", label: "Cash & checks received", unit: "money", note: "Cash / check logged at the intake station, plus program-reported cash" },
  { key: "backpacks", label: "Backpacks", unit: "count", note: "Back2School backpacks from client profiles and monthly office reports" },
  { key: "new_clients", label: "New clients", unit: "count", note: "Client registrations in the unified intake" },
  { key: "th_admissions", label: "Housing admissions", unit: "count", note: "Transitional Housing move-ins" },
  { key: "pickups", label: "Food pickups completed", unit: "count", note: "Completed pickup appointments" },
  { key: "services_delivered", label: "Refugee services logged", unit: "count", note: "Refugee Services case-service entries" },
  { key: "irfas_applications", label: "IRFAS awards", unit: "count", note: "IRFAS applications approved or paid" },
  { key: "bulk_distributions", label: "Bulk distributions", unit: "count", note: "Bulk distribution events" },
];
const METRIC = new Map(METRICS.map((m) => [m.key, m]));
const TILES = ["people_served", "food_lbs", "food_value", "inkind_value", "services_value", "financial_assistance", "volunteer_hours", "grants"];
const CROSSTAB = ["people_served", "food_lbs", "food_value", "inkind_value", "services_value", "financial_assistance", "volunteer_hours", "revenue", "grants"];
const IMPACT = ["food_value", "inkind_value", "services_value", "financial_assistance", "volunteer_value"];
const PROGRAMS = ["Hunger Prevention", "Refugee Services", "Back2School", "Disaster Relief", "Muslim Family Services", "Health Services", "Transitional Housing", "Outreach", "General"];

// Colors: one data hue (brand emerald, validated ≥3:1 on white) and a
// recessive gray for the comparison period, which is also dashed so it
// never relies on color alone. Text stays in ink tokens.
const C = {
  data: "#13805A",
  prev: "#8A948F",
  ink: "#16302B",
  ink2: "rgba(22,48,43,0.62)",
  ink3: "rgba(22,48,43,0.45)",
  grid: "rgba(22,48,43,0.08)",
  border: "rgba(22,48,43,0.12)",
};
const card: React.CSSProperties = { background: "#fff", borderRadius: 20, boxShadow: "0 3px 12px rgba(22,48,43,0.06)", padding: "18px 20px" };

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
type Preset = "ytd" | "last_year" | "12m" | "90d" | "all" | "custom";
const PRESETS: { key: Preset; label: string; compare: string }[] = [
  { key: "ytd", label: "This year", compare: "same days last year" },
  { key: "12m", label: "Last 12 months", compare: "prior 12 months" },
  { key: "90d", label: "Last 90 days", compare: "prior 90 days" },
  { key: "last_year", label: "Last year", compare: "the year before" },
  { key: "all", label: "All time", compare: "" },
  { key: "custom", label: "Custom", compare: "previous period of equal length" },
];
function presetRange(p: Preset): [string, string] {
  const t = new Date();
  const y = t.getFullYear();
  if (p === "ytd") return [`${y}-01-01`, iso(t)];
  if (p === "last_year") return [`${y - 1}-01-01`, `${y - 1}-12-31`];
  if (p === "12m") return [iso(new Date(y, t.getMonth() - 11, 1)), iso(t)];
  if (p === "90d") return [iso(new Date(y, t.getMonth(), t.getDate() - 89)), iso(t)];
  return ["2017-01-01", iso(t)];
}

function fmt(n: number, unit: Unit, compact = false) {
  const v = Number(n) || 0;
  const num = compact
    ? new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(v)
    : Math.round(v).toLocaleString("en-US");
  if (unit === "money") return `$${num}`;
  if (unit === "lbs") return `${num} lbs`;
  if (unit === "hours") return `${num} hrs`;
  return num;
}

const monthLabel = (m: string) => new Date(Number(m.slice(0, 4)), Number(m.slice(5, 7)) - 1, 1).toLocaleString("en-US", { month: "short", year: "2-digit" });
function monthsBetween(from: string, to: string) {
  const out: string[] = [];
  let y = Number(from.slice(0, 4));
  let m = Number(from.slice(5, 7));
  const endY = Number(to.slice(0, 4));
  const endM = Number(to.slice(5, 7));
  while (y < endY || (y === endY && m <= endM)) {
    out.push(`${y}-${String(m).padStart(2, "0")}`);
    m++;
    if (m > 12) {
      m = 1;
      y++;
    }
  }
  return out;
}
function shiftMonth(mo: string, by: number) {
  const d = new Date(Number(mo.slice(0, 4)), Number(mo.slice(5, 7)) - 1 + by, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function downloadCsv(name: string, rows: (string | number)[][]) {
  const csv = rows.map((r) => r.map((c) => (typeof c === "string" && /[",\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c)).join(",")).join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

function ChartTooltip({ active, payload, label, unit, labelFmt }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: "#fff", border: `1px solid ${C.border}`, borderRadius: 10, padding: "8px 10px", boxShadow: "0 4px 14px rgba(22,48,43,0.12)", fontSize: 12 }}>
      <div style={{ color: C.ink2, marginBottom: 4 }}>{labelFmt ? labelFmt(label) : label}</div>
      {payload.map((p: any) => (
        <div key={p.dataKey} className="flex items-center gap-2" style={{ color: C.ink }}>
          <span style={{ width: 10, height: p.dataKey === "prev" ? 2 : 10, borderRadius: 2, background: p.dataKey === "prev" ? C.prev : C.data, display: "inline-block" }} />
          <span style={{ color: C.ink2 }}>{p.name}</span>
          <span className="tabular-nums font-semibold ml-auto pl-3">{p.value == null ? "—" : fmt(p.value, unit)}</span>
        </div>
      ))}
    </div>
  );
}

function ChartCard({ title, subtitle, table, children, onCsv }: { title: string; subtitle?: string; table: React.ReactNode; children: React.ReactNode; onCsv?: () => void }) {
  const [view, setView] = useState<"chart" | "table">("chart");
  return (
    <div style={card}>
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0">
          <h3 className="text-sm font-bold" style={{ color: C.ink }}>{title}</h3>
          {subtitle && <p className="text-[11px] mt-0.5" style={{ color: C.ink3 }}>{subtitle}</p>}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {(["chart", "table"] as const).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className="text-[11px] font-semibold rounded-full px-2.5 py-1"
              style={view === v ? { background: "rgba(19,128,90,0.1)", color: C.data } : { color: C.ink3 }}
              aria-pressed={view === v}
            >
              {v === "chart" ? "Chart" : "Table"}
            </button>
          ))}
          {onCsv && (
            <button onClick={onCsv} className="text-[11px] font-semibold rounded-full px-2.5 py-1" style={{ color: C.ink3 }} title="Download CSV">
              CSV
            </button>
          )}
        </div>
      </div>
      {view === "chart" ? children : <div className="max-h-[320px] overflow-auto">{table}</div>}
    </div>
  );
}

function SimpleTable({ head, rows }: { head: string[]; rows: (string | number)[][] }) {
  return (
    <table className="w-full text-xs">
      <thead>
        <tr>
          {head.map((h, i) => (
            <th key={h} className={`py-1.5 font-semibold ${i ? "text-right" : "text-left"}`} style={{ color: C.ink2, borderBottom: `1px solid ${C.border}` }}>
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i}>
            {r.map((c, j) => (
              <td key={j} className={`py-1 ${j ? "text-right tabular-nums" : ""}`} style={{ color: C.ink, borderBottom: `1px solid ${C.grid}` }}>
                {c}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Empty() {
  return (
    <div className="h-[260px] flex items-center justify-center text-xs" style={{ color: C.ink3 }}>
      No data for this metric with the current filters.
    </div>
  );
}

function HBar({ rows, unit, onPick, height }: { rows: { label: string; value: number }[]; unit: Unit; onPick?: (label: string) => void; height?: number }) {
  if (!rows.some((r) => r.value)) return <Empty />;
  const h = height ?? Math.max(160, rows.length * 30 + 30);
  return (
    <ResponsiveContainer width="100%" height={h}>
      <BarChart
        data={rows}
        layout="vertical"
        margin={{ top: 0, right: 16, bottom: 0, left: 0 }}
        onClick={(s: any) => s?.activeLabel != null && onPick?.(String(s.activeLabel))}
        style={{ cursor: onPick ? "pointer" : undefined }}
      >
        <CartesianGrid horizontal={false} stroke={C.grid} />
        <XAxis type="number" tickFormatter={(v) => fmt(v, unit, true)} tick={{ fontSize: 11, fill: C.ink3 }} axisLine={false} tickLine={false} />
        <YAxis type="category" dataKey="label" width={150} tick={{ fontSize: 11, fill: C.ink2 }} axisLine={false} tickLine={false} interval={0} />
        <Tooltip cursor={{ fill: "rgba(19,128,90,0.06)" }} content={<ChartTooltip unit={unit} />} />
        <Bar dataKey="value" name="Total" fill={C.data} barSize={16} radius={[0, 4, 4, 0]} isAnimationActive={false} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export default function InsightsClient({ offices, lockedRegion, lockedOffice = null }: { offices: Office[]; lockedRegion: string | null; lockedOffice?: string | null }) {
  const [preset, setPreset] = useState<Preset>("ytd");
  const [[from, to], setRange] = useState<[string, string]>(() => presetRange("ytd"));
  const [region, setRegion] = useState<string>(lockedRegion ?? "");
  const [office, setOffice] = useState<string>(lockedOffice ?? "");
  const [program, setProgram] = useState<string>("");
  const [tab, setTab] = useState<"overview" | "profiles">("overview");
  const [metric, setMetric] = useState<string>("people_served");
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sort, setSort] = useState<{ key: string; dir: 1 | -1 }>({ key: "people_served", dir: -1 });
  const abortRef = useRef<AbortController | null>(null);

  const officeById = useMemo(() => new Map(offices.map((o) => [o.id, o])), [offices]);
  const regions = useMemo(() => [...new Set(offices.map((o) => o.region))].sort(), [offices]);
  const officeChoices = useMemo(() => offices.filter((o) => !region || o.region === region), [offices, region]);

  useEffect(() => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setLoading(true);
    setError(null);
    const qs = new URLSearchParams({ from, to });
    if (region) qs.set("region", region);
    if (office) qs.set("office", office);
    if (program) qs.set("program", program);
    fetch(`/api/admin/insights?${qs}`, { signal: ctrl.signal })
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(j.error ?? "Failed to load");
        setData(j);
      })
      .catch((e) => e.name !== "AbortError" && setError(e.message))
      .finally(() => !ctrl.signal.aborted && setLoading(false));
    return () => ctrl.abort();
  }, [from, to, region, office, program]);

  const m = METRIC.get(metric)!;
  const presetInfo = PRESETS.find((p) => p.key === preset)!;
  const compareLabel = preset === "all" ? "" : presetInfo.compare;
  const total = (k: string) => Number(data?.totals?.[k] ?? 0);
  const prevTotal = (k: string) => Number(data?.prev_totals?.[k] ?? 0);

  // Trend: every month in range, current vs the comparison period aligned
  // month-for-month.
  const trend = useMemo(() => {
    if (!data) return [];
    let start = from;
    if (preset === "all" && data.data_range?.min) start = data.data_range.min > from ? data.data_range.min : from;
    const months = monthsBetween(start, to);
    const days = Math.round((new Date(to).getTime() - new Date(from).getTime()) / 86400000) + 1;
    const prevFrom = new Date(new Date(from).getTime() - days * 86400000);
    const shift = (Number(from.slice(0, 4)) - prevFrom.getFullYear()) * 12 + (Number(from.slice(5, 7)) - 1 - prevFrom.getMonth());
    const cur = new Map(data.monthly.filter((r) => r.metric === metric).map((r) => [r.month, Number(r.value)]));
    const prev = new Map(data.prev_monthly.filter((r) => r.metric === metric).map((r) => [r.month, Number(r.value)]));
    return months.map((mo) => ({ month: mo, value: cur.get(mo) ?? 0, prev: preset === "all" ? undefined : prev.get(shiftMonth(mo, -shift)) ?? 0 }));
  }, [data, metric, from, to, preset]);

  const byRegion = useMemo(() => {
    const g = new Map<string, number>();
    for (const r of data?.by_office ?? []) {
      if (r.metric !== metric) continue;
      const reg = r.office_id ? officeById.get(r.office_id)?.region ?? "UNASSIGNED" : "UNASSIGNED";
      g.set(reg, (g.get(reg) ?? 0) + Number(r.value));
    }
    return [...g.entries()].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
  }, [data, metric, officeById]);

  const byProgram = useMemo(
    () =>
      (data?.by_program ?? [])
        .filter((r) => r.metric === metric && Number(r.value))
        .map((r) => ({ label: r.program, value: Number(r.value) }))
        .sort((a, b) => b.value - a.value),
    [data, metric]
  );

  const officeRows = useMemo(() => {
    const g = new Map<string, Record<string, number>>();
    for (const r of data?.by_office ?? []) {
      const k = r.office_id ?? "";
      const row = g.get(k) ?? {};
      row[r.metric] = (row[r.metric] ?? 0) + Number(r.value);
      g.set(k, row);
    }
    return [...g.entries()].map(([id, vals]) => ({
      id,
      name: id ? officeById.get(id)?.name ?? "Unknown office" : "Not assigned to an office",
      region: id ? officeById.get(id)?.region ?? "" : "",
      vals,
    }));
  }, [data, officeById]);

  const byOffice = useMemo(
    () =>
      officeRows
        .filter((o) => o.vals[metric])
        .map((o) => ({ label: o.name, value: o.vals[metric], id: o.id }))
        .sort((a, b) => b.value - a.value),
    [officeRows, metric]
  );

  const crosstab = useMemo(
    () =>
      officeRows
        .filter((o) => CROSSTAB.some((k) => o.vals[k]))
        .sort((a, b) => (sort.key === "name" ? a.name.localeCompare(b.name) * sort.dir : ((a.vals[sort.key] ?? 0) - (b.vals[sort.key] ?? 0)) * sort.dir)),
    [officeRows, sort]
  );

  const impact = IMPACT.reduce((s, k) => s + total(k), 0);
  const prevImpact = IMPACT.reduce((s, k) => s + prevTotal(k), 0);

  function delta(cur: number, prev: number) {
    if (preset === "all") return null;
    if (!prev) return cur ? { text: "new this period", dir: 0 } : null;
    const p = ((cur - prev) / prev) * 100;
    return { text: `${p > 0 ? "▲" : p < 0 ? "▼" : ""} ${Math.abs(p).toFixed(Math.abs(p) < 10 ? 1 : 0)}%`, dir: Math.sign(p) };
  }

  function pickPreset(p: Preset) {
    setPreset(p);
    if (p !== "custom") setRange(presetRange(p));
  }
  function pickRegion(r: string) {
    if (lockedRegion) return;
    setRegion(r === region ? "" : r);
    setOffice("");
  }
  function pickOffice(name: string) {
    if (lockedOffice) return;
    const o = byOffice.find((x) => x.label === name);
    if (o?.id) setOffice(o.id === office ? "" : o.id);
  }

  const filterLabel = [
    region || "All regions",
    office ? officeById.get(office)?.name : null,
    program || "All programs",
  ]
    .filter(Boolean)
    .join(" · ");

  const sel: React.CSSProperties = { border: `1px solid ${C.border}`, borderRadius: 999, padding: "6px 12px", fontSize: 12, background: "#fff", color: C.ink };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold" style={{ color: C.ink }}>Insights</h1>
          <p className="text-xs mt-1" style={{ color: C.ink2 }}>
            {tab === "overview"
              ? "Every program's reported impact in one place — click a tile to chart it, click a bar to filter to that region, office or program."
              : "Regional profiles — pick a region, then a state, to see its services, people served, funds raised, volunteers and goal."}
          </p>
        </div>
        <div className="flex rounded-full p-1" style={{ background: "#EDEBE5" }} role="tablist">
          {(["overview", "profiles"] as const).map((t) => (
            <button
              key={t}
              role="tab"
              aria-selected={tab === t}
              onClick={() => setTab(t)}
              className="text-xs font-semibold rounded-full px-4 py-1.5"
              style={tab === t ? { background: "#fff", color: C.ink, boxShadow: "0 1px 3px rgba(22,48,43,0.12)" } : { color: C.ink2 }}
            >
              {t === "overview" ? "Overview" : "Regional profiles"}
            </button>
          ))}
        </div>
      </div>

      {/* One filter row for every chart below */}
      <div style={{ ...card, padding: "12px 14px" }} className="flex flex-wrap items-center gap-2 sticky top-2 z-10">
        <div className="flex flex-wrap gap-1">
          {PRESETS.map((p) => (
            <button
              key={p.key}
              onClick={() => pickPreset(p.key)}
              className="text-xs font-semibold rounded-full px-3 py-1.5"
              style={preset === p.key ? { background: C.data, color: "#fff" } : { background: "#F4F3EE", color: C.ink2 }}
            >
              {p.label}
            </button>
          ))}
        </div>
        {preset === "custom" && (
          <div className="flex items-center gap-1">
            <input type="date" value={from} max={to} onChange={(e) => e.target.value && setRange([e.target.value, to])} style={sel} aria-label="From" />
            <span className="text-xs" style={{ color: C.ink3 }}>to</span>
            <input type="date" value={to} min={from} onChange={(e) => e.target.value && setRange([from, e.target.value])} style={sel} aria-label="To" />
          </div>
        )}
        {tab === "overview" && <div className="flex flex-wrap gap-2 md:ml-auto">
          <select value={region} onChange={(e) => pickRegion(e.target.value)} disabled={!!lockedRegion} style={sel} aria-label="Region">
            {!lockedRegion && <option value="">All regions</option>}
            {regions.map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
          <select value={office} onChange={(e) => setOffice(e.target.value)} disabled={!!lockedOffice} style={{ ...sel, maxWidth: 200 }} aria-label="Office">
            {!lockedOffice && <option value="">All offices</option>}
            {officeChoices.map((o) => (
              <option key={o.id} value={o.id}>{o.name}</option>
            ))}
          </select>
          <select value={program} onChange={(e) => setProgram(e.target.value)} style={sel} aria-label="Program">
            <option value="">All programs</option>
            {PROGRAMS.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
          {(region && !lockedRegion) || (office && !lockedOffice) || program ? (
            <button
              onClick={() => {
                if (!lockedRegion) setRegion("");
                if (!lockedOffice) setOffice("");
                setProgram("");
              }}
              className="text-xs font-semibold px-2"
              style={{ color: C.data }}
            >
              Clear
            </button>
          ) : null}
        </div>}
      </div>

      {tab === "profiles" ? (
        <RegionalProfiles from={from} to={to} offices={offices} lockedRegion={lockedRegion} />
      ) : (
      <>

      {error && (
        <div style={{ ...card, color: "#9B3B4F" }} className="text-sm">
          Couldn&apos;t load the dashboard: {error}
        </div>
      )}

      {/* Refetch keeps the previous frame, dimmed */}
      <div style={{ opacity: loading && data ? 0.5 : 1, transition: "opacity 150ms" }} aria-busy={loading}>
        {!data ? (
          <div style={card} className="text-sm text-center py-16">
            <span style={{ color: C.ink3 }}>{loading ? "Loading…" : "No data"}</span>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="text-[11px]" style={{ color: C.ink3 }}>
              {filterLabel} · {from} to {to}
              {compareLabel ? ` · changes vs ${compareLabel}` : ""}
            </div>

            {/* Goals & budget set by upper management for this scope (single-year ranges) */}
            {from.slice(0, 4) === to.slice(0, 4) && (
              <GoalsStrip
                key={`${from.slice(0, 4)}-${office}-${region}`}
                year={Number(from.slice(0, 4))}
                scope={office ? "office" : region ? "region" : "org"}
                scopeKey={office || region || ""}
                scopeName={office ? officeById.get(office)?.name ?? "this office" : region || "ICNA Relief"}
              />
            )}

            {/* Hero + KPI tiles */}
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
              <div style={{ ...card, background: "#16302B" }} className="col-span-2 lg:col-span-1 lg:row-span-2 flex flex-col justify-between">
                <div className="text-xs font-semibold" style={{ color: "rgba(255,255,255,0.7)" }}>Total community impact</div>
                <div>
                  <div className="text-3xl font-bold mt-2" style={{ color: "#fff" }}>{fmt(impact, "money", impact >= 1e6)}</div>
                  {(() => {
                    const d = delta(impact, prevImpact);
                    return d ? <div className="text-xs mt-1" style={{ color: "rgba(255,255,255,0.75)" }}>{d.text}{compareLabel && d.dir !== 0 ? ` vs ${compareLabel}` : ""}</div> : null;
                  })()}
                </div>
                <div className="text-[11px] mt-3" style={{ color: "rgba(255,255,255,0.55)" }}>
                  Food + in-kind + services + financial assistance + volunteer time
                </div>
              </div>
              {TILES.map((k) => {
                const mm = METRIC.get(k)!;
                const d = delta(total(k), prevTotal(k));
                const active = metric === k;
                return (
                  <button
                    key={k}
                    onClick={() => setMetric(k)}
                    style={{ ...card, padding: "14px 16px", outline: active ? `2px solid ${C.data}` : "none", outlineOffset: -2 }}
                    className="text-left"
                    aria-pressed={active}
                    title={mm.note}
                  >
                    <div className="text-[11px] font-semibold" style={{ color: C.ink2 }}>{mm.label}</div>
                    <div className="text-xl font-bold mt-1" style={{ color: C.ink }}>{fmt(total(k), mm.unit, total(k) >= 1e6)}</div>
                    <div className="text-[11px] mt-0.5" style={{ color: C.ink3 }}>{d ? `${d.text}${d.dir !== 0 && compareLabel ? ` vs ${compareLabel}` : ""}` : " "}</div>
                  </button>
                );
              })}
            </div>

            {/* Metric picker for the charts */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold" style={{ color: C.ink2 }}>Charting</span>
              <select value={metric} onChange={(e) => setMetric(e.target.value)} style={{ ...sel, fontWeight: 600 }} aria-label="Metric">
                {METRICS.map((x) => (
                  <option key={x.key} value={x.key}>
                    {x.label} — {fmt(total(x.key), x.unit, true)}
                  </option>
                ))}
              </select>
              <span className="text-[11px]" style={{ color: C.ink3 }}>{m.note}</span>
            </div>

            <ChartCard
              title={`${m.label} by month`}
              subtitle={compareLabel ? `Dashed line: ${compareLabel}` : undefined}
              onCsv={() => downloadCsv(`${metric}_by_month.csv`, [["Month", m.label, ...(compareLabel ? [`${m.label} (${compareLabel})`] : [])], ...trend.map((r) => [r.month, Math.round(r.value * 100) / 100, ...(compareLabel ? [Math.round((r.prev ?? 0) * 100) / 100] : [])])])}
              table={<SimpleTable head={["Month", "This period", ...(compareLabel ? ["Comparison"] : [])]} rows={trend.map((r) => [monthLabel(r.month), fmt(r.value, m.unit), ...(compareLabel ? [fmt(r.prev ?? 0, m.unit)] : [])])} />}
            >
              {trend.some((r) => r.value || r.prev) ? (
                <ResponsiveContainer width="100%" height={280}>
                  <LineChart data={trend} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
                    <CartesianGrid vertical={false} stroke={C.grid} />
                    <XAxis dataKey="month" tickFormatter={monthLabel} tick={{ fontSize: 11, fill: C.ink3 }} axisLine={{ stroke: C.border }} tickLine={false} minTickGap={16} />
                    <YAxis tickFormatter={(v) => fmt(v, m.unit, true)} tick={{ fontSize: 11, fill: C.ink3 }} axisLine={false} tickLine={false} width={64} />
                    <Tooltip cursor={{ stroke: C.ink3, strokeWidth: 1 }} content={<ChartTooltip unit={m.unit} labelFmt={monthLabel} />} />
                    {compareLabel && <Legend iconType="plainline" wrapperStyle={{ fontSize: 11, color: C.ink2 }} />}
                    {compareLabel && <Line dataKey="prev" name={`Comparison (${compareLabel})`} stroke={C.prev} strokeWidth={2} strokeDasharray="5 4" dot={false} isAnimationActive={false} />}
                    <Line dataKey="value" name="This period" stroke={C.data} strokeWidth={2} dot={trend.length <= 3 ? { r: 4, fill: C.data, stroke: "#fff", strokeWidth: 2 } : false} activeDot={{ r: 5, fill: C.data, stroke: "#fff", strokeWidth: 2 }} isAnimationActive={false} />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <Empty />
              )}
            </ChartCard>

            <div className="grid lg:grid-cols-2 gap-4">
              <ChartCard
                title={`${m.label} by region`}
                subtitle={lockedRegion ? undefined : "Click a region to filter"}
                onCsv={() => downloadCsv(`${metric}_by_region.csv`, [["Region", m.label], ...byRegion.map((r) => [r.label, r.value])])}
                table={<SimpleTable head={["Region", m.label]} rows={byRegion.map((r) => [r.label, fmt(r.value, m.unit)])} />}
              >
                <HBar rows={byRegion} unit={m.unit} onPick={lockedRegion ? undefined : pickRegion} />
              </ChartCard>
              <ChartCard
                title={`${m.label} by program`}
                subtitle="Click a program to filter"
                onCsv={() => downloadCsv(`${metric}_by_program.csv`, [["Program", m.label], ...byProgram.map((r) => [r.label, r.value])])}
                table={<SimpleTable head={["Program", m.label]} rows={byProgram.map((r) => [r.label, fmt(r.value, m.unit)])} />}
              >
                <HBar rows={byProgram} unit={m.unit} onPick={(p) => setProgram(p === program ? "" : p)} />
              </ChartCard>
            </div>

            <ChartCard
              title={`${m.label} by office`}
              subtitle={byOffice.length > 15 ? `Top 15 of ${byOffice.length} offices — switch to Table for all. Click an office to filter.` : "Click an office to filter"}
              onCsv={() => downloadCsv(`${metric}_by_office.csv`, [["Office", "Region", m.label], ...byOffice.map((r) => [r.label, officeById.get(r.id)?.region ?? "", r.value])])}
              table={<SimpleTable head={["Office", m.label]} rows={byOffice.map((r) => [r.label, fmt(r.value, m.unit)])} />}
            >
              <HBar rows={byOffice.slice(0, 15)} unit={m.unit} onPick={pickOffice} />
            </ChartCard>

            {/* Crosstab: office × key metric */}
            <div style={card}>
              <div className="flex items-start justify-between gap-3 mb-3">
                <div>
                  <h3 className="text-sm font-bold" style={{ color: C.ink }}>Office scorecard</h3>
                  <p className="text-[11px] mt-0.5" style={{ color: C.ink3 }}>Every office × key metric for the current filters. Click a column to sort.</p>
                </div>
                <button
                  onClick={() =>
                    downloadCsv(`office_scorecard_${from}_${to}.csv`, [
                      ["Office", "Region", ...CROSSTAB.map((k) => METRIC.get(k)!.label)],
                      ...crosstab.map((o) => [o.name, o.region, ...CROSSTAB.map((k) => Math.round((o.vals[k] ?? 0) * 100) / 100)]),
                    ])
                  }
                  className="text-xs font-semibold rounded-full px-3 py-1.5 shrink-0"
                  style={{ border: "1.5px solid rgba(19,128,90,0.35)", color: C.data }}
                >
                  Download CSV
                </button>
              </div>
              {crosstab.length ? (
                <div className="overflow-x-auto max-h-[520px] overflow-y-auto">
                  <table className="w-full text-xs" style={{ minWidth: 900 }}>
                    <thead className="sticky top-0" style={{ background: "#fff" }}>
                      <tr>
                        {[{ key: "name", label: "Office" }, ...CROSSTAB.map((k) => ({ key: k, label: METRIC.get(k)!.label }))].map((c, i) => (
                          <th
                            key={c.key}
                            onClick={() => setSort((s) => ({ key: c.key, dir: s.key === c.key ? (s.dir === 1 ? -1 : 1) : c.key === "name" ? 1 : -1 }))}
                            className={`py-2 px-2 font-semibold cursor-pointer select-none whitespace-nowrap ${i ? "text-right" : "text-left"}`}
                            style={{ color: sort.key === c.key ? C.ink : C.ink2, borderBottom: `1px solid ${C.border}` }}
                            aria-sort={sort.key === c.key ? (sort.dir === 1 ? "ascending" : "descending") : "none"}
                          >
                            {c.label}
                            {sort.key === c.key ? (sort.dir === 1 ? " ↑" : " ↓") : ""}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {crosstab.map((o) => (
                        <tr key={o.id || "none"} className="hover:bg-[rgba(19,128,90,0.04)]">
                          <td className="py-1.5 px-2" style={{ color: C.ink, borderBottom: `1px solid ${C.grid}` }}>
                            <div className="font-medium">{o.name}</div>
                            {o.region && <div className="text-[10px]" style={{ color: C.ink3 }}>{o.region}</div>}
                          </td>
                          {CROSSTAB.map((k) => (
                            <td key={k} className="py-1.5 px-2 text-right tabular-nums" style={{ color: o.vals[k] ? C.ink : C.ink3, borderBottom: `1px solid ${C.grid}` }}>
                              {o.vals[k] ? fmt(o.vals[k], METRIC.get(k)!.unit) : "—"}
                            </td>
                          ))}
                        </tr>
                      ))}
                      <tr>
                        <td className="py-2 px-2 font-bold" style={{ color: C.ink }}>Total</td>
                        {CROSSTAB.map((k) => (
                          <td key={k} className="py-2 px-2 text-right tabular-nums font-bold" style={{ color: C.ink }}>
                            {fmt(total(k), METRIC.get(k)!.unit)}
                          </td>
                        ))}
                      </tr>
                    </tbody>
                  </table>
                </div>
              ) : (
                <Empty />
              )}
            </div>

            <p className="text-[11px] leading-relaxed" style={{ color: C.ink3 }}>
              Sources: client food distributions and check-in packages, Orlando live distributions, bulk distributions, Refugee Services case services, IRFAS
              (approved/paid, not voided), volunteer check-in/out, in-kind intake sessions and cash/checks, grants, Back2School / DRS / FATE monthly office
              reports, Transitional Housing stays, client registrations and food pickups. Monthly office reports count on the 1st of their month. Donations
              from Salesforce appear once the nightly sync is connected.
              {data.data_range?.min ? ` Data on file: ${data.data_range.min} to ${data.data_range.max}.` : ""}
            </p>
          </div>
        )}
      </div>
      </>
      )}
    </div>
  );
}
