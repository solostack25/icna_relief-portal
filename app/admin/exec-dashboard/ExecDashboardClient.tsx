"use client";

import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Assumption = {
  program_key: string;
  label: string;
  unit_label: string;
  unit_cost: number;
  updated_at: string;
  updaterName: string | null;
};

const PROGRAM_COLOR: Record<string, string> = {
  hunger_prevention: "#8A5FB5",
  back_to_school: "#E2892F",
  transitional_housing: "#B5566B",
  volunteer_program: "#3E9E8F",
};

const cardStyle: React.CSSProperties = { background: "#fff", borderRadius: 24, boxShadow: "0 3px 12px rgba(22,48,43,0.06)" };
const inputStyle: React.CSSProperties = {
  border: "1.5px solid var(--portal-line, rgba(22,48,43,0.12))",
  borderRadius: 10,
  padding: "9px 12px",
  fontSize: 14,
  background: "#fff",
  outline: "none",
};

export default function ExecDashboardClient({ assumptions: initialAssumptions }: { assumptions: Assumption[] }) {
  const supabase = createClient();

  const [assumptions, setAssumptions] = useState(initialAssumptions);
  const [editing, setEditing] = useState<Record<string, string>>({});
  const [savingKey, setSavingKey] = useState<string | null>(null);

  const [scenarioAmount, setScenarioAmount] = useState(50000);
  const [allocations, setAllocations] = useState<Record<string, number>>(() => {
    const n = initialAssumptions.length || 1;
    const base = Math.floor(100 / n);
    const result: Record<string, number> = {};
    initialAssumptions.forEach((a, i) => (result[a.program_key] = i === n - 1 ? 100 - base * (n - 1) : base));
    return result;
  });

  const totalAllocated = Object.values(allocations).reduce((s, v) => s + v, 0);

  function updateAllocation(key: string, value: number) {
    setAllocations((prev) => ({ ...prev, [key]: value }));
  }

  async function saveAssumption(programKey: string) {
    const raw = editing[programKey];
    if (raw === undefined) return;
    const unitCost = Number(raw);
    if (!Number.isFinite(unitCost) || unitCost <= 0) return;

    setSavingKey(programKey);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const { data: employee } = user ? await supabase.from("employees").select("id, first_name, last_name").eq("auth_user_id", user.id).single() : { data: null };

    const { error } = await supabase
      .from("exec_scenario_assumptions")
      .update({ unit_cost: unitCost, updated_at: new Date().toISOString(), updated_by: employee?.id ?? null })
      .eq("program_key", programKey);

    setSavingKey(null);
    if (!error) {
      setAssumptions((prev) =>
        prev.map((a) =>
          a.program_key === programKey
            ? { ...a, unit_cost: unitCost, updated_at: new Date().toISOString(), updaterName: employee ? `${employee.first_name} ${employee.last_name}` : a.updaterName }
            : a
        )
      );
      setEditing((prev) => {
        const next = { ...prev };
        delete next[programKey];
        return next;
      });
    }
  }

  const projections = useMemo(() => {
    return assumptions.map((a) => {
      const pct = allocations[a.program_key] ?? 0;
      const dollars = (scenarioAmount * pct) / 100;
      const units = a.unit_cost > 0 ? Math.floor(dollars / a.unit_cost) : 0;
      return { ...a, dollars, units };
    });
  }, [assumptions, allocations, scenarioAmount]);

  return (
    <div>
      <div style={{ ...cardStyle, padding: "24px 26px", marginBottom: 24 }}>
        <h2 className="text-base font-bold mb-1" style={{ color: "#2F4A3E" }}>
          What If We Raised…
        </h2>
        <p className="text-sm mb-5" style={{ color: "rgba(22,48,43,0.55)" }}>
          Enter a hypothetical amount, then split it across programs to see the projected impact — based on the
          adjustable cost assumptions below.
        </p>

        <div className="flex items-center gap-3 mb-6">
          <span className="text-2xl font-bold" style={{ color: "#16302B" }}>
            $
          </span>
          <input
            type="number"
            min={0}
            step={1000}
            value={scenarioAmount}
            onChange={(e) => setScenarioAmount(Math.max(0, Number(e.target.value)))}
            className="text-2xl font-bold"
            style={{ ...inputStyle, width: 200, fontSize: 24, padding: "10px 16px" }}
          />
          <div className="flex gap-2 ml-2">
            {[10000, 25000, 50000, 100000, 250000].map((v) => (
              <button
                key={v}
                onClick={() => setScenarioAmount(v)}
                className="text-xs font-bold rounded-full px-3.5 py-2 cursor-pointer hover:scale-105 active:scale-95 transition-transform duration-150"
                style={{ background: scenarioAmount === v ? "var(--portal-emerald, #2F6D46)" : "#F4F3EE", color: scenarioAmount === v ? "#fff" : "rgba(22,48,43,0.55)" }}
              >
                ${v / 1000}k
              </button>
            ))}
          </div>
        </div>

        {totalAllocated !== 100 && (
          <p className="text-xs font-semibold mb-3" style={{ color: "#A57420" }}>
            Allocation totals {totalAllocated}% — adjust so it sums to 100%.
          </p>
        )}

        <div className="space-y-4">
          {projections.map((p) => (
            <div key={p.program_key}>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-sm font-bold">{p.label}</span>
                <span className="text-sm" style={{ color: PROGRAM_COLOR[p.program_key] ?? "#666" }}>
                  <strong>{p.units.toLocaleString()}</strong> {p.unit_label}
                  {p.units === 1 ? "" : "s"} · ${p.dollars.toLocaleString()}
                </span>
              </div>
              <div className="flex items-center gap-3">
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={allocations[p.program_key] ?? 0}
                  onChange={(e) => updateAllocation(p.program_key, Number(e.target.value))}
                  className="flex-1"
                  style={{ accentColor: PROGRAM_COLOR[p.program_key] ?? "#2F6D46" }}
                />
                <span className="text-xs w-10 text-right font-semibold" style={{ color: "rgba(22,48,43,0.5)" }}>
                  {allocations[p.program_key] ?? 0}%
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ ...cardStyle, padding: "22px 24px" }}>
        <h2 className="text-sm font-bold mb-1" style={{ color: "#2F4A3E" }}>
          Cost Assumptions
        </h2>
        <p className="text-xs mb-4" style={{ color: "rgba(22,48,43,0.5)" }}>
          Rough estimates, not audited figures — adjust these to match your actual program costs and the
          projections above update automatically.
        </p>
        <div className="space-y-3">
          {assumptions.map((a) => {
            const isEditing = editing[a.program_key] !== undefined;
            return (
              <div key={a.program_key} className="flex items-center justify-between gap-3 text-sm">
                <div>
                  <div className="font-bold">{a.label}</div>
                  <div className="text-[11px]" style={{ color: "rgba(22,48,43,0.4)" }}>
                    {a.updaterName ? `Updated by ${a.updaterName} · ` : ""}
                    {new Date(a.updated_at).toLocaleDateString()}
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span style={{ color: "rgba(22,48,43,0.4)" }}>$</span>
                  <input
                    type="number"
                    min={1}
                    value={editing[a.program_key] ?? a.unit_cost}
                    onChange={(e) => setEditing((prev) => ({ ...prev, [a.program_key]: e.target.value }))}
                    style={{ ...inputStyle, width: 90, padding: "6px 10px" }}
                  />
                  <span className="text-xs" style={{ color: "rgba(22,48,43,0.5)" }}>
                    / {a.unit_label}
                  </span>
                  {isEditing && (
                    <button
                      onClick={() => saveAssumption(a.program_key)}
                      disabled={savingKey === a.program_key}
                      className="text-xs font-bold rounded-full px-3 py-1.5 text-white cursor-pointer disabled:opacity-50"
                      style={{ background: "var(--portal-emerald, #2F6D46)" }}
                    >
                      {savingKey === a.program_key ? "Saving…" : "Save"}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
