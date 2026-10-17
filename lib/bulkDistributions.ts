// Shared definitions for bulk distributions (bulk_distributions table).
// Safe for client components.

export const BULK_PROGRAM_SLUG: Record<string, string> = {
  "Refugee Services & Community Empowerment": "refugee-services",
  "Hunger Prevention": "hunger-prevention",
};

// Hunger Prevention food categories, matching the columns of the old
// Salesforce Bulk export the Master Cleaner read ("Total Groceries in lbs",
// "Total Groceries Value", "Total Ramadan Food Boxes", …).
export const HP_FOOD_CATEGORIES = [
  { key: "grocery", label: "Groceries", unit: "lbs" },
  { key: "produce", label: "Produce", unit: "lbs" },
  { key: "meat", label: "Meat", unit: "lbs" },
  { key: "poultry", label: "Poultry", unit: "lbs" },
  { key: "fish", label: "Fish", unit: "lbs" },
  { key: "qurbani_meat", label: "Qurbani meat", unit: "lbs" },
  { key: "prepared_meals", label: "Prepared meals", unit: "meals" },
  { key: "ramadan_boxes", label: "Ramadan food boxes", unit: "boxes" },
  { key: "baby_formula", label: "Baby formula", unit: "units" },
] as const;

export type FoodBreakdown = Partial<Record<string, { qty: number; value: number }>>;

export function foodTotals(food: FoodBreakdown | null | undefined) {
  let lbs = 0;
  let value = 0;
  for (const c of HP_FOOD_CATEGORIES) {
    const f = food?.[c.key];
    if (!f) continue;
    if (c.unit === "lbs") lbs += Number(f.qty) || 0;
    value += Number(f.value) || 0;
  }
  return { lbs, value };
}
