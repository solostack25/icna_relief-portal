"use client";

import { useEffect, useMemo, useState } from "react";
import { ComposableMap, Geographies, Geography } from "react-simple-maps";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import statesTopo from "us-atlas/states-10m.json";
import GoalsPanel from "@/components/insights/GoalsPanel";
import { RAISED_METRICS, SERVICE_METRICS, type TargetMetric } from "@/lib/insightsTargets";

type Office = { id: string; name: string; region: string; state: string };
type Fact = { o: string | null; p: string; m: string; v: number };
type Profile = {
  facts: Fact[];
  volunteers: { by_office: Record<string, number>; by_state: Record<string, number>; by_region: Record<string, number>; total: number; reported_by_office: Record<string, number> };
  targets: { year: number; scope: string; scope_key: string; metric: TargetMetric; amount: number }[];
  history: { year: number; scope: string; scope_key: string; metric: string; value: number; source: string }[];
  spend: Record<string, number>;
  reference: { state: string; muslim_population: number | null; mosques: number | null }[];
  canEdit: boolean;
  lockedOffice: string | null;
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
const C = { ink: "#16302B", ink2: "rgba(22,48,43,0.62)", ink3: "rgba(22,48,43,0.45)", grid: "rgba(22,48,43,0.08)", border: "rgba(22,48,43,0.12)", data: "#13805A", raised: "#2a78d6", accent: "#1F6F54", bad: "#9B3B4F" };
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

const money = (n: number | null, compact = false) =>
  n == null ? "—" : compact ? `$${new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(n)}` : `$${Math.round(n).toLocaleString("en-US")}`;
const num = (n: number | null) => (n == null ? "—" : Math.round(n).toLocaleString("en-US"));

// null = not available (e.g. imported history that only has region totals)
type Agg = { services: number | null; people: number | null; raised: number | null; inkind: number | null; volHours: number | null; volunteers: number | null; spend: number | null };
const emptyAgg = (): Agg => ({ services: 0, people: 0, raised: 0, inkind: 0, volHours: 0, volunteers: 0, spend: 0 });
const nullAgg = (): Agg => ({ services: null, people: null, raised: null, inkind: null, volHours: null, volunteers: null, spend: null });
const add = (a: number | null, v: number) => (a ?? 0) + v;
function addFact(a: Agg, f: Fact) {
  const v = Number(f.v) || 0;
  if (SERVICE_METRICS.includes(f.m)) a.services = add(a.services, v);
  if (RAISED_METRICS.includes(f.m)) a.raised = add(a.raised, v);
  if (f.m === "people_served") a.people = add(a.people, v);
  if (f.m === "inkind_value") a.inkind = add(a.inkind, v);
  if (f.m === "volunteer_hours") a.volHours = add(a.volHours, v);
}

type Level = "national" | "region" | "state" | "office";

export default function RegionalProfiles({ from, to, offices, lockedRegion, initialRegion = null }: { from: string; to: string; offices: Office[]; lockedRegion: string | null; initialRegion?: string | null }) {
  const [data, setData] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [region, setRegion] = useState<string | null>(lockedRegion ?? initialRegion);
  const [state, setState] = useState<string | null>(null);
  const [office, setOffice] = useState<string | null>(null);
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
  const lockedOffice = data?.lockedOffice ?? null;
  useEffect(() => {
    if (!lockedOffice) return;
    const o = officeById.get(lockedOffice);
    setOffice(lockedOffice);
    setState(o?.state ?? null);
    setRegion(o?.region ?? null);
  }, [lockedOffice, officeById]);

  const stateRegion = useMemo(() => {
    const m = new Map<string, string>();
    for (const o of offices) if (o.state && o.state !== "HQ" && o.region && o.region !== "UNASSIGNED" && !m.has(o.state)) m.set(o.state, o.region);
    return m;
  }, [offices]);
  const regions = REGION_ORDER.filter((r) => !lockedRegion || r === lockedRegion);
  const statesIn = (r: string) => [...stateRegion.entries()].filter(([, rr]) => rr === r).map(([s]) => s).sort();

  const level: Level = office ? "office" : state ? "state" : region ? "region" : "national";
  const year = from.slice(0, 4) === to.slice(0, 4) ? Number(from.slice(0, 4)) : null;
  const historyRows = useMemo(() => (data && year ? data.history.filter((h) => h.year === year) : []), [data, year]);
  // Before the portal existed only imported annual totals are available
  const historical = !!year && historyRows.length > 0 && !(data?.facts ?? []).some((f) => SERVICE_METRICS.includes(f.m) && Number(f.v) > 0);
  const hist = (scope: string, key: string, metric: string) => {
    const h = historyRows.find((x) => x.scope === scope && x.scope_key === key && x.metric === metric);
    return h ? Number(h.value) : null;
  };

  const view = useMemo(() => {
    if (!data) return null;
    const rowKeys: { key: string; label: string }[] =
      level === "national"
        ? [...regions.map((r) => ({ key: r, label: r })), ...(lockedRegion ? [] : [{ key: "UNASSIGNED", label: "UNASSIGNED" }])]
        : level === "region"
          ? statesIn(region!).map((s) => ({ key: s, label: ABBR_NAME[s] ?? s }))
          : level === "state"
            ? offices.filter((o) => o.state === state).map((o) => ({ key: o.id, label: o.name }))
            : [{ key: office!, label: officeById.get(office!)?.name ?? "Office" }];

    if (historical) {
      const scopeOf = level === "national" ? "region" : level === "region" ? "state" : "office";
      const rows = rowKeys.map((rk) => ({
        ...nullAgg(),
        ...rk,
        services: hist(scopeOf, rk.key, "value_of_services"),
        people: hist(scopeOf, rk.key, "people_served"),
        volunteers: hist(scopeOf, rk.key, "volunteers"),
        volHours: hist(scopeOf, rk.key, "volunteer_hours"),
      }));
      const totScope = level === "national" ? (lockedRegion ? ["region", lockedRegion] : ["org", ""]) : level === "region" ? ["region", region!] : level === "state" ? ["state", state!] : ["office", office!];
      const total: Agg = {
        ...nullAgg(),
        services: hist(totScope[0], totScope[1], "value_of_services"),
        people: hist(totScope[0], totScope[1], "people_served"),
        raised: hist(totScope[0], totScope[1], "raised"),
        inkind: hist(totScope[0], totScope[1], "inkind_value"),
        volunteers: hist(totScope[0], totScope[1], "volunteers"),
        volHours: hist(totScope[0], totScope[1], "volunteer_hours"),
      };
      const national = level === "national" && !lockedRegion;
      const programs = national
        ? historyRows.filter((h) => h.scope === "org" && h.metric.startsWith("services:")).map((h) => ({ label: h.metric.slice(9), value: Number(h.value) })).sort((a, b) => b.value - a.value)
        : [];
      const sources = [...new Set(historyRows.map((h) => h.source.replace(/ \(program share\)$/, "")))];
      return {
        total,
        rows,
        programs,
        byState: new Map<string, Agg>(),
        pop: national ? hist("org", "", "muslim_population") : null,
        mosques: national ? hist("org", "", "mosques") : null,
        entered: null as number | null,
        scopeStates: 0,
        donors: national ? { total: hist("org", "", "donors_total"), unique: hist("org", "", "donors_unique") } : null,
        sources,
        fundraisingActual: national ? hist("org", "", "fundraising") : null,
      };
    }

    const inScope = (officeId: string | null) => {
      const o = officeId ? officeById.get(officeId) : null;
      if (level === "national") return !lockedRegion || o?.region === lockedRegion;
      if (level === "region") return o?.region === region;
      if (level === "state") return o?.state === state;
      return officeId === office;
    };
    const rowKeyOf = (officeId: string | null) => {
      const o = officeId ? officeById.get(officeId) : null;
      if (level === "national") return o?.region && o.region !== "UNASSIGNED" ? o.region : "UNASSIGNED";
      if (level === "region") return o?.state ?? "—";
      return o ? o.id : "—";
    };
    const total = emptyAgg();
    const rows = new Map<string, Agg & { key: string; label: string }>(rowKeys.map((rk) => [rk.key, { ...emptyAgg(), ...rk }]));
    const byProgram = new Map<string, number>();
    const byState = new Map<string, Agg>();
    for (const f of data.facts) {
      const o = f.o ? officeById.get(f.o) : null;
      if (o?.state) {
        const st = byState.get(o.state) ?? emptyAgg();
        addFact(st, f);
        byState.set(o.state, st);
      }
      if (!inScope(f.o)) continue;
      addFact(total, f);
      const k = rowKeyOf(f.o);
      const row = rows.get(k) ?? { ...emptyAgg(), key: k, label: k };
      addFact(row, f);
      rows.set(k, row);
      if (SERVICE_METRICS.includes(f.m)) byProgram.set(f.p, (byProgram.get(f.p) ?? 0) + Number(f.v));
    }
    for (const [oid, v] of Object.entries(data.spend ?? {})) {
      if (!inScope(oid || null)) continue;
      total.spend = add(total.spend, Number(v));
      const row = rows.get(rowKeyOf(oid || null));
      if (row) row.spend = add(row.spend, Number(v));
    }
    const v = data.volunteers;
    const reportedFor = (pred: (o: Office | undefined) => boolean) => Object.entries(v.reported_by_office ?? {}).reduce((acc, [id, n]) => acc + (pred(officeById.get(id)) ? Number(n) : 0), 0);
    for (const row of rows.values()) {
      if (level === "national") row.volunteers = Number(v.by_region?.[row.key] ?? 0) + reportedFor((o) => (o?.region ?? "UNASSIGNED") === row.key);
      else if (level === "region") row.volunteers = Number(v.by_state?.[row.key] ?? 0) + reportedFor((o) => o?.state === row.key);
      else row.volunteers = Number(v.by_office?.[row.key] ?? 0) + Number(v.reported_by_office?.[row.key] ?? 0);
    }
    total.volunteers =
      level === "national"
        ? (lockedRegion ? Number(v.by_region?.[lockedRegion] ?? 0) : Number(v.total ?? 0)) + reportedFor((o) => !lockedRegion || o?.region === lockedRegion)
        : level === "region"
          ? Number(v.by_region?.[region!] ?? 0) + reportedFor((o) => o?.region === region)
          : level === "state"
            ? Number(v.by_state?.[state!] ?? 0) + reportedFor((o) => o?.state === state)
            : Number(v.by_office?.[office!] ?? 0) + Number(v.reported_by_office?.[office!] ?? 0);

    const programs = [...byProgram.entries()].filter(([, val]) => val > 0).map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
    const scopeStates =
      level === "office" || level === "state" ? [state!] : level === "region" ? statesIn(region!) : [...stateRegion.keys()].filter((st) => !lockedRegion || stateRegion.get(st) === lockedRegion);
    const ref = new Map(data.reference.map((r) => [r.state, r]));
    const entered = scopeStates.filter((st) => ref.get(st)?.muslim_population != null || ref.get(st)?.mosques != null).length;
    const pop = entered ? scopeStates.reduce((acc, st) => acc + Number(ref.get(st)?.muslim_population ?? 0), 0) : null;
    const mosques = entered ? scopeStates.reduce((acc, st) => acc + Number(ref.get(st)?.mosques ?? 0), 0) : null;
    const rowList = [...rows.values()].filter((r) => level !== "national" || r.key !== "UNASSIGNED" || (r.services ?? 0) + (r.people ?? 0) + (r.raised ?? 0) > 0);
    return { total, rows: rowList, programs, byState, pop, mosques, entered, scopeStates: scopeStates.length, donors: null, sources: [] as string[], fundraisingActual: null as number | null };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, level, region, state, office, officeById, offices, stateRegion, lockedRegion, historical, historyRows]);

  // Goals & budget for the current scope
  const goalScope = level === "office" ? ["office", office!] : level === "state" ? ["state", state!] : level === "region" ? ["region", region!] : lockedRegion ? ["region", lockedRegion] : ["org", ""];
  const targets = useMemo(() => {
    const out: Partial<Record<TargetMetric, number>> = {};
    for (const t of data?.targets ?? []) if (t.year === year && t.scope === goalScope[0] && t.scope_key === goalScope[1]) out[t.metric] = Number(t.amount);
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, year, goalScope[0], goalScope[1]]);

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
    if (lockedOffice) return;
    const r = stateRegion.get(abbr);
    if (!r || (lockedRegion && r !== lockedRegion)) return;
    setOffice(null);
    setRegion(r);
    setState(level === "national" ? null : abbr === state ? null : abbr);
  }

  const scopeName = level === "office" ? officeById.get(office!)?.name ?? "Office" : level === "state" ? ABBR_NAME[state!] ?? state! : level === "region" ? region! : lockedRegion ?? "All regions";
  const dimLabel = level === "national" ? "Region" : level === "region" ? "State" : "Office";
  const s = view?.total;
  const crumbs = { color: C.accent };

  return (
    <div className="space-y-4" style={{ opacity: loading && data ? 0.55 : 1, transition: "opacity 150ms" }}>
      {/* Scope picker */}
      <div style={{ ...card, padding: "12px 14px" }}>
        <div className="flex flex-wrap items-center gap-2 text-xs" style={{ color: C.ink3 }}>
          {!lockedRegion && (
            <button onClick={() => { setRegion(null); setState(null); setOffice(null); }} className="font-semibold" style={level === "national" ? { color: C.ink } : crumbs}>
              United States
            </button>
          )}
          {region && (
            <>
              {!lockedRegion && <span>›</span>}
              <button onClick={() => !lockedOffice && (setState(null), setOffice(null))} className="font-semibold" style={level === "region" || lockedOffice ? { color: C.ink } : crumbs}>{region}</button>
            </>
          )}
          {state && (
            <>
              <span>›</span>
              <button onClick={() => !lockedOffice && setOffice(null)} className="font-semibold" style={level === "state" || lockedOffice ? { color: C.ink } : crumbs}>{ABBR_NAME[state] ?? state}</button>
            </>
          )}
          {office && (
            <>
              <span>›</span>
              <span className="font-semibold" style={{ color: C.ink }}>{officeById.get(office)?.name}</span>
            </>
          )}
        </div>
        {!lockedOffice && (
          <>
            <div className="flex flex-wrap gap-1.5 mt-2">
              {regions.map((r) => (
                <button
                  key={r}
                  onClick={() => { setRegion(r === region && !lockedRegion ? null : r); setState(null); setOffice(null); }}
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
                {statesIn(region).map((st) => (
                  <button
                    key={st}
                    onClick={() => { setState(st === state ? null : st); setOffice(null); }}
                    className="rounded-full px-2.5 py-1 text-[11px] font-semibold"
                    style={state === st ? { background: C.ink, color: "#fff" } : { background: "#F4F3EE", color: C.ink2 }}
                    title={ABBR_NAME[st]}
                  >
                    {st}
                  </button>
                ))}
              </div>
            )}
            {state && (
              <div className="flex flex-wrap gap-1 mt-2">
                {offices.filter((o) => o.state === state).map((o) => (
                  <button
                    key={o.id}
                    onClick={() => setOffice(o.id === office ? null : o.id)}
                    className="rounded-full px-2.5 py-1 text-[11px] font-semibold"
                    style={office === o.id ? { background: C.accent, color: "#fff" } : { background: "#F4F3EE", color: C.ink2 }}
                  >
                    {o.name}
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {historical && view && (
        <div className="rounded-2xl px-4 py-2.5 text-[12px]" style={{ background: "#FBF3E3", color: "#6B4E12" }}>
          {year} figures are annual totals imported from before the portal ({view.sources.join("; ")}). Region totals are complete; state and office detail only exists for volunteers.
        </div>
      )}

      {error && <div style={{ ...card, color: C.bad }} className="text-sm">⚠ {error}</div>}
      {!view || !s ? (
        <div style={card} className="text-sm text-center py-16"><span style={{ color: C.ink3 }}>{loading ? "Loading…" : "No data"}</span></div>
      ) : (
        <>
          <div className="grid lg:grid-cols-5 gap-4">
            <div style={card} className="lg:col-span-2">
              <h3 className="text-sm font-bold" style={{ color: C.ink }}>Goals &amp; budget{year ? ` · ${year}` : ""}</h3>
              <p className="text-[11px] mb-3" style={{ color: C.ink3 }}>
                {scopeName} · set by upper management{data!.canEdit ? " — edit here or under Settings → Goals & Budgets" : ""}
              </p>
              <GoalsPanel
                year={year}
                scopeName={scopeName}
                targets={targets}
                actual={{
                  fundraising: historical ? view.fundraisingActual ?? s.raised ?? 0 : s.raised ?? 0,
                  value_of_services: s.services ?? 0,
                  people_served: s.people ?? 0,
                  budget: s.spend ?? 0,
                }}
                onSave={data!.canEdit && year ? (metric, v) => post({ action: "target", year, scope: goalScope[0], scope_key: goalScope[1], metric, amount: v }) : undefined}
              />
            </div>

            <div style={card} className="lg:col-span-3 relative">
              <h3 className="text-sm font-bold" style={{ color: C.ink }}>
                {level === "national" ? "Regions" : level === "region" ? `${region} states` : ABBR_NAME[state!] ?? scopeName}
              </h3>
              <p className="text-[11px]" style={{ color: C.ink3 }}>{lockedOffice ? "Your office's state" : "Click a state to drill into its region, then the state"}</p>
              <div onMouseLeave={() => setHover(null)}>
                <ComposableMap projection="geoAlbersUsa" width={800} height={460} style={{ width: "100%", height: "auto" }}>
                  <Geographies geography={statesTopo as any}>
                    {({ geographies }: { geographies: any[] }) =>
                      geographies.map((geo) => {
                        const abbr = STATE_ABBR[geo.properties.name];
                        const r = abbr ? stateRegion.get(abbr) : undefined;
                        const base = r ? REGION_COLOR[r] : NO_REGION;
                        const focusState = level === "state" || level === "office";
                        const dim = (level === "region" && r !== region) || (focusState && abbr !== state) || (!!lockedRegion && r !== lockedRegion);
                        const fill = !r ? NO_REGION : dim ? (focusState && r === region ? `${base}55` : NO_REGION) : base;
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
                              default: { fill, stroke: "#fff", strokeWidth: abbr === state ? 2 : 0.75, outline: "none", cursor: r && !lockedOffice ? "pointer" : "default" },
                              hover: { fill, stroke: C.ink, strokeWidth: 1.5, outline: "none", cursor: r && !lockedOffice ? "pointer" : "default" },
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
              { label: "Value of services", value: money(s.services), sub: "food + services + financial assistance" },
              { label: "Individuals served", value: num(s.people), sub: "across all programs" },
              { label: "Cash + in-kind raised", value: money(s.raised), sub: "donations, grants, cash/checks, in-kind" },
              { label: "In-kind donations received", value: money(s.inkind), sub: "intake station + program reports" },
              { label: "Volunteers engaged", value: num(s.volunteers), sub: historical ? "volunteer engagements" : "check-ins + DRS/FATE reported" },
              { label: "Volunteer hours", value: num(s.volHours), sub: "hours served" },
              ...(view.donors
                ? [
                    { label: "Total donors in Salesforce", value: num(view.donors.total), sub: "as of the report" },
                    { label: "Unique donors this year", value: num(view.donors.unique), sub: `${year}` },
                  ]
                : []),
              { label: "Muslim population", value: num(view.pop), sub: view.entered == null ? "from the report" : `${view.entered} of ${view.scopeStates} state${view.scopeStates === 1 ? "" : "s"} entered`, ref: "muslim_population" as const },
              { label: "Number of mosques", value: num(view.mosques), sub: view.entered == null ? "from the report" : `${view.entered} of ${view.scopeStates} state${view.scopeStates === 1 ? "" : "s"} entered`, ref: "mosques" as const },
              ...(!historical ? [{ label: "Spent (finance tickets paid)", value: money(s.spend), sub: "by billing office" }] : []),
            ].map((t) => (
              <div key={t.label} style={{ ...card, padding: "14px 16px" }}>
                <div className="flex items-start justify-between gap-2">
                  <div className="text-[11px] font-semibold" style={{ color: C.ink2 }}>{t.label}</div>
                  {"ref" in t && t.ref && data!.canEdit && (level === "state" || level === "office") && !historical && (
                    <button
                      className="text-[11px] font-semibold"
                      style={{ color: C.accent }}
                      onClick={() => {
                        const cur = data!.reference.find((r) => r.state === state);
                        const v = prompt(`${t.label} for ${ABBR_NAME[state!] ?? state}`, String(cur?.[t.ref!] ?? ""));
                        if (v === null) return;
                        post({ action: "reference", state, muslim_population: t.ref === "muslim_population" ? v : cur?.muslim_population ?? "", mosques: t.ref === "mosques" ? v : cur?.mosques ?? "" });
                      }}
                    >
                      Edit
                    </button>
                  )}
                </div>
                <div className="text-xl font-bold mt-1" style={{ color: C.ink }}>{t.value}</div>
                <div className="text-[11px] mt-0.5" style={{ color: C.ink3 }}>{t.sub}</div>
              </div>
            ))}
          </div>

          {level !== "office" && (
            <div className="grid lg:grid-cols-2 gap-4">
              <div style={card}>
                <div className="flex items-start justify-between gap-2 mb-2">
                  <h3 className="text-sm font-bold" style={{ color: C.ink }}>By {dimLabel.toLowerCase()}</h3>
                  <button
                    onClick={() => {
                      const rows = [[dimLabel, "Value of services", "Individuals served", "Cash + in-kind raised", "Spent", "Volunteers", "Volunteer hours"], ...view.rows.map((r) => [r.label, r.services ?? "", r.people ?? "", r.raised ?? "", r.spend ?? "", r.volunteers ?? "", r.volHours ?? ""])];
                      const csv = rows.map((r) => r.map((c) => (typeof c === "string" && /[",]/.test(c) ? `"${c.replace(/"/g, '""')}"` : typeof c === "number" ? Math.round(c) : c)).join(",")).join("\n");
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
                      {[dimLabel, "Value of services", "Individuals served", historical ? "Volunteers" : "Raised"].map((h, i) => (
                        <th key={h} className={`py-1.5 font-semibold ${i ? "text-right" : "text-left"}`} style={{ borderBottom: `1px solid ${C.border}` }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {view.rows.map((r) => {
                      const clickable = !lockedOffice && (level === "national" ? REGION_ORDER.includes(r.key) : level === "region" ? stateRegion.has(r.key) : level === "state");
                      return (
                        <tr
                          key={r.key}
                          onClick={() => {
                            if (!clickable) return;
                            if (level === "national") { setRegion(r.key); setState(null); setOffice(null); }
                            else if (level === "region") { setState(r.key); setOffice(null); }
                            else setOffice(r.key);
                          }}
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
                          <td className="py-1.5 text-right tabular-nums" style={{ color: C.ink, borderBottom: `1px solid ${C.grid}` }}>{historical ? num(r.volunteers) : money(r.raised)}</td>
                        </tr>
                      );
                    })}
                    <tr>
                      <td className="py-2 font-bold" style={{ color: C.ink }}>Total</td>
                      <td className="py-2 text-right font-bold tabular-nums" style={{ color: C.ink }}>{money(s.services)}</td>
                      <td className="py-2 text-right font-bold tabular-nums" style={{ color: C.ink }}>{num(s.people)}</td>
                      <td className="py-2 text-right font-bold tabular-nums" style={{ color: C.ink }}>{historical ? num(s.volunteers) : money(s.raised)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <div className="space-y-4">
                <div style={card}>
                  <h3 className="text-sm font-bold" style={{ color: C.ink }}>Value addition</h3>
                  <p className="text-[11px] mb-3" style={{ color: C.ink3 }}>Services delivered for every dollar raised</p>
                  {s.raised == null || s.services == null ? (
                    <p className="text-xs" style={{ color: C.ink3 }}>Not available for this scope in {year}.</p>
                  ) : (
                    <div className="space-y-2.5">
                      {[
                        { label: "Cash + in-kind raised", value: s.raised, color: C.raised },
                        { label: "Value of services provided", value: s.services, color: C.data },
                      ].map((b) => (
                        <div key={b.label}>
                          <div className="flex justify-between text-xs mb-1" style={{ color: C.ink2 }}>
                            <span>{b.label}</span>
                            <span className="font-semibold tabular-nums" style={{ color: C.ink }}>{money(b.value, b.value >= 1e6)}</span>
                          </div>
                          <div className="h-4" style={{ background: "#F4F3EE", borderRadius: "0 4px 4px 0" }}>
                            <div className="h-4" style={{ width: `${(b.value / Math.max(s.raised!, s.services!, 1)) * 100}%`, background: b.color, borderRadius: "0 4px 4px 0" }} />
                          </div>
                        </div>
                      ))}
                      <div className="text-sm font-bold pt-1" style={{ color: C.ink }}>
                        {!s.raised ? "No funds raised recorded in this period" : !s.services ? "No services recorded in this period yet" : `${((s.services / s.raised) * 100).toFixed(1)}% — $${(s.services / s.raised).toFixed(2)} of services for every $1 raised`}
                      </div>
                    </div>
                  )}
                </div>

                <div style={card}>
                  <h3 className="text-sm font-bold mb-2" style={{ color: C.ink }}>Volunteers by {dimLabel.toLowerCase()}</h3>
                  <table className="w-full text-xs">
                    <thead>
                      <tr style={{ color: C.ink2 }}>
                        {[dimLabel, "Volunteers engaged", "Volunteer hours"].map((h, i) => (
                          <th key={h} className={`py-1.5 font-semibold ${i ? "text-right" : "text-left"}`} style={{ borderBottom: `1px solid ${C.border}` }}>{h}</th>
                        ))}
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
                        <td className="py-1.5 text-right font-bold tabular-nums" style={{ color: C.ink }}>{num(s.volunteers)}</td>
                        <td className="py-1.5 text-right font-bold tabular-nums" style={{ color: C.ink }}>{num(s.volHours)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          <div style={card}>
            <h3 className="text-sm font-bold" style={{ color: C.ink }}>Value of services by program</h3>
            <p className="text-[11px] mb-2" style={{ color: C.ink3 }}>{scopeName}</p>
            {view.programs.length ? (
              <ResponsiveContainer width="100%" height={Math.max(120, view.programs.length * 32 + 30)}>
                <BarChart data={view.programs} layout="vertical" margin={{ top: 0, right: 100, bottom: 0, left: 0 }}>
                  <CartesianGrid horizontal={false} stroke={C.grid} />
                  <XAxis type="number" tickFormatter={(v) => money(v, true)} tick={{ fontSize: 11, fill: C.ink3 }} axisLine={false} tickLine={false} />
                  <YAxis type="category" dataKey="label" width={160} tick={{ fontSize: 11, fill: C.ink2 }} axisLine={false} tickLine={false} interval={0} />
                  <Tooltip
                    cursor={{ fill: "rgba(19,128,90,0.06)" }}
                    content={({ active, payload }: any) =>
                      active && payload?.length ? (
                        <div style={{ background: "#fff", border: `1px solid ${C.border}`, borderRadius: 10, padding: "8px 10px", fontSize: 12, color: C.ink }}>
                          <div style={{ color: C.ink2 }}>{payload[0].payload.label}</div>
                          <b>{money(payload[0].payload.value)}</b>
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
                    label={{ position: "right", fontSize: 11, fill: C.ink2, formatter: (v: any) => `${money(Number(v), true)} · ${s.services ? ((Number(v) / s.services) * 100).toFixed(1) : 0}%` }}
                  />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-xs py-8 text-center" style={{ color: C.ink3 }}>
                {historical ? `The ${year} import only has the program split for the whole organization.` : `No services recorded for ${scopeName} in this period.`}
              </p>
            )}
          </div>

          <p className="text-[11px]" style={{ color: C.ink3 }}>
            Value of services = food distributed (at the national price list) + services value (Refugee Services, DRS, FATE, bulk distributions) + financial assistance (IRFAS, B2S).
            Raised = Salesforce donations (once the sync is connected) + grants + cash/checks + in-kind received. Spent = finance tickets marked paid, by billing office.
          </p>
        </>
      )}
    </div>
  );
}
