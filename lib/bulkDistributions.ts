// Shared definitions for bulk distributions and Hunger Prevention food
// records. Safe for client components.

export const BULK_PROGRAM_SLUG: Record<string, string> = {
  "Refugee Services & Community Empowerment": "refugee-services",
  "Hunger Prevention": "hunger-prevention",
};

// Hunger Prevention food categories, matching the columns of the old
// Salesforce exports the Master Cleaner read ("Total Groceries in lbs",
// "Total Groceries Value", "Total Ramadan Food Boxes", …).
//
// itemCodes: the national in-kind price list (items table) entries whose
// price is used per unit — first active match wins. Categories with no
// item (Ramadan boxes, baby formula) are valued by hand.
export const HP_FOOD_CATEGORIES = [
  { key: "grocery", label: "Groceries", unit: "lbs", itemCodes: ["DRY-GROCERY-1LB", "NON-PERISHABLE"] },
  { key: "produce", label: "Produce", unit: "lbs", itemCodes: ["PRODUCE"] },
  { key: "meat", label: "Meat", unit: "lbs", itemCodes: ["BEEF-1-LBS", "BEEF"] },
  { key: "poultry", label: "Poultry", unit: "lbs", itemCodes: ["POULTRY"] },
  { key: "fish", label: "Fish", unit: "lbs", itemCodes: ["FISH"] },
  { key: "qurbani_meat", label: "Qurbani meat", unit: "lbs", itemCodes: ["GOAT-MUTTON-LAMB-1-LBS", "GOAT-MUTTON-LAMB"] },
  { key: "prepared_meals", label: "Prepared meals", unit: "meals", itemCodes: ["PREPARED-HOT-MEAL", "PREPARED-MEAL-HOT-MEAL-1-MEAL"] },
  { key: "ramadan_boxes", label: "Ramadan food boxes", unit: "boxes", itemCodes: [] as string[] },
  { key: "baby_formula", label: "Baby formula", unit: "units", itemCodes: [] as string[] },
] as const;

export type FoodKey = (typeof HP_FOOD_CATEGORIES)[number]["key"];
export type FoodBreakdown = Partial<Record<string, { qty: number; value: number }>>;
export type FoodPrices = Partial<Record<string, number>>;

export const ALL_FOOD_ITEM_CODES = [...new Set(HP_FOOD_CATEGORIES.flatMap((c) => c.itemCodes))];

// items rows → per-category unit price
export function pricesFromItems(items: { code: string; new_price: number | string | null; active?: boolean | null }[]): FoodPrices {
  const byCode = new Map(items.filter((i) => i.active !== false && i.new_price != null).map((i) => [i.code, Number(i.new_price)]));
  const out: FoodPrices = {};
  for (const c of HP_FOOD_CATEGORIES) {
    const code = c.itemCodes.find((k) => byCode.has(k));
    if (code) out[c.key] = byCode.get(code);
  }
  return out;
}

export function foodTotals(food: FoodBreakdown | null | undefined) {
  let lbs = 0;
  let value = 0;
  for (const c of HP_FOOD_CATEGORIES) {
    const f = food?.[c.key];
    if (!f) continue;
    if (c.unit === "lbs") lbs += Number(f.qty) || 0;
    value += Number(f.value) || 0;
  }
  return { lbs: Math.round(lbs * 100) / 100, value: Math.round(value * 100) / 100 };
}

// Form state ({ key: { qty, value } } as strings) → stored breakdown.
// Priced categories always use qty × price; unpriced ones use the typed value.
export function buildFood(
  input: Record<string, { qty: string; value: string }>,
  prices: FoodPrices
): FoodBreakdown {
  const out: FoodBreakdown = {};
  for (const c of HP_FOOD_CATEGORIES) {
    const f = input[c.key];
    const qty = Number(f?.qty || 0);
    const price = prices[c.key];
    const value = price != null ? Math.round(qty * price * 100) / 100 : Number(f?.value || 0);
    if (qty > 0 || value > 0) out[c.key] = { qty, value };
  }
  return out;
}

// Package ({ key: { qty } }) → priced breakdown, for check-in auto-records.
export function pricePackage(pkg: Partial<Record<string, { qty: number; value?: number }>> | null | undefined, prices: FoodPrices): FoodBreakdown {
  const out: FoodBreakdown = {};
  for (const c of HP_FOOD_CATEGORIES) {
    const p = pkg?.[c.key];
    const qty = Number(p?.qty || 0);
    if (qty <= 0) continue;
    const price = prices[c.key];
    out[c.key] = { qty, value: price != null ? Math.round(qty * price * 100) / 100 : Number(p?.value || 0) };
  }
  return out;
}
