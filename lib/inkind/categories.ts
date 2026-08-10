// This list must match the codes on the printed barcode sheet
// (barcode_gen/generate_sheet.py). Edit both together.

export const CATEGORIES: { code: string; label: string }[] = [
  { code: "CAT-CLOTHING", label: "Clothing" },
  { code: "CAT-SHOES", label: "Shoes" },
  { code: "CAT-HOUSEWARES", label: "Housewares" },
  { code: "CAT-ELECTRONICS", label: "Electronics" },
  { code: "CAT-BULBS", label: "Light Bulbs" },
  { code: "CAT-FURNITURE", label: "Furniture" },
  { code: "CAT-BOOKS", label: "Books & Media" },
  { code: "CAT-TOYS", label: "Toys" },
  { code: "CAT-MISC", label: "Miscellaneous" },
];

export const ACTIONS = {
  UNDO: "ACTION-UNDO",
  FINISH: "ACTION-FINISH",
};

export function labelForCode(code: string): string {
  return CATEGORIES.find((c) => c.code === code)?.label ?? code;
}
