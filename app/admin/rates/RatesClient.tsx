"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Food = {
  key: string;
  label: string;
  unit: string;
  price: number | null;
  itemName: string | null;
  updatedAt: string | null;
  priced: boolean;
};
type Rate = { effective_from: string; rate: number };

const card = "rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5";
const cell = "rounded-lg border border-[var(--color-border)] bg-white px-2.5 py-1.5 text-sm";
const fmtDate = (d: string) => new Date(d + "T12:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });

async function post(body: Record<string, unknown>) {
  const res = await fetch("/api/admin/rates", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? "Couldn't save");
}

export default function RatesClient({ food, volunteerRates }: { food: Food[]; volunteerRates: Rate[] }) {
  const router = useRouter();
  const [prices, setPrices] = useState<Record<string, string>>(
    Object.fromEntries(food.map((f) => [f.key, f.price != null ? f.price.toFixed(2) : ""]))
  );
  const [savingFood, setSavingFood] = useState(false);
  const [foodMsg, setFoodMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const [newRate, setNewRate] = useState({ effective_from: "", rate: "" });
  const [editRate, setEditRate] = useState<Record<string, string>>({});
  const [rateMsg, setRateMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [savingRate, setSavingRate] = useState(false);

  const changed = food.filter((f) => f.priced && f.price != null && Number(prices[f.key]) !== f.price);
  const today = new Date().toLocaleDateString("en-CA");
  const currentRate = volunteerRates.find((r) => r.effective_from <= today) ?? volunteerRates[volunteerRates.length - 1];

  async function saveFood() {
    setSavingFood(true);
    setFoodMsg(null);
    try {
      for (const f of changed) await post({ action: "food_price", category: f.key, price: Number(prices[f.key]) });
      setFoodMsg({ ok: true, text: `Saved ${changed.length} price${changed.length === 1 ? "" : "s"}.` });
      router.refresh();
    } catch (e) {
      setFoodMsg({ ok: false, text: e instanceof Error ? e.message : "Couldn't save" });
    } finally {
      setSavingFood(false);
    }
  }

  async function rateAction(body: Record<string, unknown>, done?: () => void) {
    setSavingRate(true);
    setRateMsg(null);
    try {
      await post(body);
      done?.();
      setRateMsg({ ok: true, text: "Saved." });
      router.refresh();
    } catch (e) {
      setRateMsg({ ok: false, text: e instanceof Error ? e.message : "Couldn't save" });
    } finally {
      setSavingRate(false);
    }
  }

  return (
    <div className="space-y-10">
      <section>
        <h2 className="text-base font-semibold mb-1">Food values</h2>
        <p className="text-sm mb-4" style={{ color: "rgba(22,48,43,0.55)" }}>
          National prices used for Hunger Prevention distributions (check-in packages, client profiles, bulk). These are the same
          entries as the in-kind price list, so changing one here changes it there too.
        </p>
        <div className={card}>
          <div className="grid grid-cols-[1fr_8rem] gap-x-4 gap-y-3 items-center">
            {food.map((f) => (
              <div key={f.key} className="contents">
                <div>
                  <div className="text-sm font-medium">{f.label}</div>
                  <div className="text-[11px]" style={{ color: "rgba(22,48,43,0.5)" }}>
                    {f.priced
                      ? f.itemName
                        ? `In-kind item: ${f.itemName}${f.updatedAt ? ` · updated ${new Date(f.updatedAt).toLocaleDateString()}` : ""}`
                        : "Price-list item missing — add it in InKind Admin → Items"
                      : "No set price — staff enter the value on each distribution"}
                  </div>
                </div>
                {f.priced && f.price != null ? (
                  <label className="flex items-center gap-1 justify-end">
                    <span className="text-sm">$</span>
                    <input
                      type="number"
                      min={0.01}
                      step="0.01"
                      value={prices[f.key]}
                      onChange={(e) => setPrices((p) => ({ ...p, [f.key]: e.target.value }))}
                      className={cell + " w-20 text-right"}
                    />
                    <span className="text-xs w-10" style={{ color: "rgba(22,48,43,0.5)" }}>
                      /{f.unit === "lbs" ? "lb" : f.unit.replace(/s$/, "")}
                    </span>
                  </label>
                ) : (
                  <span className="text-xs text-right" style={{ color: "rgba(22,48,43,0.4)" }}>—</span>
                )}
              </div>
            ))}
          </div>
          <div className="flex items-center gap-3 mt-5">
            <button
              onClick={saveFood}
              disabled={savingFood || changed.length === 0}
              className="rounded-full bg-[var(--color-accent)] text-white text-sm font-medium px-5 py-2 disabled:opacity-40"
            >
              {savingFood ? "Saving…" : `Save prices${changed.length ? ` (${changed.length})` : ""}`}
            </button>
            {foodMsg && <span className={"text-sm " + (foodMsg.ok ? "text-green-700" : "text-[#B55139]")}>{foodMsg.text}</span>}
          </div>
        </div>
      </section>

      <section>
        <h2 className="text-base font-semibold mb-1">Volunteer hour value</h2>
        <p className="text-sm mb-4" style={{ color: "rgba(22,48,43,0.55)" }}>
          Dollar value of one volunteer hour, used for volunteering value on the Revenue page, the exec dashboard and the hours
          export. When the rate changes, add a new one with the date it starts — hours before that date keep the old rate.
        </p>
        <div className={card}>
          {currentRate && (
            <div className="mb-4 text-sm">
              Current rate: <strong>${currentRate.rate.toFixed(2)}/hour</strong>
              <span style={{ color: "rgba(22,48,43,0.5)" }}>
                {currentRate.effective_from > "1901-01-01" ? ` since ${fmtDate(currentRate.effective_from)}` : ""}
              </span>
            </div>
          )}
          <div className="divide-y divide-[var(--color-border)]">
            {volunteerRates.map((r) => {
              const editing = editRate[r.effective_from] !== undefined;
              const future = r.effective_from > today;
              return (
                <div key={r.effective_from} className="flex items-center justify-between gap-3 py-2.5">
                  <div className="text-sm">
                    {r.effective_from <= "1901-01-01" ? "Earlier hours" : `From ${fmtDate(r.effective_from)}`}
                    {future && <span className="ml-2 text-[11px] rounded-full bg-[var(--color-accent)]/10 text-[var(--color-accent)] px-2 py-0.5">upcoming</span>}
                  </div>
                  <div className="flex items-center gap-2">
                    {editing ? (
                      <>
                        <span className="text-sm">$</span>
                        <input
                          type="number"
                          min={0.01}
                          step="0.01"
                          value={editRate[r.effective_from]}
                          onChange={(e) => setEditRate((m) => ({ ...m, [r.effective_from]: e.target.value }))}
                          className={cell + " w-20 text-right"}
                        />
                        <button
                          disabled={savingRate}
                          onClick={() =>
                            rateAction({ action: "volunteer_rate_update", effective_from: r.effective_from, rate: Number(editRate[r.effective_from]) }, () =>
                              setEditRate((m) => {
                                const n = { ...m };
                                delete n[r.effective_from];
                                return n;
                              })
                            )
                          }
                          className="text-xs font-semibold text-[var(--color-accent)]"
                        >
                          Save
                        </button>
                      </>
                    ) : (
                      <>
                        <span className="text-sm font-medium tabular-nums">${r.rate.toFixed(2)}/hr</span>
                        <button onClick={() => setEditRate((m) => ({ ...m, [r.effective_from]: r.rate.toFixed(2) }))} className="text-xs underline" style={{ color: "rgba(22,48,43,0.55)" }}>
                          edit
                        </button>
                        {volunteerRates.length > 1 && r.effective_from > "1901-01-01" && (
                          <button
                            onClick={() => confirm("Remove this rate? Hours from this date will use the rate before it.") && rateAction({ action: "volunteer_rate_delete", effective_from: r.effective_from })}
                            className="text-xs underline text-[#B55139]"
                          >
                            remove
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="mt-4 pt-4 border-t border-[var(--color-border)] flex flex-wrap items-end gap-3">
            <label className="text-xs" style={{ color: "rgba(22,48,43,0.55)" }}>
              New rate starts
              <input type="date" value={newRate.effective_from} onChange={(e) => setNewRate({ ...newRate, effective_from: e.target.value })} className={cell + " block mt-1"} />
            </label>
            <label className="text-xs" style={{ color: "rgba(22,48,43,0.55)" }}>
              Value per hour
              <span className="flex items-center gap-1 mt-1">
                <span className="text-sm text-[var(--color-text)]">$</span>
                <input type="number" min={0.01} step="0.01" value={newRate.rate} onChange={(e) => setNewRate({ ...newRate, rate: e.target.value })} className={cell + " w-24"} />
              </span>
            </label>
            <button
              disabled={savingRate || !newRate.effective_from || !newRate.rate}
              onClick={() => rateAction({ action: "volunteer_rate_add", ...newRate, rate: Number(newRate.rate) }, () => setNewRate({ effective_from: "", rate: "" }))}
              className="rounded-full border border-[var(--color-accent)] text-[var(--color-accent)] text-sm font-medium px-4 py-1.5 disabled:opacity-40"
            >
              Add rate
            </button>
          </div>
          {rateMsg && <p className={"text-sm mt-3 " + (rateMsg.ok ? "text-green-700" : "text-[#B55139]")}>{rateMsg.text}</p>}
        </div>
      </section>
    </div>
  );
}
