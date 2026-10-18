"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { HP_FOOD_CATEGORIES, buildFood, foodTotals, type FoodBreakdown } from "@/lib/bulkDistributions";
import FoodFields, { useFoodPrices, type FoodInput } from "@/components/bulk/FoodFields";

export type HpFoodRow = {
  id: string;
  distributed_on: string;
  individuals_served: number;
  food: FoodBreakdown | null;
  total_lbs: number;
  total_value: number;
  source: string;
  notes: string | null;
};

const fmtDate = (d: string) => new Date(d + "T12:00:00").toLocaleDateString();
const money = (n: number) => `$${Number(n).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
const today = () => new Date().toLocaleDateString("en-CA");

function describe(food: FoodBreakdown | null) {
  return HP_FOOD_CATEGORIES.filter((c) => food?.[c.key]?.qty)
    .map((c) => `${food![c.key]!.qty} ${c.unit === "lbs" ? "lb" : c.unit} ${c.label.toLowerCase()}`)
    .join(", ");
}

// Hunger Prevention on the client profile: food actually given, by
// category, valued from the national price list. Replaces the old
// free-text "Distribute Food" note. Pickups completed at check-in land
// here automatically with the office's package for that day.
export default function HungerPreventionFoodSection({
  clientId,
  officeId,
  householdSize,
  currentEmployeeId,
  rows,
}: {
  clientId: string;
  officeId: string | null;
  householdSize: number;
  currentEmployeeId: string | null;
  rows: HpFoodRow[];
}) {
  const supabase = createClient();
  const router = useRouter();
  const { prices } = useFoodPrices();
  const [open, setOpen] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [date, setDate] = useState(today());
  const [individuals, setIndividuals] = useState(String(householdSize || 1));
  const [food, setFood] = useState<FoodInput>({});
  const [notes, setNotes] = useState("");

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    if (open) window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  function reset() {
    setDate(today());
    setIndividuals(String(householdSize || 1));
    setFood({});
    setNotes("");
    setError(null);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!officeId) return setError("This client has no office on file — set one in their intake info first.");
    const breakdown = buildFood(food, prices);
    if (Object.keys(breakdown).length === 0) return setError("Enter at least one food amount.");
    const people = Number(individuals);
    if (!Number.isInteger(people) || people < 1) return setError("Individuals served must be at least 1.");
    const totals = foodTotals(breakdown);
    setSaving(true);
    const { error } = await supabase.from("hp_food_distributions").insert({
      client_id: clientId,
      office_id: officeId,
      distributed_on: date,
      individuals_served: people,
      food: breakdown,
      total_lbs: totals.lbs,
      total_value: totals.value,
      source: "profile",
      notes: notes.trim() || null,
      created_by: currentEmployeeId,
    });
    setSaving(false);
    if (error) return setError(error.message);
    reset();
    setOpen(false);
    router.refresh();
  }

  async function remove(id: string) {
    if (!confirm("Delete this food distribution? Use this only for mistakes.")) return;
    const { error } = await supabase.from("hp_food_distributions").delete().eq("id", id);
    if (error) return alert(error.message);
    router.refresh();
  }

  const total = rows.reduce((a, r) => ({ lbs: a.lbs + Number(r.total_lbs), value: a.value + Number(r.total_value) }), { lbs: 0, value: 0 });
  const inputClass =
    "w-full rounded-lg border border-[var(--color-border)] bg-white px-3 py-2 text-sm outline-none focus:border-[var(--color-accent)]";
  const labelClass = "block text-xs mb-1 text-[var(--color-text-dim)]";

  return (
    <section className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 mb-6">
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-sm font-medium">Food Distribution</h2>
        <button
          onClick={() => setOpen(true)}
          className="rounded-lg border border-[var(--color-accent)] text-[var(--color-accent)] text-sm font-medium px-4 py-2 hover:bg-[var(--color-accent)]/10"
        >
          Distribute Food
        </button>
      </div>
      <p className="text-xs text-[var(--color-text-dim)] mt-2">
        {rows.length > 0
          ? `${rows.length} distribution${rows.length === 1 ? "" : "s"} · ${Math.round(total.lbs).toLocaleString()} lbs · ${money(total.value)} · last on ${fmtDate(rows[0].distributed_on)}`
          : "No food distributions logged yet."}
      </p>
      {rows.length > 0 && (
        <button onClick={() => setShowHistory((v) => !v)} className="text-xs font-medium text-[var(--color-accent)] mt-2 hover:underline">
          {showHistory ? "Hide history ▲" : "Show history ▼"}
        </button>
      )}
      {showHistory && (
        <div className="mt-3 pt-3 border-t border-[var(--color-border)] space-y-2">
          {rows.map((r) => (
            <div key={r.id} className="flex items-start justify-between gap-3 text-sm border-b border-[var(--color-border)] pb-2 last:border-0">
              <div className="min-w-0">
                <div>
                  {describe(r.food) || r.notes || "Logged"}
                  {Number(r.total_value) > 0 && <span className="text-[var(--color-text-dim)]"> · {money(Number(r.total_value))}</span>}
                </div>
                <div className="text-xs text-[var(--color-text-dim)]">
                  {r.individuals_served} served
                  {r.source === "pickup" ? " · pickup check-in" : r.source === "legacy_note" ? " · earlier note" : ""}
                  {r.notes && describe(r.food) ? ` · ${r.notes}` : ""}
                </div>
              </div>
              <div className="shrink-0 text-right">
                <div className="text-[var(--color-text-dim)]">{fmtDate(r.distributed_on)}</div>
                <button onClick={() => remove(r.id)} className="text-[11px] text-[#B55139] underline">delete</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {open && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center px-4 z-50" onClick={() => setOpen(false)}>
          <form
            onSubmit={save}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-xl bg-[var(--color-surface)] border border-[var(--color-border)] p-6 max-h-[90vh] overflow-y-auto space-y-3"
          >
            <h3 className="text-base font-semibold">Distribute Food</h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelClass}>Date</label>
                <input type="date" required max={today()} value={date} onChange={(e) => setDate(e.target.value)} className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Individuals served</label>
                <input type="number" min={1} value={individuals} onChange={(e) => setIndividuals(e.target.value)} className={inputClass} />
              </div>
            </div>
            <p className="text-[11px] text-[var(--color-text-dim)] -mt-1">Defaults to the household size ({householdSize}).</p>
            <FoodFields value={food} onChange={setFood} prices={prices} />
            <div>
              <label className={labelClass}>Notes</label>
              <input value={notes} onChange={(e) => setNotes(e.target.value)} className={inputClass} />
            </div>
            {error && <p className="text-sm text-[#B55139]">{error}</p>}
            <div className="flex gap-3">
              <button type="submit" disabled={saving} className="flex-1 rounded-lg bg-[var(--color-accent)] text-white font-medium py-2 text-sm disabled:opacity-50">
                {saving ? "Saving..." : "Save"}
              </button>
              <button type="button" onClick={() => setOpen(false)} className="rounded-lg border border-[var(--color-border)] px-4 text-sm">
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}
    </section>
  );
}
