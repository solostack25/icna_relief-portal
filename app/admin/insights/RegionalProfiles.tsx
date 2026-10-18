"use client";

import { useEffect, useMemo, useState } from "react";
import { ComposableMap, Geographies, Geography } from "react-simple-maps";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import statesTopo from "us-atlas/states-10m.json";

type Office = { id: string; name: string; region: string; state: string };
type Fact = { o: string | null; p: string; m: string; v: number };
type Profile = {
  facts: Fact[];
  volunteers: { by_office: Record<string, number>; by_state: Record<string, number>; by_region: Record<string, number>; total: number; reported_by_office: Record<string, number> };
  goals: { year: number; scope: string; scope_key: string; metric: string; amount: number }[];
  reference: { state: string; muslim_population: number | null; mosques: number | null }[];
  canEdit: boolean;
};

// Region identity colors: validated categorical palette, fixed order (never by rank)
const REGION_ORDER = ["DMV", "MIDWEST 1", "MIDWEST 2", "NORTHEAST", "SOUTH CENTRAL", "SOUTHEAST", "WEST"];
const REGION_COLOR: Record<string, string> = {
  DMV: "#2a78d6",
  "MIDWEST 1": "#eb6834",
  "MIDWEST 2": "#1baf7a",
  NORTHEAST: "#eda100",
  "SOUTH CENTRAL": "#e87ba4",
  SOUTHEAST: "#008300",
  WEST: "#6250d6",
};
const NO_REGION = "#E4E1D9";
const C = {
  ink: "#16302B",
  ink2: "rgba(22,48,43,0.62)",
  ink3: "rgba(22,48,43,0.45)",
  grid: "rgba(22,48,43,0.08)",
  border: "rgba(22,48,43,0.12)",
  data: "#13805A",
  raised: "#2a78d6",
  accent: "#1F6F54",
  bad: "#9B3B4F",
};
const card: React.CSSProperties = { background: "#fff", borderRadius: 20, boxShadow: "0 3px 12px rgba(22,48,43,0.06)", padding: "18px 20px" };

const STATE_ABBR: Record<string, string> = {
  Alabama: "AL", Alaska: "AK", Arizona: "AZ", Arkansas: "AR", California: "CA", Colorado: "CO", Connecticut: "CT", Delaware: "DE", "District of Columbia": "DC",
  Florida: "FL", Georgia: "GA", Hawaii: "HI", Idaho: "ID", Illinois: "IL", Indiana: "IN", Iowa: "IA", Kansas: "KS", Kentucky: "KY", Louisiana: "LA", Maine: "ME",
  Maryland: "MD", Massachusetts: "MA", Michigan: "MI", Minnesota: "MN", Mississippi: "MS", Missouri: "MO", Montana: "MT", Nebraska: "NE", Nevada: "NV",
  "New Hampshire": "NH", "New Jersey": "NJ", "New Mexico": "NM", "New York": "NY", "North Carolina": "NC", "North Dakota": "ND", Ohio: "OH", Oklahoma: "OK",
  Oregon: "OR", Pennsylvania: "PA", "Rhode Island": "RI", "South Carolina": "SC", "South Dakota": "SD", Tennessee: "TN", Texas: "TX", Utah: "UT", Vermont: "VT",
  Virginia: "VA", Washington: "WA", "West Virginia": "WV", Wisconsin: "WI", Wyoming: "WY", "Puerto Rico": "PR",
};
const ABBR_NAME = Object.fromEntries(Object.entries(STATE_ABBR).map(([n, a]) => [a, n]));

// What the headline numbers mean (kept together so the definitions are visible)
const SERVICE_METRICS = ["food_value", "services_value", "financial_assistance"];
const RAISED_METRICS = ["revenue", "grants", "cash_received", "inkind_value"];

const money = (n: number, compact = false) =>
  compact ? `$${new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(n)}` : `$${Math.round(n).toLocaleString("en-US")}`;
const num = (n: number) => Math.round(n).toLocaleString("en-US");

type Agg = { services: number; people: number; raised: number; inkind: number; volHours: number; volunteers: number };
const emptyAgg = (): Agg => ({ services: 0, people: 0, raised: 0, inkind: 0, volHours: 0, volunteers: 0 });
function addFact(a: Agg, f: Fact) {
  const v = Number(f.v) || 0;
  if (SERVICE_METRICS.includes(f.m)) a.services += v;
  if (RAISED_METRICS.includes(f.m)) a.raised += v;
  if (f.m === "people_served") a.people += v;
  if (f.m === "inkind_value") a.inkind += v;
  if (f.m === "volunteer_hours") a.volHours += v;
}

function Gauge({ value, goal }: { value: number; goal: number }) {
  const frac = goal > 0 ? Math.min(1, value / goal) : 0;
  const r = 90;
  const cx = 110;
  const cy = 105;
  const arc = (t: number) => {
    const a = Math.PI * (1 - t);
    return [cx + r * Math.cos(a), cy - r * Math.sin(a)];
  };
  const [x0, y0] = arc(0);
  const [x1, y1] = arc(1);
  const [xv, yv] = arc(frac);
  return (
    <svg viewBox="0 0 220 125" className="w-full max-w-[320px] mx-auto" role="img" aria-label={`${money(value)} of ${money(goal)} goal`}>
      <path d={`M ${x0} ${y0} A ${r} ${r} 0 0 1 ${x1} ${y1}`} fill="none" stroke="#EDEBE5" strokeWidth={22} />
      {frac > 0 && <path d={`M ${x0} ${y0} A ${r} ${r} 0 0 1 ${xv} ${yv}`} fill="none" stroke={C.data} strokeWidth={22} />}
      <text x={cx} y={cy - 18} textAnchor="middle" fontSize={20} fontWeight={700} fill={C.ink}>{money(value, value >= 1e6)}</text>
      <text x={cx} y={cy + 2} textAnchor="middle" fontSize={11} fill={C.ink2}>{Math.round(frac * 100)}% of goal</text>
      <text x={x0} y={cy + 18} textAnchor="middle" fontSize={10} fill={C.ink3}>$0</text>
      <text x={x1} y={cy + 18} textAnchor="middle" fontSize={10} fill={C.ink3}>{money(goal, true)}</text>
    </svg>
  );
}

function InlineNumber({ value, onSave, prefix, placeholder }: { value: number | null; onSave: (v: string) => Promise<void>; prefix?: string; placeholder?: string }) {
  const [editing, setEditing] = useState(false);
  const [v, setV] = useState(value == null ? "" : String(value));
  useEffect(() => setV(value == null ? "" : String(value)), [value]);
  if (!editing)
    return (
      <button onClick={() => setEditing(true)} className="text-[11px] font-semibold" style={{ color: C.accent }}>
        {value == null ? placeholder ?? "Set" : "Edit"}
      </button>
    );
  return (
    <form
      className="inline-flex items-center gap-1"
      onSubmit={async (e) => {
        e.preventDefault();
        await onSave(v);
        setEditing(false);
      }}
    >
      {prefix && <span className="text-xs" style={{ color: C.ink3 }}>{prefix}</span>}
      <input type="number" min={0} value={v} onChange={(e) => setV(e.target.value)} autoFocus className="text-xs rounded-lg px-2 py-1 w-28" style={{ border: `1px solid ${C.border}` }} />
      <button className="text-[11px] font-semibold" style={{ color: C.accent }}>Save</button>
      <button type="button" onClick={() => setEditing(false)} className="text-[11px]" style={{ color: C.ink3 }}>Cancel</button>
    </form>
  );
}

export default function RegionalProfiles({ from, to, offices, lockedRegion }: { from: string; to: string; offices: Office[]; lockedRegion: string | null }) {
  const [data, setData] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [region, setRegion] = useState<string | null>(lockedRegion);
  const [state, setState] = useState<string | null>(null);
  const [hover, setHover] = useState<{ name: string; x: number; y: number } | null>(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    const ctrl = new AbortController();
    setLoading(true);
    fetch(`/api/admin/insights/profile?from=${from}&to=${to}`, { signal: ctrl.signal })
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(j.error ?? "Failed to load");
        setData(j);
        setError(null);
      })
      .catch((e) => e.name !== "AbortError" && setError(e.message))
      .finally(() => !ctrl.signal.aborted && setLoading(false));
    return () => ctrl.abort();
  }, [from, to, reload]);

  const officeById = useMemo(() => new Map(offices.map((o) => [o.id, o])), [offices]);
  // A state's region = the region of its offices (statewide offices are 1:1)
  const stateRegion = useMemo(() => {
    const m = new Map<string, string>();
    for (const o of offices) if (o.state && o.state !== "HQ" && o.region && o.region !== "UNASSIGNED" && !m.has(o.state)) m.set(o.state, o.region);
    return m;
  }, [offices]);
  const regions = REGION_ORDER.filter((r) => !lockedRegion || r === lockedRegion);
  const statesIn = (r: string) => [...stateRegion.entries()].filter(([, rr]) => rr === r).map(([s]) => s).sort();

  const level: "national" | "region" | "state" = state ? "state" : region ? "region" : "national";
  const inScope = (officeId: string | null) => {
    const o = officeId ? officeById.get(officeId) : null;
    if (level === "national") return !lockedRegion || o?.region === lockedRegion;
    if (level === "region") return o?.region === region;
    return o?.state === state;
  };

  const view = useMemo(() => {
    if (!data) return null;
    const total = emptyAgg();
    const rows = new Map<string, Agg & { key: string; label: string }>();
    const byProgram = new Map<string, number>();
    const rowKey = (officeId: string | null) => {
      const o = officeId ? officeById.get(officeId) : null;
      if (level === "national") return o?.region && o.region !== "UNASSIGNED" ? o.region : "UNASSIGNED";
      if (level === "region") return o?.state ?? "—";
      return o ? o.id : "—";
    };
    const rowLabel = (k: string) => (level === "state" ? officeById.get(k)?.name ?? "Unassigned" : level === "region" ? `${ABBR_NAME[k] ?? k}` : k);
    const byStateMap = new Map<string, Agg>();
    for (const f of data.facts) {
      const o = f.o ? officeById.get(f.o) : null;
      if (o?.state) {
        const s = byStateMap.get(o.state) ?? emptyAgg();
        addFact(s, f);
        byStateMap.set(o.state, s);
      }
      if (!inScope(f.o)) continue;
      addFact(total, f);
      const k = rowKey(f.o);
      const row = rows.get(k) ?? { ...emptyAgg(), key: k, label: rowLabel(k) };
      addFact(row, f);
      rows.set(k, row);
      if (SERVICE_METRICS.includes(f.m)) byProgram.set(f.p, (byProgram.get(f.p) ?? 0) + Number(f.v));
    }
    // Volunteers: distinct people per level + reported counts from DRS/FATE
    const v = data.volunteers;
    const reportedFor = (pred: (o: Office | undefined) => boolean) =>
      Object.entries(v.reported_by_office).reduce((s, [id, n]) => s + (pred(officeById.get(id)) ? Number(n) : 0), 0);
    for (const row of rows.values()) {
      if (level === "national") row.volunteers = Number(v.by_region[row.key] ?? 0) + reportedFor((o) => (o?.region ?? "UNASSIGNED") === row.key);
      else if (level === "region") row.volunteers = Number(v.by_state[row.key] ?? 0) + reportedFor((o) => o?.state === row.key);
      else row.volunteers = Number(v.by_office[row.key] ?? 0) + Number(v.reported_by_office[row.key] ?? 0);
    }
    total.volunteers =
      level === "national"
        ? (lockedRegion ? Number(v.by_region[lockedRegion] ?? 0) : Number(v.total)) + reportedFor((o) => !lockedRegion || o?.region === lockedRegion)
        : level === "region"
          ? Number(v.by_region[region!] ?? 0) + reportedFor((o) => o?.region === region)
          : Number(v.by_state[state!] ?? 0) + reportedFor((o) => o?.state === state);

    // Make sure every region / state in scope has a row, even with no data yet
    if (level === "national") for (const r of regions) if (!rows.has(r)) rows.set(r, { ...emptyAgg(), key: r, label: r });
    if (level === "region") for (const s of statesIn(region!)) if (!rows.has(s)) rows.set(s, { ...emptyAgg(), key: s, label: ABBR_NAME[s] ?? s });
    if (level === "state") for (const o of offices.filter((x) => x.state === state)) if (!rows.has(o.id)) rows.set(o.id, { ...emptyAgg(), key: o.id, label: o.name });

    const order = (k: string) => (level === "national" ? (REGION_ORDER.indexOf(k) === -1 ? 99 : REGION_ORDER.indexOf(k)) : 0);
    const sortedRows = [...rows.values()].sort((a, b) => (level === "national" ? order(a.key) - order(b.key) : a.label.localeCompare(b.label)));
    const programs = [...byProgram.entries()].filter(([, val]) => val > 0).map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);

    // Community reference numbers for states in scope
    const scopeStates = level === "state" ? [state!] : level === "region" ? statesIn(region!) : [...stateRegion.keys()].filter((s) => !lockedRegion || stateRegion.get(s) === lockedRegion);
    const ref = new Map(data.reference.map((r) => [r.state, r]));
    const entered = scopeStates.filter((s) => ref.get(s)?.muslim_population != null || ref.get(s)?.mosques != null);
    const pop = scopeStates.reduce((s, st) => s + Number(ref.get(st)?.muslim_population ?? 0), 0);
    const mosques = scopeStates.reduce((s, st) => s + Number(ref.get(st)?.mosques ?? 0), 0);

    return { total, rows: sortedRows, programs, byState: byStateMap, pop, mosques, entered: entered.length, scopeStates: scopeStates.length };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, level, region, state, officeById, offices, stateRegion, lockedRegion]);

  const year = from.slice(0, 4) === to.slice(0, 4) ? Number(from.slice(0, 4)) : null;
  const goalScope = level === "state" ? { scope: "state", key: state! } : level === "region" ? { scope: "region", key: region! } : lockedRegion ? { scope: "region", key: lockedRegion } : { scope: "org", key: "" };
  const goal = year && data ? data.goals.find((g) => g.year === year && g.scope === goalScope.scope && g.scope_key === goalScope.key && g.metric === "value_of_services")?.amount ?? null : null;

  async function post(body: Record<string, unknown>) {
    const r = await fetch("/api/admin/insights/profile", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (!r.ok) {
      const j = await r.json().catch(() => ({}));
      alert(j.error ?? "Couldn't save");
      return;
    }
    setReload((n) => n + 1);
  }

  function pickState(abbr: string) {
    const r = stateRegion.get(abbr);
    if (!r || (lockedRegion && r !== lockedRegion)) return;
    if (level === "national") {
      setRegion(r);
      setState(null);
    } else {
      setRegion(r);
      setState(abbr === state ? null : abbr);
    }
  }

  const scopeName = level === "state" ? ABBR_NAME[state!] ?? state! : level === "region" ? region! : lockedRegion ?? "All regions";
  const dimLabel = level === "national" ? "Region" : level === "region" ? "State" : "Office";

  return (
    <div className="space-y-4" style={{ opacity: loading && data ? 0.55 : 1, transition: "opacity 150ms" }}>
      {/* Scope picker */}
      <div style={{ ...card, padding: "12px 14px" }}>
        <div className="flex flex-wrap items-center gap-2 text-xs mb-2" style={{ color: C.ink3 }}>
          {!lockedRegion && (
            <button onClick={() => { setRegion(null); setState(null); }} className="font-semibold" style={{ color: level === "national" ? C.ink : C.accent }}>
              United States
            </button>
          )}
          {region && (
            <>
              {!lockedRegion && <span>›</span>}
              <button onClick={() => setState(null)} className="font-semibold" style={{ color: level === "region" ? C.ink : C.accent }}>{region}</button>
            </>
          )}
          {state && (
            <>
              <span>›</span>
              <span className="font-semibold" style={{ color: C.ink }}>{ABBR_NAME[state] ?? state}</span>
            </>
          )}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {regions.map((r) => (
            <button
              key={r}
              onClick={() => { setRegion(r === region && !lockedRegion ? null : r); setState(null); }}
              className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold"
              style={{ border: `1.5px solid ${region === r ? REGION_COLOR[r] : C.border}`, background: region === r ? `${REGION_COLOR[r]}14` : "#fff", color: C.ink }}
              aria-pressed={region === r}
            >
              <span style={{ width: 10, height: 10, borderRadius: 3, background: REGION_COLOR[r], display: "inline-block" }} />
              {r}
            </button>
          ))}
        </div>
        {region && (
          <div className="flex flex-wrap gap-1 mt-2">
            {statesIn(region).map((s) => (
              <button
                key={s}
                onClick={() => setState(s === state ? null : s)}
                className="rounded-full px-2.5 py-1 text-[11px] font-semibold"
                style={state === s ? { background: C.ink, color: "#fff" } : { background: "#F4F3EE", color: C.ink2 }}
                title={ABBR_NAME[s]}
              >
                {s}
              </button>
            ))}
          </div>
        )}
      </div>

      {error && <div style={{ ...card, color: C.bad }} className="text-sm">⚠ {error}</div>}
      {!view ? (
        <div style={card} className="text-sm text-center py-16"><span style={{ color: C.ink3 }}>{loading ? "Loading…" : "No data"}</span></div>
      ) : (
        <>
          <div className="grid lg:grid-cols-5 gap-4">
            {/* Goal */}
            <div style={card} className="lg:col-span-2">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h3 className="text-sm font-bold" style={{ color: C.ink }}>Distance to goal{year ? ` · ${year}` : ""}</h3>
                  <p className="text-[11px]" style={{ color: C.ink3 }}>Value of services for {scopeName}</p>
                </div>
                {data!.canEdit && year && (
                  <InlineNumber
                    value={goal}
                    prefix="$"
                    placeholder="Set goal"
                    onSave={(v) => post({ action: "goal", year, scope: goalScope.scope, scope_key: goalScope.key, amount: v })}
                  />
                )}
              </div>
              {!year ? (
                <p className="text-xs py-10 text-center" style={{ color: C.ink3 }}>Pick a date range within one year (e.g. This year or Last year) to compare with that year&apos;s goal.</p>
              ) : goal ? (
                <>
                  <Gauge value={view.total.services} goal={goal} />
                  <p className="text-center text-xs mt-1" style={{ color: C.ink2 }}>
                    {view.total.services >= goal ? `Goal reached — ${money(view.total.services - goal)} over` : `${money(goal - view.total.services)} to go`}
                  </p>
                </>
              ) : (
                <p className="text-xs py-10 text-center" style={{ color: C.ink3 }}>No goal set for {scopeName} in {year}.{data!.canEdit ? " Use “Set goal”." : ""}</p>
              )}
            </div>

            {/* Map */}
            <div style={card} className="lg:col-span-3 relative">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h3 className="text-sm font-bold" style={{ color: C.ink }}>{level === "national" ? "Regions" : level === "region" ? `${region} states` : ABBR_NAME[state!]}</h3>
                  <p className="text-[11px]" style={{ color: C.ink3 }}>Click a state to drill into its region, then the state</p>
                </div>
              </div>
              <div onMouseLeave={() => setHover(null)}>
                <ComposableMap projection="geoAlbersUsa" width={800} height={460} style={{ width: "100%", height: "auto" }}>
                  <Geographies geography={statesTopo as any}>
                    {({ geographies }: { geographies: any[] }) =>
                      geographies.map((geo) => {
                        const abbr = STATE_ABBR[geo.properties.name];
                        const r = abbr ? stateRegion.get(abbr) : undefined;
                        const base = r ? REGION_COLOR[r] : NO_REGION;
                        const dim = (level === "region" && r !== region) || (level === "state" && abbr !== state) || (lockedRegion && r !== lockedRegion);
                        const fill = !r ? NO_REGION : dim ? (level === "state" && r === region ? `${base}55` : NO_REGION) : base;
                        return (
                          <Geography
                            key={geo.rsmKey}
                            geography={geo}
                            onClick={() => abbr && pickState(abbr)}
                            onMouseMove={(e: React.MouseEvent) => {
                              const box = (e.currentTarget as SVGElement).ownerSVGElement?.parentElement?.getBoundingClientRect();
                              if (box) setHover({ name: abbr ?? geo.properties.name, x: e.clientX - box.left, y: e.clientY - box.top });
                            }}
                            style={{
                              default: { fill, stroke: "#fff", strokeWidth: abbr === state ? 2 : 0.75, outline: "none", cursor: r ? "pointer" : "default" },
                              hover: { fill, stroke: C.ink, strokeWidth: 1.5, outline: "none", cursor: r ? "pointer" : "default" },
                              pressed: { fill, outline: "none" },
                            }}
                          />
                        );
                      })
                    }
                  </Geographies>
                </ComposableMap>
              </div>
              {hover && (
                <div
                  className="absolute pointer-events-none rounded-lg px-2.5 py-1.5 text-xs"
                  style={{ left: hover.x + 24, top: hover.y + 40, background: "#fff", border: `1px solid ${C.border}`, boxShadow: "0 4px 14px rgba(22,48,43,0.12)", color: C.ink }}
                >
                  <div className="font-semibold">{ABBR_NAME[hover.name] ?? hover.name}</div>
                  <div style={{ color: C.ink2 }}>{stateRegion.get(hover.name) ?? "No office assigned"}</div>
                  {view.byState.get(hover.name) && (
                    <div className="tabular-nums">
                      {money(view.byState.get(hover.name)!.services)} services · {num(view.byState.get(hover.name)!.people)} people
                    </div>
                  )}
                </div>
              )}
              <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1">
                {regions.map((r) => (
                  <span key={r} className="flex items-center gap-1 text-[11px]" style={{ color: C.ink2 }}>
                    <span style={{ width: 9, height: 9, borderRadius: 2, background: REGION_COLOR[r], display: "inline-block" }} />
                    {r}
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* Tiles */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {[
              { label: "Value of services", value: money(view.total.services), sub: "food + services + financial assistance" },
              { label: "Individuals served", value: num(view.total.people), sub: "across all programs" },
              { label: "Cash + in-kind raised", value: money(view.total.raised), sub: "donations, grants, cash/checks, in-kind" },
              { label: "In-kind donations received", value: money(view.total.inkind), sub: "intake station + program reports" },
              { label: "Volunteers engaged", value: num(view.total.volunteers), sub: "check-ins + DRS/FATE reported" },
              { label: "Volunteer hours", value: num(view.total.volHours), sub: "hours served" },
              { label: "Muslim population", value: view.entered ? num(view.pop) : "—", sub: `${view.entered} of ${view.scopeStates} state${view.scopeStates === 1 ? "" : "s"} entered`, ref: "muslim_population" as const },
              { label: "Number of mosques", value: view.entered ? num(view.mosques) : "—", sub: `${view.entered} of ${view.scopeStates} state${view.scopeStates === 1 ? "" : "s"} entered`, ref: "mosques" as const },
            ].map((t) => (
              <div key={t.label} style={{ ...card, padding: "14px 16px" }}>
                <div className="flex items-start justify-between gap-2">
                  <div className="text-[11px] font-semibold" style={{ color: C.ink2 }}>{t.label}</div>
                  {"ref" in t && t.ref && data!.canEdit && level === "state" && (
                    <InlineNumber
                      value={data!.reference.find((r) => r.state === state)?.[t.ref] ?? null}
                      onSave={(v) => {
                        const cur = data!.reference.find((r) => r.state === state);
                        return post({ action: "reference", state, muslim_population: t.ref === "muslim_population" ? v : cur?.muslim_population ?? "", mosques: t.ref === "mosques" ? v : cur?.mosques ?? "" });
                      }}
                    />
                  )}
                </div>
                <div className="text-xl font-bold mt-1" style={{ color: C.ink }}>{t.value}</div>
                <div className="text-[11px] mt-0.5" style={{ color: C.ink3 }}>
                  {t.sub}
                  {"ref" in t && t.ref && data!.canEdit && level !== "state" ? " · pick a state to edit" : ""}
                </div>
              </div>
            ))}
          </div>

          <div className="grid lg:grid-cols-2 gap-4">
            {/* Scope table */}
            <div style={card}>
              <div className="flex items-start justify-between gap-2 mb-2">
                <h3 className="text-sm font-bold" style={{ color: C.ink }}>By {dimLabel.toLowerCase()}</h3>
                <button
                  onClick={() => {
                    const rows = [[dimLabel, "Value of services", "Individuals served", "Cash + in-kind raised", "Volunteers", "Volunteer hours"], ...view.rows.map((r) => [r.label, Math.round(r.services), Math.round(r.people), Math.round(r.raised), r.volunteers, Math.round(r.volHours)])];
                    const csv = rows.map((r) => r.map((c) => (typeof c === "string" && /[",]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c)).join(",")).join("\n");
                    const a = document.createElement("a");
                    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
                    a.download = `regional_profile_${scopeName.replace(/\s+/g, "_")}_${from}_${to}.csv`;
                    a.click();
                  }}
                  className="text-[11px] font-semibold"
                  style={{ color: C.ink3 }}
                >
                  CSV
                </button>
              </div>
              <table className="w-full text-xs">
                <thead>
                  <tr style={{ color: C.ink2 }}>
                    <th className="py-1.5 text-left font-semibold" style={{ borderBottom: `1px solid ${C.border}` }}>{dimLabel}</th>
                    <th className="py-1.5 text-right font-semibold" style={{ borderBottom: `1px solid ${C.border}` }}>Value of services</th>
                    <th className="py-1.5 text-right font-semibold" style={{ borderBottom: `1px solid ${C.border}` }}>Individuals served</th>
                    <th className="py-1.5 text-right font-semibold" style={{ borderBottom: `1px solid ${C.border}` }}>Raised</th>
                  </tr>
                </thead>
                <tbody>
                  {view.rows.map((r) => {
                    const clickable = level === "national" ? REGION_ORDER.includes(r.key) : level === "region" && stateRegion.has(r.key);
                    return (
                      <tr
                        key={r.key}
                        onClick={() => (clickable ? (level === "national" ? (setRegion(r.key), setState(null)) : setState(r.key)) : undefined)}
                        className={clickable ? "cursor-pointer hover:bg-[rgba(31,111,84,0.04)]" : ""}
                      >
                        <td className="py-1.5" style={{ color: C.ink, borderBottom: `1px solid ${C.grid}` }}>
                          <span className="inline-flex items-center gap-1.5">
                            {level === "national" && <span style={{ width: 9, height: 9, borderRadius: 2, background: REGION_COLOR[r.key] ?? NO_REGION, display: "inline-block" }} />}
                            {r.label}
                          </span>
                        </td>
                        <td className="py-1.5 text-right tabular-nums" style={{ color: C.ink, borderBottom: `1px solid ${C.grid}` }}>{money(r.services)}</td>
                        <td className="py-1.5 text-right tabular-nums" style={{ color: C.ink, borderBottom: `1px solid ${C.grid}` }}>{num(r.people)}</td>
                        <td className="py-1.5 text-right tabular-nums" style={{ color: C.ink, borderBottom: `1px solid ${C.grid}` }}>{money(r.raised)}</td>
                      </tr>
                    );
                  })}
                  <tr>
                    <td className="py-2 font-bold" style={{ color: C.ink }}>Total</td>
                    <td className="py-2 text-right font-bold tabular-nums" style={{ color: C.ink }}>{money(view.total.services)}</td>
                    <td className="py-2 text-right font-bold tabular-nums" style={{ color: C.ink }}>{num(view.total.people)}</td>
                    <td className="py-2 text-right font-bold tabular-nums" style={{ color: C.ink }}>{money(view.total.raised)}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div className="space-y-4">
              {/* Value addition */}
              <div style={card}>
                <h3 className="text-sm font-bold" style={{ color: C.ink }}>Value addition</h3>
                <p className="text-[11px] mb-3" style={{ color: C.ink3 }}>Services delivered for every dollar raised</p>
                {(() => {
                  const max = Math.max(view.total.raised, view.total.services, 1);
                  const pct = view.total.raised ? (view.total.services / view.total.raised) * 100 : null;
                  return (
                    <div className="space-y-2.5">
                      {[
                        { label: "Cash + in-kind raised", value: view.total.raised, color: C.raised },
                        { label: "Value of services provided", value: view.total.services, color: C.data },
                      ].map((b) => (
                        <div key={b.label}>
                          <div className="flex justify-between text-xs mb-1" style={{ color: C.ink2 }}>
                            <span>{b.label}</span>
                            <span className="font-semibold tabular-nums" style={{ color: C.ink }}>{money(b.value, b.value >= 1e6)}</span>
                          </div>
                          <div className="h-4 rounded-r" style={{ background: "#F4F3EE" }}>
                            <div className="h-4 rounded-r" style={{ width: `${(b.value / max) * 100}%`, background: b.color, borderRadius: "0 4px 4px 0" }} />
                          </div>
                        </div>
                      ))}
                      <div className="text-sm font-bold pt-1" style={{ color: C.ink }}>
                        {pct != null && view.total.services === 0 ? "No services recorded in this period yet" : pct != null ? `${pct.toFixed(1)}% — $${(view.total.services / view.total.raised).toFixed(2)} of services for every $1 raised` : "No funds raised recorded in this period"}
                      </div>
                    </div>
                  );
                })()}
              </div>

              {/* Volunteers */}
              <div style={card}>
                <h3 className="text-sm font-bold mb-2" style={{ color: C.ink }}>Volunteers by {dimLabel.toLowerCase()}</h3>
                <table className="w-full text-xs">
                  <thead>
                    <tr style={{ color: C.ink2 }}>
                      <th className="py-1.5 text-left font-semibold" style={{ borderBottom: `1px solid ${C.border}` }}>{dimLabel}</th>
                      <th className="py-1.5 text-right font-semibold" style={{ borderBottom: `1px solid ${C.border}` }}>Volunteers engaged</th>
                      <th className="py-1.5 text-right font-semibold" style={{ borderBottom: `1px solid ${C.border}` }}>Volunteer hours</th>
                    </tr>
                  </thead>
                  <tbody>
                    {view.rows.map((r) => (
                      <tr key={r.key}>
                        <td className="py-1" style={{ color: C.ink, borderBottom: `1px solid ${C.grid}` }}>{r.label}</td>
                        <td className="py-1 text-right tabular-nums" style={{ color: C.ink, borderBottom: `1px solid ${C.grid}` }}>{num(r.volunteers)}</td>
                        <td className="py-1 text-right tabular-nums" style={{ color: C.ink, borderBottom: `1px solid ${C.grid}` }}>{num(r.volHours)}</td>
                      </tr>
                    ))}
                    <tr>
                      <td className="py-1.5 font-bold" style={{ color: C.ink }}>Total</td>
                      <td className="py-1.5 text-right font-bold tabular-nums" style={{ color: C.ink }}>{num(view.total.volunteers)}</td>
                      <td className="py-1.5 text-right font-bold tabular-nums" style={{ color: C.ink }}>{num(view.total.volHours)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Services by program */}
          <div style={card}>
            <h3 className="text-sm font-bold" style={{ color: C.ink }}>Value of services by program</h3>
            <p className="text-[11px] mb-2" style={{ color: C.ink3 }}>{scopeName}</p>
            {view.programs.length ? (
              <ResponsiveContainer width="100%" height={Math.max(120, view.programs.length * 32 + 30)}>
                <BarChart data={view.programs.map((p) => ({ ...p, pct: view.total.services ? (p.value / view.total.services) * 100 : 0 }))} layout="vertical" margin={{ top: 0, right: 90, bottom: 0, left: 0 }}>
                  <CartesianGrid horizontal={false} stroke={C.grid} />
                  <XAxis type="number" tickFormatter={(v) => money(v, true)} tick={{ fontSize: 11, fill: C.ink3 }} axisLine={false} tickLine={false} />
                  <YAxis type="category" dataKey="label" width={160} tick={{ fontSize: 11, fill: C.ink2 }} axisLine={false} tickLine={false} interval={0} />
                  <Tooltip
                    cursor={{ fill: "rgba(19,128,90,0.06)" }}
                    content={({ active, payload }: any) =>
                      active && payload?.length ? (
                        <div style={{ background: "#fff", border: `1px solid ${C.border}`, borderRadius: 10, padding: "8px 10px", fontSize: 12, color: C.ink }}>
                          <div style={{ color: C.ink2 }}>{payload[0].payload.label}</div>
                          <b>{money(payload[0].payload.value)}</b> · {payload[0].payload.pct.toFixed(1)}%
                        </div>
                      ) : null
                    }
                  />
                  <Bar
                    dataKey="value"
                    fill={C.data}
                    barSize={18}
                    radius={[0, 4, 4, 0]}
                    isAnimationActive={false}
                    label={{ position: "right", fontSize: 11, fill: C.ink2, formatter: (v: any) => `${money(Number(v), true)} · ${view.total.services ? ((Number(v) / view.total.services) * 100).toFixed(1) : 0}%` }}
                  />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-xs py-8 text-center" style={{ color: C.ink3 }}>No services recorded for {scopeName} in this period.</p>
            )}
          </div>

          <p className="text-[11px]" style={{ color: C.ink3 }}>
            Value of services = food distributed (at the national price list) + services value (Refugee Services, DRS, FATE, bulk distributions) + financial assistance (IRFAS, B2S).
            Raised = Salesforce donations (once the sync is connected) + grants + cash/checks + in-kind received. Multi-office states (e.g. Texas, California) combine their offices.
            Donor counts will be added once Salesforce donations are syncing.
          </p>
        </>
      )}
    </div>
  );
}
