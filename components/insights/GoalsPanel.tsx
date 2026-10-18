"use client";

import { useEffect, useState } from "react";
import { TARGET_METRICS, type Actuals, type TargetMetric } from "@/lib/insightsTargets";

const C = { ink: "#16302B", ink2: "rgba(22,48,43,0.62)", ink3: "rgba(22,48,43,0.45)", track: "#EDEBE5", data: "#13805A", over: "#9B3B4F", accent: "#1F6F54", line: "rgba(22,48,43,0.12)" };
const fmt = (n: number, unit: "money" | "count", compact = false) => {
  const s = compact ? new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(n) : Math.round(n).toLocaleString("en-US");
  return unit === "money" ? `$${s}` : s;
};

function Gauge({ value, goal }: { value: number; goal: number }) {
  const frac = goal > 0 ? Math.min(1, value / goal) : 0;
  const r = 80;
  const cx = 100;
  const cy = 92;
  const pt = (t: number) => [cx + r * Math.cos(Math.PI * (1 - t)), cy - r * Math.sin(Math.PI * (1 - t))];
  const [x0, y0] = pt(0);
  const [x1, y1] = pt(1);
  const [xv, yv] = pt(frac);
  return (
    <svg viewBox="0 0 200 112" className="w-full max-w-[260px] mx-auto" role="img" aria-label={`${fmt(value, "money")} of ${fmt(goal, "money")}`}>
      <path d={`M ${x0} ${y0} A ${r} ${r} 0 0 1 ${x1} ${y1}`} fill="none" stroke={C.track} strokeWidth={18} />
      {frac > 0 && <path d={`M ${x0} ${y0} A ${r} ${r} 0 0 1 ${xv} ${yv}`} fill="none" stroke={C.data} strokeWidth={18} />}
      <text x={cx} y={cy - 16} textAnchor="middle" fontSize={18} fontWeight={700} fill={C.ink}>{fmt(value, "money", value >= 1e6)}</text>
      <text x={cx} y={cy + 2} textAnchor="middle" fontSize={10} fill={C.ink2}>{Math.round((goal ? value / goal : 0) * 100)}% of goal</text>
      <text x={x0} y={cy + 16} textAnchor="middle" fontSize={9} fill={C.ink3}>$0</text>
      <text x={x1} y={cy + 16} textAnchor="middle" fontSize={9} fill={C.ink3}>{fmt(goal, "money", true)}</text>
    </svg>
  );
}

function EditAmount({ value, onSave }: { value: number | null; onSave: (v: string) => Promise<void> }) {
  const [editing, setEditing] = useState(false);
  const [v, setV] = useState(value == null ? "" : String(value));
  useEffect(() => setV(value == null ? "" : String(value)), [value]);
  if (!editing)
    return (
      <button onClick={() => setEditing(true)} className="text-[11px] font-semibold" style={{ color: C.accent }}>
        {value == null ? "Set" : "Edit"}
      </button>
    );
  return (
    <form
      className="inline-flex items-center gap-1"
      onSubmit={async (e) => {
        e.preventDefault();
        await onSave(v.trim());
        setEditing(false);
      }}
    >
      <input type="number" min={0} value={v} onChange={(e) => setV(e.target.value)} autoFocus className="text-xs rounded-lg px-2 py-0.5 w-28" style={{ border: `1px solid ${C.line}` }} />
      <button className="text-[11px] font-semibold" style={{ color: C.accent }}>Save</button>
      <button type="button" onClick={() => setEditing(false)} className="text-[11px]" style={{ color: C.ink3 }}>×</button>
    </form>
  );
}

// Goals & budget for one scope and year, with progress. The fundraising goal
// is drawn as the headline gauge (like the old Power BI "distance to goal").
export default function GoalsPanel({
  year,
  scopeName,
  targets,
  actual,
  onSave,
  compact = false,
}: {
  year: number | null;
  scopeName: string;
  targets: Partial<Record<TargetMetric, number>>;
  actual: Partial<Actuals>;
  onSave?: (metric: TargetMetric, value: string) => Promise<void>;
  compact?: boolean;
}) {
  if (!year)
    return <p className="text-xs py-6 text-center" style={{ color: C.ink3 }}>Pick a date range within one year (e.g. This year) to see that year&apos;s goals and budget.</p>;
  const any = TARGET_METRICS.some((m) => targets[m.key] != null);
  const fund = targets.fundraising;
  const rows = TARGET_METRICS.filter((m) => (fund != null && !compact ? m.key !== "fundraising" : true));

  return (
    <div>
      {!any && !onSave && (
        <p className="text-xs py-4" style={{ color: C.ink3 }}>
          No goals or budget have been set for {scopeName} in {year} yet. Upper management sets them on Admin → Goals &amp; Budgets.
        </p>
      )}
      {fund != null && !compact && (
        <div className="mb-2">
          <div className="flex items-center justify-between">
            <div className="text-[11px] font-semibold" style={{ color: C.ink2 }}>Fundraising goal · {fmt(fund, "money")}</div>
            {onSave && <EditAmount value={fund} onSave={(v) => onSave("fundraising", v)} />}
          </div>
          <Gauge value={Number(actual.fundraising ?? 0)} goal={fund} />
          <p className="text-center text-[11px]" style={{ color: C.ink2 }}>
            {Number(actual.fundraising ?? 0) >= fund ? "Goal reached" : `${fmt(fund - Number(actual.fundraising ?? 0), "money")} to go`}
          </p>
        </div>
      )}
      <div className="space-y-2.5">
        {rows.map((m) => {
          const goal = targets[m.key];
          const val = Number(actual[m.key] ?? 0);
          if (goal == null && !onSave) return null;
          const pct = goal ? (val / goal) * 100 : 0;
          const over = m.key === "budget" && goal != null && val > goal;
          return (
            <div key={m.key}>
              <div className="flex items-baseline justify-between gap-2 text-[11px]">
                <span className="font-semibold" style={{ color: C.ink2 }}>{m.key === "budget" ? "Budget" : m.short + " goal"}</span>
                <span className="flex items-center gap-2">
                  <span className="tabular-nums" style={{ color: over ? C.over : C.ink }}>
                    {fmt(val, m.unit, compact)} {m.actualLabel}
                    {goal != null ? ` of ${fmt(goal, m.unit, compact)}` : ""}
                  </span>
                  {onSave && <EditAmount value={goal ?? null} onSave={(v) => onSave(m.key, v)} />}
                </span>
              </div>
              {goal != null ? (
                <div className="h-2.5 rounded-full mt-1" style={{ background: C.track }} role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100} aria-label={m.label}>
                  <div className="h-2.5 rounded-full" style={{ width: `${Math.min(100, pct)}%`, background: over ? C.over : C.data }} />
                </div>
              ) : (
                <div className="text-[10.5px]" style={{ color: C.ink3 }}>Not set</div>
              )}
              {goal != null && (
                <div className="text-[10.5px] mt-0.5" style={{ color: over ? C.over : C.ink3 }}>
                  {m.key === "budget" ? (over ? `${fmt(val - goal, "money")} over budget` : `${fmt(goal - val, "money")} left · ${pct.toFixed(0)}% used`) : `${pct.toFixed(0)}%`}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Self-loading version for the Overview tab and the office dashboard.
export function GoalsStrip({ year, scope, scopeKey, scopeName }: { year: number; scope: "org" | "region" | "office"; scopeKey: string; scopeName: string }) {
  const [data, setData] = useState<{ targets: { metric: TargetMetric; amount: number }[]; actual: Actuals | null } | null>(null);
  useEffect(() => {
    let alive = true;
    fetch(`/api/admin/insights/targets?year=${year}&scope=${scope}&key=${encodeURIComponent(scopeKey)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => alive && setData(j));
    return () => {
      alive = false;
    };
  }, [year, scope, scopeKey]);
  if (!data) return null;
  const targets = Object.fromEntries(data.targets.map((t) => [t.metric, Number(t.amount)])) as Partial<Record<TargetMetric, number>>;
  return (
    <div style={{ background: "#fff", borderRadius: 20, boxShadow: "0 3px 12px rgba(22,48,43,0.06)", padding: "16px 20px" }}>
      <h3 className="text-sm font-bold mb-0.5" style={{ color: C.ink }}>Goals &amp; budget · {year}</h3>
      <p className="text-[11px] mb-3" style={{ color: C.ink3 }}>Set by upper management for {scopeName}</p>
      {data.targets.length ? (
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {TARGET_METRICS.filter((m) => targets[m.key] != null).map((m) => (
            <GoalsPanel key={m.key} year={year} scopeName={scopeName} targets={{ [m.key]: targets[m.key] } as any} actual={data.actual ?? {}} compact />
          ))}
        </div>
      ) : (
        <p className="text-xs" style={{ color: C.ink3 }}>No goals or budget have been set for {scopeName} in {year} yet.</p>
      )}
    </div>
  );
}
