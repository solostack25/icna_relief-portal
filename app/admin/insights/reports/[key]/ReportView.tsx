"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { REPORT, type Chart, type Matrix, type ReportPayload, type Unit } from "@/lib/reportsSuite/catalog";

type Office = { id: string; name: string; region: string; state: string };
const REGIONS = ["DMV", "MIDWEST 1", "MIDWEST 2", "NORTHEAST", "SOUTH CENTRAL", "SOUTHEAST", "WEST"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
// Year series use the validated categorical palette in fixed order (oldest → newest)
const YEAR_COLORS = ["#2a78d6", "#eb6834", "#1baf7a"];
const C = { ink: "#16302B", ink2: "rgba(22,48,43,0.62)", ink3: "rgba(22,48,43,0.45)", grid: "rgba(22,48,43,0.08)", border: "rgba(22,48,43,0.12)", data: "#13805A", raised: "#2a78d6", accent: "#1F6F54", bad: "#9B3B4F", head: "#22427A" };
const card: React.CSSProperties = { background: "#fff", borderRadius: 18, boxShadow: "0 3px 12px rgba(22,48,43,0.06)", padding: "16px 18px" };
const sel: React.CSSProperties = { border: `1px solid ${C.border}`, borderRadius: 10, padding: "6px 10px", fontSize: 13, background: "#fff", color: C.ink, minWidth: 0 };

function fmt(v: number | null | undefined, unit: Unit | undefined, compact = false): string {
  if (v == null || Number.isNaN(v)) return "—";
  if (unit === "pct") return `${v.toFixed(Math.abs(v) < 10 ? 1 : 0)}%`;
  const s = compact ? new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(v) : Math.round(v).toLocaleString("en-US");
  if (unit === "money") return v < 0 ? `-$${s.replace("-", "")}` : `$${s}`;
  if (unit === "lbs") return `${s} lbs`;
  if (unit === "hours") return `${s} hrs`;
  return s;
}

function csv(name: string, rows: (string | number | null)[][]) {
  const text = rows.map((r) => r.map((c) => (c == null ? "" : typeof c === "string" && /[",\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c)).join(",")).join("\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type: "text/csv" }));
  a.download = name;
  a.click();
}

function MatrixTable({ m, file }: { m: Matrix; file: string }) {
  const [open, setOpen] = useState<Set<string>>(new Set());
  const hasChildren = m.rows.some((r) => r.children?.length);
  return (
    <div style={card}>
      <div className="flex items-start justify-between gap-2 mb-2">
        <div>
          <h3 className="text-sm font-bold" style={{ color: C.ink }}>{m.title}</h3>
          {m.note && <p className="text-[11px]" style={{ color: C.ink3 }}>{m.note}</p>}
        </div>
        <div className="flex gap-2 shrink-0">
          {hasChildren && (
            <button onClick={() => setOpen(open.size ? new Set() : new Set(m.rows.map((r) => r.key)))} className="text-[11px] font-semibold" style={{ color: C.ink3 }}>
              {open.size ? "Collapse all" : "Expand all"}
            </button>
          )}
          <button
            onClick={() =>
              csv(`${file}.csv`, [
                [m.dim, ...m.columns.map((c) => c.label)],
                ...m.rows.flatMap((r) => [[r.label, ...m.columns.map((c) => r.values[c.key] ?? null)], ...(r.children ?? []).map((ch) => [`  ${ch.label}`, ...m.columns.map((c) => ch.values[c.key] ?? null)])]),
                ...(m.total ? [["Total", ...m.columns.map((c) => m.total![c.key] ?? null)]] : []),
              ])
            }
            className="text-[11px] font-semibold"
            style={{ color: C.ink3 }}
          >
            CSV
          </button>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs" style={{ minWidth: Math.max(560, 160 + m.columns.length * 100) }}>
          <thead>
            <tr>
              <th className="py-2 px-2 text-left font-semibold" style={{ background: C.head, color: "#fff", borderRadius: "8px 0 0 0" }}>{m.dim}</th>
              {m.columns.map((c, i) => (
                <th key={c.key} className="py-2 px-2 text-right font-semibold" style={{ background: C.head, color: "#fff", borderRadius: i === m.columns.length - 1 ? "0 8px 0 0" : undefined }}>{c.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {m.rows.map((r) => {
              const isOpen = open.has(r.key);
              const kids = r.children ?? [];
              return (
                <Fragment key={r.key}>
                  <tr
                    onClick={() => {
                      if (!kids.length) return;
                      const s = new Set(open);
                      s.has(r.key) ? s.delete(r.key) : s.add(r.key);
                      setOpen(s);
                    }}
                    className={kids.length ? "cursor-pointer hover:bg-[rgba(34,66,122,0.04)]" : ""}
                    aria-expanded={kids.length ? isOpen : undefined}
                  >
                    <td className="py-1.5 px-2 font-semibold whitespace-nowrap" style={{ color: C.ink, borderBottom: `1px solid ${C.grid}` }}>
                      {hasChildren && <span className="inline-block w-4 text-[10px]" style={{ color: C.ink3 }}>{kids.length ? (isOpen ? "▼" : "▶") : ""}</span>}
                      {r.label}
                    </td>
                    {m.columns.map((c) => (
                      <td key={c.key} className="py-1.5 px-2 text-right tabular-nums" style={{ color: c.unit === "money" && Number(r.values[c.key]) < 0 ? C.bad : C.ink, borderBottom: `1px solid ${C.grid}` }}>
                        {fmt(r.values[c.key] as number, c.unit)}
                      </td>
                    ))}
                  </tr>
                  {isOpen &&
                    kids.map((ch) => (
                      <tr key={ch.key} style={{ background: "rgba(34,66,122,0.03)" }}>
                        <td className="py-1 px-2 pl-7" style={{ color: C.ink2, borderBottom: `1px solid ${C.grid}` }}>{ch.label}</td>
                        {m.columns.map((c) => (
                          <td key={c.key} className="py-1 px-2 text-right tabular-nums" style={{ color: C.ink2, borderBottom: `1px solid ${C.grid}` }}>{fmt(ch.values[c.key] as number, c.unit)}</td>
                        ))}
                      </tr>
                    ))}
                </Fragment>
              );
            })}
            {m.total && (
              <tr>
                <td className="py-2 px-2 font-bold" style={{ color: C.ink, borderTop: `1.5px solid ${C.border}` }}>Total</td>
                {m.columns.map((c) => (
                  <td key={c.key} className="py-2 px-2 text-right font-bold tabular-nums" style={{ color: C.ink, borderTop: `1.5px solid ${C.border}` }}>{fmt(m.total![c.key] as number, c.unit)}</td>
                ))}
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ChartBlock({ ch, file }: { ch: Chart; file: string }) {
  const [asTable, setAsTable] = useState(false);
  const head = (title: string, note?: string, onCsv?: () => void, toggle = true) => (
    <div className="flex items-start justify-between gap-2 mb-2">
      <div>
        <h3 className="text-sm font-bold" style={{ color: C.ink }}>{title}</h3>
        {note && <p className="text-[11px]" style={{ color: C.ink3 }}>{note}</p>}
      </div>
      <div className="flex gap-2 shrink-0">
        {toggle && (
          <button onClick={() => setAsTable(!asTable)} className="text-[11px] font-semibold" style={{ color: C.ink3 }}>
            {asTable ? "Chart" : "Table"}
          </button>
        )}
        {onCsv && (
          <button onClick={onCsv} className="text-[11px] font-semibold" style={{ color: C.ink3 }}>
            CSV
          </button>
        )}
      </div>
    </div>
  );

  if (ch.kind === "value-addition") {
    const max = Math.max(ch.raised, ch.services, 1);
    return (
      <div style={card}>
        {head(ch.title, "Services delivered for every dollar raised", undefined, false)}
        {[
          { label: "Cash + in-kind raised", v: ch.raised, color: C.raised },
          { label: "Services provided", v: ch.services, color: C.data },
        ].map((b) => (
          <div key={b.label} className="mb-2">
            <div className="flex justify-between text-xs mb-1" style={{ color: C.ink2 }}>
              <span>{b.label}</span>
              <span className="font-semibold tabular-nums" style={{ color: C.ink }}>{fmt(b.v, "money", b.v >= 1e6)}</span>
            </div>
            <div className="h-4" style={{ background: "#F4F3EE", borderRadius: "0 4px 4px 0" }}>
              <div className="h-4" style={{ width: `${(b.v / max) * 100}%`, background: b.color, borderRadius: "0 4px 4px 0" }} />
            </div>
          </div>
        ))}
        <div className="text-sm font-bold" style={{ color: C.ink }}>
          {ch.raised ? `${((ch.services / ch.raised) * 100).toFixed(1)}% — $${(ch.services / ch.raised).toFixed(2)} of services per $1 raised` : ch.services ? "No funds raised recorded" : "Nothing recorded yet"}
        </div>
      </div>
    );
  }

  if (ch.kind === "table") {
    return (
      <div style={card}>
        {head(ch.title, ch.note, () => csv(`${file}-${ch.title}.csv`, [ch.columns.map((c) => c.label), ...ch.rows.map((r) => ch.columns.map((c) => (r[c.key] ?? null) as any))]), false)}
        {ch.rows.length ? (
          <div className="overflow-auto max-h-[460px]">
            <table className="w-full text-xs">
              <thead className="sticky top-0" style={{ background: "#fff" }}>
                <tr>
                  {ch.columns.map((c, i) => (
                    <th key={c.key} className={`py-1.5 px-2 font-semibold ${c.unit && i ? "text-right" : "text-left"}`} style={{ color: C.ink2, borderBottom: `1px solid ${C.border}` }}>{c.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ch.rows.map((r, i) => (
                  <tr key={i}>
                    {ch.columns.map((c, j) => (
                      <td key={c.key} className={`py-1 px-2 ${c.unit && j ? "text-right tabular-nums" : ""}`} style={{ color: C.ink, borderBottom: `1px solid ${C.grid}` }}>
                        {c.unit ? fmt(r[c.key] as number, c.unit) : String(r[c.key] ?? "—")}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-xs py-6 text-center" style={{ color: C.ink3 }}>Nothing yet.</p>
        )}
      </div>
    );
  }

  if (ch.kind === "share") {
    const total = ch.items.reduce((s, i) => s + i.value, 0);
    const rows = ch.items.map((i) => ({ ...i, pct: total ? (i.value / total) * 100 : 0 }));
    return (
      <div style={card}>
        {head(ch.title, ch.note, () => csv(`${file}-${ch.title}.csv`, [["Item", "Value", "%"], ...rows.map((r) => [r.label, Math.round(r.value), r.pct.toFixed(1)])]))}
        {!rows.length ? (
          <p className="text-xs py-6 text-center" style={{ color: C.ink3 }}>Nothing recorded for this period.</p>
        ) : asTable ? (
          <table className="w-full text-xs">
            <tbody>
              {rows.map((r) => (
                <tr key={r.label}>
                  <td className="py-1" style={{ color: C.ink, borderBottom: `1px solid ${C.grid}` }}>{r.label}</td>
                  <td className="py-1 text-right tabular-nums" style={{ color: C.ink, borderBottom: `1px solid ${C.grid}` }}>{fmt(r.value, ch.unit)}</td>
                  <td className="py-1 text-right tabular-nums w-14" style={{ color: C.ink2, borderBottom: `1px solid ${C.grid}` }}>{r.pct.toFixed(1)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <ResponsiveContainer width="100%" height={Math.max(110, rows.length * 28 + 24)}>
            <BarChart data={rows} layout="vertical" margin={{ top: 0, right: 84, bottom: 0, left: 0 }}>
              <CartesianGrid horizontal={false} stroke={C.grid} />
              <XAxis type="number" tickFormatter={(v) => fmt(v, ch.unit, true)} tick={{ fontSize: 10, fill: C.ink3 }} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey="label" width={150} tick={{ fontSize: 11, fill: C.ink2 }} axisLine={false} tickLine={false} interval={0} />
              <Tooltip
                cursor={{ fill: "rgba(19,128,90,0.06)" }}
                content={({ active, payload }: any) =>
                  active && payload?.length ? (
                    <div style={{ background: "#fff", border: `1px solid ${C.border}`, borderRadius: 10, padding: "6px 10px", fontSize: 12, color: C.ink }}>
                      {payload[0].payload.label}: <b>{fmt(payload[0].payload.value, ch.unit)}</b> · {payload[0].payload.pct.toFixed(1)}%
                    </div>
                  ) : null
                }
              />
              <Bar dataKey="value" fill={C.data} barSize={16} radius={[0, 4, 4, 0]} isAnimationActive={false} label={{ position: "right", fontSize: 10, fill: C.ink2, formatter: (v: any) => `${total ? ((Number(v) / total) * 100).toFixed(1) : 0}%` }} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    );
  }

  // months: year & month comparison
  const data = ch.data.map((d) => ({ ...d, label: MONTHS[d.month - 1] }));
  const any = data.some((d) => ch.series.some((s) => Number((d as any)[s])));
  return (
    <div style={card}>
      {head(ch.title, ch.note, () => csv(`${file}-${ch.title}.csv`, [["Month", ...ch.series], ...data.map((d) => [d.label, ...ch.series.map((s) => Math.round(Number((d as any)[s]) || 0))])]))}
      {!any ? (
        <p className="text-xs py-10 text-center" style={{ color: C.ink3 }}>No monthly data for these years yet.</p>
      ) : asTable ? (
        <table className="w-full text-xs">
          <thead>
            <tr>
              <th className="py-1 text-left font-semibold" style={{ color: C.ink2, borderBottom: `1px solid ${C.border}` }}>Month</th>
              {ch.series.map((s) => (
                <th key={s} className="py-1 text-right font-semibold" style={{ color: C.ink2, borderBottom: `1px solid ${C.border}` }}>{s}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map((d) => (
              <tr key={d.month}>
                <td className="py-1" style={{ color: C.ink, borderBottom: `1px solid ${C.grid}` }}>{d.label}</td>
                {ch.series.map((s) => (
                  <td key={s} className="py-1 text-right tabular-nums" style={{ color: C.ink, borderBottom: `1px solid ${C.grid}` }}>{fmt(Number((d as any)[s]) || 0, ch.unit)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} barGap={2}>
            <CartesianGrid vertical={false} stroke={C.grid} />
            <XAxis dataKey="label" tick={{ fontSize: 11, fill: C.ink3 }} axisLine={{ stroke: C.border }} tickLine={false} />
            <YAxis tickFormatter={(v) => fmt(v, ch.unit, true)} tick={{ fontSize: 11, fill: C.ink3 }} axisLine={false} tickLine={false} width={58} />
            <Tooltip
              cursor={{ fill: "rgba(34,66,122,0.05)" }}
              content={({ active, payload, label }: any) =>
                active && payload?.length ? (
                  <div style={{ background: "#fff", border: `1px solid ${C.border}`, borderRadius: 10, padding: "8px 10px", fontSize: 12, color: C.ink }}>
                    <div style={{ color: C.ink2, marginBottom: 2 }}>{label}</div>
                    {payload.map((p: any) => (
                      <div key={p.dataKey} className="flex items-center gap-2">
                        <span style={{ width: 9, height: 9, borderRadius: 2, background: p.color, display: "inline-block" }} />
                        {p.dataKey} <b className="ml-auto pl-3 tabular-nums">{fmt(p.value, ch.unit)}</b>
                      </div>
                    ))}
                  </div>
                ) : null
              }
            />
            {ch.series.length > 1 && <Legend wrapperStyle={{ fontSize: 11, color: C.ink2 }} iconType="square" />}
            {ch.series.map((s) => {
              const idx = Math.max(0, 3 - ch.series.length) + ch.series.indexOf(s);
              return <Bar key={s} dataKey={s} fill={YEAR_COLORS[Math.min(idx, 2)]} maxBarSize={18} radius={[4, 4, 0, 0]} isAnimationActive={false} />;
            })}
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

// `source` picks where the numbers come from: the portal's own data, or the
// Power BI model (temporary mirror under Reports → Power BI). Same layout.
export default function ReportView({
  reportKey,
  offices,
  lockedRegion,
  lockedOffice,
  source = "portal",
  filters,
}: {
  reportKey: string;
  offices: Office[];
  lockedRegion: string | null;
  lockedOffice: string | null;
  source?: "portal" | "powerbi";
  // Overrides the catalog's filter list (Power BI versions of reports that
  // are plain links on the Standard side, like the region tiles).
  filters?: string[];
}) {
  const api = source === "powerbi" ? "/api/admin/powerbi/reports" : "/api/admin/insights/reports";
  const backHref = source === "powerbi" ? "/admin/powerbi" : "/admin/insights/reports";
  const def = REPORT.get(reportKey)!;
  const thisYear = new Date().getFullYear();
  const [year, setYear] = useState(thisYear);
  const [month, setMonth] = useState("");
  const [region, setRegion] = useState(lockedRegion ?? "");
  const [state, setState] = useState("");
  const [office, setOffice] = useState(lockedOffice ?? "");
  const [program, setProgram] = useState("");
  const [data, setData] = useState<ReportPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const states = useMemo(() => [...new Set(offices.filter((o) => !region || o.region === region).map((o) => o.state))].filter(Boolean).sort(), [offices, region]);
  const officeChoices = useMemo(() => offices.filter((o) => (!region || o.region === region) && (!state || o.state === state)), [offices, region, state]);

  useEffect(() => {
    const ctrl = new AbortController();
    setLoading(true);
    const qs = new URLSearchParams({ year: String(year) });
    if (month) qs.set("month", month);
    if (region) qs.set("region", region);
    if (state) qs.set("state", state);
    if (office) qs.set("office", office);
    if (program) qs.set("program", program);
    fetch(`${api}/${encodeURIComponent(reportKey)}?${qs}`, { signal: ctrl.signal })
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(j.error ?? "Couldn't load the report");
        setData(j);
        setError(null);
      })
      .catch((e) => e.name !== "AbortError" && setError(e.message))
      .finally(() => !ctrl.signal.aborted && setLoading(false));
    return () => ctrl.abort();
  }, [api, reportKey, year, month, region, state, office, program]);
  useEffect(() => {
    if (!data) return;
    const t = setTimeout(() => window.dispatchEvent(new Event("resize")), 60);
    return () => clearTimeout(t);
  }, [data]);

  const has = (f: string) => (filters ?? (def.filters as string[])).includes(f);
  const file = `${reportKey}_${year}${month ? `-${month}` : ""}`;
  const scopeLabel = [lockedOffice || office ? offices.find((o) => o.id === (lockedOffice || office))?.name : null, state || null, region || null].find(Boolean) ?? "All regions";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold uppercase tracking-wide" style={{ color: C.ink }}>{def.title}</h1>
          <p className="text-xs mt-1" style={{ color: C.ink2 }}>
            {scopeLabel} · {month ? `${MONTHS[Number(month) - 1]} ` : ""}{year} · {source === "powerbi" ? "Power BI data as of" : "live data as of"} {data?.asOf ?? "…"}
          </p>
        </div>
        <Link href={backHref} className="text-xs font-semibold rounded-full px-3 py-1.5" style={{ border: "1.5px solid rgba(22,48,43,0.12)", color: C.ink2 }}>
          ← All reports
        </Link>
      </div>

      {/* Filter row */}
      <div style={{ ...card, padding: "10px 12px" }} className="flex flex-wrap gap-2 items-center md:sticky md:top-2 z-10">
        {has("year") && (
          <select value={year} onChange={(e) => setYear(Number(e.target.value))} style={sel} aria-label="Year">
            {Array.from({ length: 7 }, (_, i) => thisYear + 1 - i).map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        )}
        {has("month") && (
          <select value={month} onChange={(e) => setMonth(e.target.value)} style={sel} aria-label="Month">
            <option value="">All months</option>
            {MONTHS.map((m, i) => (
              <option key={m} value={i + 1}>{m}</option>
            ))}
          </select>
        )}
        {has("program") && (
          <select value={program} onChange={(e) => setProgram(e.target.value)} style={sel} aria-label="Program">
            <option value="">All programs</option>
            {(data?.programs ?? []).map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
        )}
        {has("region") && (
          <select value={region} disabled={!!lockedRegion} onChange={(e) => { setRegion(e.target.value); setState(""); setOffice(""); }} style={sel} aria-label="Region">
            {!lockedRegion && <option value="">All regions</option>}
            {REGIONS.filter((r) => !lockedRegion || r === lockedRegion).map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
        )}
        {has("state") && !lockedOffice && (
          <select value={state} onChange={(e) => { setState(e.target.value); setOffice(""); }} style={sel} aria-label="State">
            <option value="">All states</option>
            {states.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        )}
        {has("office") && (
          <select value={office} disabled={!!lockedOffice} onChange={(e) => setOffice(e.target.value)} style={{ ...sel, maxWidth: 220 }} aria-label="Field office">
            {!lockedOffice && <option value="">All field offices</option>}
            {officeChoices.map((o) => (
              <option key={o.id} value={o.id}>{o.name}</option>
            ))}
          </select>
        )}
        {loading && <span className="text-[11px] ml-auto" style={{ color: C.ink3 }}>Loading…</span>}
      </div>

      {def.statusNote && source === "portal" && (
        <div className="rounded-2xl px-4 py-2.5 text-[12px]" style={{ background: def.status === "waiting" ? "#EFEAF4" : "#FBF0D9", color: def.status === "waiting" ? "#4F3F60" : "#6B4E12" }}>
          {def.statusNote}
        </div>
      )}
      {error && <div style={{ ...card, color: C.bad }} className="text-sm">⚠ {error}</div>}

      {data && (
        <div className="space-y-4" style={{ opacity: loading ? 0.55 : 1, transition: "opacity 150ms" }}>
          {data.notes.length > 0 && (
            <ul className="text-[11.5px] space-y-0.5 list-disc pl-5" style={{ color: C.ink2 }}>
              {data.notes.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          )}
          {data.kpis.length > 0 && (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
              {data.kpis.map((k) => (
                <div key={k.label} style={{ ...card, padding: "12px 14px", background: "#22427A" }}>
                  <div className="text-xl font-bold tabular-nums" style={{ color: "#fff" }}>{fmt(k.value, k.unit, Math.abs(Number(k.value)) >= 1e7)}</div>
                  <div className="text-[10.5px] font-semibold uppercase tracking-wide mt-0.5" style={{ color: "rgba(255,255,255,0.8)" }}>{k.label}</div>
                  {k.sub && <div className="text-[10.5px]" style={{ color: "rgba(255,255,255,0.6)" }}>{k.sub}</div>}
                </div>
              ))}
            </div>
          )}
          {data.matrices.map((m) => (
            <MatrixTable key={m.title} m={m} file={`${file}-${m.title}`} />
          ))}
          {data.charts.length > 0 && (
            <div className="grid lg:grid-cols-2 gap-4">
              {data.charts.map((ch, i) => (
                <div key={i} className={ch.kind === "months" || (ch.kind === "table" && ch.columns.length > 4) ? "lg:col-span-2" : ""}>
                  <ChartBlock ch={ch} file={file} />
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
