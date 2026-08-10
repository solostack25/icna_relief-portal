// The item price catalog now lives in Supabase (see
// supabase/migration_003_items_table.sql), managed through the admin
// app's /items page. This used to be a static import from
// data/items.json — that file is now just a seed/reference snapshot,
// not the live source of truth. fetchActiveItems() pulls the current
// catalog at runtime so catalog changes show up on the scanning screen
// immediately, no redeploy needed.

import { createClient } from "@/lib/supabase/client";

export type Condition = "new" | "used";

export type InventoryItem = {
  id: string;
  code: string;
  name: string;
  program: string;
  programCode: string;
  newPrice: number | null;
  usedPrice: number | null;
  manualPrice: boolean;
  requiresNote: boolean; // prompts for a short free-text note when added (e.g. "Rice" for DRY GROCERY / LBS)
  goodsType: string | null; // Salesforce sync: broad physical category
  sfCategory: string | null; // Salesforce sync: food-only subcategory
};

export const ACTIONS = {
  UNDO: "ACTION-UNDO",
  FINISH: "ACTION-FINISH",
};

export async function fetchActiveItems(): Promise<InventoryItem[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("items")
    .select(
      "id, code, name, program, program_code, new_price, used_price, manual_price, requires_note, goods_type, sf_category"
    )
    .eq("active", true)
    .order("name");

  if (error || !data) return [];

  return data.map((r) => ({
    id: r.id,
    code: r.code,
    name: r.name,
    program: r.program,
    programCode: r.program_code,
    newPrice: r.new_price,
    usedPrice: r.used_price,
    manualPrice: r.manual_price,
    requiresNote: r.requires_note,
    goodsType: r.goods_type,
    sfCategory: r.sf_category,
  }));
}

export function findItem(items: InventoryItem[], code: string): InventoryItem | undefined {
  return items.find((i) => i.code === code);
}

export function priceFor(item: InventoryItem, condition: Condition): number | null {
  return condition === "new" ? item.newPrice : item.usedPrice;
}

// Barcode text encodes item + condition, e.g. "ITEM-AQUARIUM-NEW".
// Manual-price items have no condition barcode: "ITEM-BAKERY".
export function barcodeFor(item: InventoryItem, condition?: Condition): string {
  if (item.manualPrice) return `ITEM-${item.code}`;
  return `ITEM-${item.code}-${condition === "used" ? "USED" : "NEW"}`;
}

// Parses a scanned barcode back into { item, condition }, looking the
// item code up in the currently-loaded catalog.
export function parseBarcode(
  items: InventoryItem[],
  code: string
): { item: InventoryItem; condition: Condition | null } | null {
  const trimmed = code.trim();
  if (!trimmed.startsWith("ITEM-")) return null;
  const rest = trimmed.slice("ITEM-".length);

  if (rest.endsWith("-NEW")) {
    const item = findItem(items, rest.slice(0, -4));
    return item ? { item, condition: "new" } : null;
  }
  if (rest.endsWith("-USED")) {
    const item = findItem(items, rest.slice(0, -5));
    return item ? { item, condition: "used" } : null;
  }
  const item = findItem(items, rest);
  return item ? { item, condition: null } : null;
}

// A stable per-line key for the donations table / undo tracking.
export function lineKey(itemCode: string, condition: Condition | "na"): string {
  return `${itemCode}:${condition}`;
}
