"use client";

import { useCallback, useEffect, useState } from "react";
import { TARGET_METRICS, targetKey, type Actuals, type Target, type TargetMetric } from "@/lib/insightsTargets";

type Office = { id: string; name: string; region: string; state: string };
type Data = { year: number; targets: Target[]; actuals: Record<string, Actuals>; lastYearCount: number };

const REGIONS = ["DMV", "MIDWEST 1", "MIDWEST 2", "NORTHEAST", "SOUTH CENTRAL", "SOUTHEAST", "WEST"];
const C = { ink: "#16302B", ink2: "rgba(22,48,43,0.62)", ink3: "rgba(22,48,43,0.45)", line: "rgba(22,48,43,0.12)", hair: "rgba(22,48,43,0.07)", accent: "#1F6F54", good: "#2F7D4F", warn: "#9A6412", bad: "#9B3B4F" };
const card: React.CSSProperties = { background: "#fff", borderRadius: 18, boxShadow: "0 3px 12px rgba(22,48,43,0.06)" };
const fmt = (n: number, unit: "money" | "count") => (unit === "money" ? `$${Math.round(n).toLocaleString("en-US")}` : Math.round(n).toLocaleString("en-US"));

function Cell({
  value,
  actual,
  metric,
  onSave,
}: {
  value: number | null;
  actual: number;
  metric: (typeof TARGET_METRICS)[number];
  onSave: (v: string) => Promise<boolean>;
}) {
  const [v, setV] = useState(value == null ? "" : String(value));
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  useEffect(() => setV(value == null ? "" : String(value)), [value]);
  const dirty = v !== (value == null ? "" : String(value));
  const pct = value ? (actual / value) * 100 : null;
  const over = metric.key === "budget" && pct != null && pct > 100;

  async function commit() {
    if (!dirty) return;
    setState("saving");
    const ok = await onSave(v.trim());
    setState(ok ? "saved" : "error");
    if (ok) setTimeout(() => setState("idle"), 1500);
  }

  return (
    <td className="px-2 py-1.5 align-top" style={{ borderBottom: `1px solid ${C.hair}` }}>
      <div className="flex items-center gap-1">
        {metric.unit === "money" && <span className="text-xs" style={{ color: C.ink3 }}>$</span>}
        <input
          value={v}
          onChange={(e) => setV(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
          inputMode="numeric"
          placeholder="—"
          className="w-full min-w-[90px] text-[13px] tabular-nums rounded-lg px-2 py-1"
          style={{ border: `1px solid ${state === "error" ? C.bad : dirty ? C.accent : C.line}`, background: "#fff", color: C.ink }}
          aria-label={metric.label}
        />
        <span className="w-3 text-[11px]" style={{ color: state === "error" ? C.bad : C.good }} aria-live="polite">
          {state === "saving" ? "…" : state === "saved" ? "✓" : state === "error" ? "!" : ""}
        </span>
      </div>
      <div className="text-[10.5px] mt-0.5 tabular-nums" style={{ color: over ? C.bad : C.ink3 }}>
        {fmt(actual, metric.unit)} {metric.actualLabel}
        {pct != null ? ` · ${pct.toFixed(0)}%${over ? " over" : ""}` : ""}
      </div>
    </td>
  );
}

export default function GoalsClient({ offices }: { offices: Office[] }) {
  const [year, setYear] = useState(new Date().getFullYear());
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    const r = await fetch(`/api/admin/goals?year=${year}`);
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return setError(j.error ?? "Couldn't load");
    setError(null);
    setData(j);
  }, [year]);
  useEffect(() => {
    setData(null);
    load();
  }, [load]);

  const target = (scope: string, key: string, metric: TargetMetric) =>
    data?.targets.find((t) => t.scope === scope && (scope === "org" ? true : t.scope_key === key) && t.metric === metric)?.amount ?? null;
  const actual = (scope: string, key: string, metric: TargetMetric) => Number(data?.actuals[targetKey(scope, key)]?.[metric] ?? 0);

  async function save(scope: string, key: string, metric: TargetMetric, amount: string) {
    const r = await fetch("/api/admin/goals", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "set", year, scope, scope_key: key, metric, amount }) });
    if (!r.ok) {
      const j = await r.json().catch(() => ({}));
      setMsg(j.error ?? "Couldn't save");
      return false;
    }
    await load();
    return true;
  }

  async function copy() {
    const r = await fetch("/api/admin/goals", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "copy", year }) });
    const j = await r.json().catch(() => ({}));
    setMsg(r.ok ? `Copied ${j.copied} goal${j.copied === 1 ? "" : "s"} from ${year - 1} into empty cells.` : j.error ?? "Couldn't copy");
    load();
  }

  const row = (scope: "org" | "region" | "office", key: string, label: React.ReactNode, sub?: string, indent = 0) => (
    <tr key={`${scope}:${key}`}>
      <td className="px-2 py-1.5 align-top" style={{ borderBottom: `1px solid ${C.hair}`, paddingLeft: 8 + indent }}>
        <div className="text-[13px] font-semibold" style={{ color: C.ink }}>{label}</div>
        {sub && <div className="text-[10.5px]" style={{ color: C.ink3 }}>{sub}</div>}
      </td>
      {TARGET_METRICS.map((m) => (
        <Cell key={m.key} metric={m} value={target(scope, key, m.key)} actual={actual(scope, key, m.key)} onSave={(v) => save(scope, key, m.key, v)} />
      ))}
    </tr>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold" style={{ color: C.ink }}>Goals &amp; Budgets</h1>
          <p className="text-xs mt-1 max-w-2xl" style={{ color: C.ink2 }}>
            Set each year&apos;s goals and budget for the organization, each region and each office. Offices see their own on Insights and on their office dashboard,
            with progress measured from portal data. Changes save when you leave a box.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setYear(year - 1)} className="text-sm px-2" style={{ color: C.ink2 }} aria-label="Previous year">‹</button>
          <span className="text-lg font-bold tabular-nums" style={{ color: C.ink }}>{year}</span>
          <button onClick={() => setYear(year + 1)} className="text-sm px-2" style={{ color: C.ink2 }} aria-label="Next year">›</button>
          {data && data.lastYearCount > 0 && (
            <button onClick={copy} className="text-xs font-semibold rounded-full px-3 py-1.5 ml-2" style={{ border: `1.5px solid ${C.line}`, color: C.ink2 }}>
              Copy {year - 1} into empty cells
            </button>
          )}
        </div>
      </div>

      {msg && <p className="text-xs" style={{ color: C.ink2 }}>{msg}</p>}
      {error && <div style={{ ...card, padding: 16, color: C.bad }} className="text-sm">⚠ {error}</div>}

      <div style={{ ...card, padding: "6px 10px" }} className="overflow-x-auto">
        {!data ? (
          <p className="text-sm text-center py-12" style={{ color: C.ink3 }}>Loading…</p>
        ) : (
          <table className="w-full" style={{ minWidth: 860 }}>
            <thead>
              <tr>
                <th className="px-2 py-2 text-left text-[11px] font-semibold" style={{ color: C.ink2, borderBottom: `1px solid ${C.line}` }}>Scope</th>
                {TARGET_METRICS.map((m) => (
                  <th key={m.key} className="px-2 py-2 text-left text-[11px] font-semibold" style={{ color: C.ink2, borderBottom: `1px solid ${C.line}` }} title={m.help}>
                    {m.label}
                    <div className="font-normal text-[10px]" style={{ color: C.ink3 }}>{m.help}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {row("org", "", "ICNA Relief (organization)")}
              {REGIONS.map((r) => {
                const regionOffices = offices.filter((o) => o.region === r);
                const isOpen = open.has(r);
                return [
                  row(
                    "region",
                    r,
                    <button
                      onClick={() => {
                        const s = new Set(open);
                        s.has(r) ? s.delete(r) : s.add(r);
                        setOpen(s);
                      }}
                      className="flex items-center gap-1 text-left"
                      aria-expanded={isOpen}
                    >
                      <span className="text-[10px]" style={{ color: C.ink3 }}>{isOpen ? "▼" : "▶"}</span> {r}
                    </button>,
                    `${regionOffices.length} offices`
                  ),
                  ...(isOpen ? regionOffices.map((o) => row("office", o.id, o.name, o.state, 22)) : []),
                ];
              })}
            </tbody>
          </table>
        )}
      </div>
      <p className="text-[11px]" style={{ color: C.ink3 }}>
        Progress uses the same numbers as Insights. Budget spending counts finance tickets marked paid this year, by billing office. Office goals don&apos;t have to add up to the region&apos;s.
      </p>
    </div>
  );
}
