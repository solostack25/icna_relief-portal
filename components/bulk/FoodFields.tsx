"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  ALL_FOOD_ITEM_CODES,
  HP_FOOD_CATEGORIES,
  buildFood,
  foodTotals,
  pricesFromItems,
  type FoodPrices,
} from "@/lib/bulkDistributions";

export type FoodInput = Record<string, { qty: string; value: string }>;

// Unit prices from the national in-kind price list (items table).
export function useFoodPrices() {
  const [prices, setPrices] = useState<FoodPrices>({});
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    createClient()
      .from("items")
      .select("code, new_price, active")
      .in("code", ALL_FOOD_ITEM_CODES)
      .then(({ data }) => {
        setPrices(pricesFromItems(data ?? []));
        setLoaded(true);
      });
  }, []);
  return { prices, loaded };
}

const money = (n: number) => `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// Pounds / counts per category. Value is calculated from the price list
// where a price exists; Ramadan boxes and baby formula take a typed value.
export default function FoodFields({
  value,
  onChange,
  prices,
  showValues = true,
}: {
  value: FoodInput;
  onChange: (v: FoodInput) => void;
  prices: FoodPrices;
  showValues?: boolean;
}) {
  const food = buildFood(value, prices);
  const totals = foodTotals(food);
  const set = (key: string, field: "qty" | "value", v: string) =>
    onChange({ ...value, [key]: { qty: value[key]?.qty ?? "", value: value[key]?.value ?? "", [field]: v } });

  const cell = "rounded border border-[var(--color-border)] bg-white px-2 py-1.5 text-sm w-full";

  return (
    <div className="rounded-lg border border-[var(--color-border)] p-3">
      <div className={`grid ${showValues ? "grid-cols-[1fr_5.5rem_6.5rem]" : "grid-cols-[1fr_6rem]"} gap-2 text-xs text-[var(--color-text-dim)] mb-1`}>
        <span>Food</span>
        <span>Amount</span>
        {showValues && <span>Value</span>}
      </div>
      {HP_FOOD_CATEGORIES.map((c) => {
        const price = prices[c.key];
        const qty = Number(value[c.key]?.qty || 0);
        return (
          <div key={c.key} className={`grid ${showValues ? "grid-cols-[1fr_5.5rem_6.5rem]" : "grid-cols-[1fr_6rem]"} gap-2 items-center py-1`}>
            <span className="text-sm">
              {c.label}
              {price != null && (
                <span className="text-[11px] text-[var(--color-text-dim)]">
                  {" "}· ${price.toFixed(2)}/{c.unit === "lbs" ? "lb" : c.unit.replace(/s$/, "")}
                </span>
              )}
            </span>
            <input
              type="number"
              min={0}
              step={c.unit === "lbs" ? "0.1" : "1"}
              inputMode="decimal"
              placeholder={c.unit}
              value={value[c.key]?.qty ?? ""}
              onChange={(e) => set(c.key, "qty", e.target.value)}
              className={cell}
            />
            {showValues &&
              (price != null ? (
                <span className="text-sm text-right pr-1 tabular-nums">{qty > 0 ? money(qty * price) : "—"}</span>
              ) : (
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  placeholder="$0.00"
                  value={value[c.key]?.value ?? ""}
                  onChange={(e) => set(c.key, "value", e.target.value)}
                  className={cell}
                />
              ))}
          </div>
        );
      })}
      <div className="mt-2 pt-2 border-t border-[var(--color-border)] text-sm font-medium flex justify-between">
        <span>Total</span>
        <span className="tabular-nums">
          {totals.lbs.toLocaleString()} lbs{showValues ? ` · ${money(totals.value)}` : ""}
        </span>
      </div>
    </div>
  );
}

export function foodInputFrom(food: Partial<Record<string, { qty: number; value?: number }>> | null | undefined): FoodInput {
  const out: FoodInput = {};
  for (const c of HP_FOOD_CATEGORIES) {
    const f = food?.[c.key];
    if (f) out[c.key] = { qty: f.qty ? String(f.qty) : "", value: f.value ? String(f.value) : "" };
  }
  return out;
}
