// Server-only helpers for food bank invoice intake (/inkind/food-bank).
//
// A food bank delivery is in-kind, but there's no donor at the station to
// sign — staff photograph the food bank's invoice, the AI reads its lines
// and maps each one to an item in our price catalog, staff review, and
// the result is saved as a completed session (organization donor = the
// food bank) and pushed to Salesforce with the invoice photos attached.
//
// Value always comes from OUR catalog price × quantity (same as the
// scanning station), never from the food bank's invoice dollar figures —
// those are often shared-maintenance fees or $0, not fair market value.

import { createAdminClient } from "@/lib/supabase/server";
import { extractJsonFromImages } from "@/lib/ai/azureOpenAI";

export const FOOD_BANK_BUCKET = "inkind-foodbank-invoices";
export const FOOD_BANK_PROGRAM = "Hunger Prevention";
export const MAX_INVOICE_PAGES = 6;

export type CatalogItem = {
  code: string;
  name: string;
  program: string;
  program_code: string;
  new_price: number;
  goods_type: string | null;
  sf_category: string | null;
  unit: string; // "lb", "dozen", "gallon", "meal", "each"
};

// The catalog names carry the unit ("BEEF - 1 LBS", "MILK - 1 Gallon").
export function unitFromName(name: string): string {
  const n = name.toLowerCase();
  if (/\blbs?\b|\d\s*lb/.test(n)) return "lb";
  if (n.includes("dozen")) return "dozen";
  if (n.includes("gallon")) return "gallon";
  if (n.includes("meal")) return "meal";
  return "lb"; // PRODUCE / PERISHABLES are valued per pound
}

export async function loadFoodCatalog(): Promise<CatalogItem[]> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("items")
    .select("code, name, program, program_code, new_price, goods_type, sf_category, manual_price")
    .eq("active", true)
    .eq("program", FOOD_BANK_PROGRAM)
    .order("name");
  return ((data ?? []) as any[])
    .filter((r) => !r.manual_price && r.new_price != null)
    .map((r) => ({
      code: r.code,
      name: r.name,
      program: r.program,
      program_code: r.program_code,
      new_price: Number(r.new_price),
      goods_type: r.goods_type,
      sf_category: r.sf_category,
      unit: unitFromName(r.name),
    }));
}

export type ExtractedLine = {
  description: string;
  cases: number | null;
  weight_lbs: number | null;
  item_code: string | null;
  qty: number;
  confidence: "high" | "medium" | "low";
  section: string | null; // invoice section heading, e.g. "TEFAP Orange P1", "Purchase Food"
  product_cost: number | null; // what the food bank charged for the product itself (0 = donated)
  maintenance_fee: number | null; // shared maintenance / handling fee on this line
};

export type GrantCredit = { ref: string; label: string; amount: number };

export type ExtractedInvoice = {
  food_bank_name: string | null;
  invoice_number: string | null;
  invoice_date: string | null; // YYYY-MM-DD
  total_weight_lbs: number | null;
  lines: ExtractedLine[];
  // billing (null / [] when the invoice shows no charges)
  total_charges: number | null;
  grant_credits: GrantCredit[];
  amount_owed: number | null;
  warnings: string[];
};

const num = (v: unknown): number | null => {
  const n = typeof v === "string" ? Number(v.replace(/[^0-9.\-]/g, "")) : Number(v);
  return Number.isFinite(n) ? n : null;
};

export async function extractFoodBankInvoice(
  imageDataUris: string[],
  catalog: CatalogItem[],
  pdfText?: string | null
): Promise<ExtractedInvoice> {
  const catalogText = catalog.map((c) => `- ${c.code}: ${c.name} (unit: ${c.unit})`).join("\n");

  const system = `You read food bank delivery invoices / pick tickets / bills of lading for a nonprofit food pantry and turn them into structured line items.
Return ONLY a JSON object with this shape:
{
  "food_bank_name": string|null,
  "invoice_number": string|null,
  "invoice_date": "YYYY-MM-DD"|null,
  "total_weight_lbs": number|null,
  "lines": [{ "section": string|null, "description": string, "cases": number|null, "weight_lbs": number|null, "product_cost": number|null, "maintenance_fee": number|null, "item_code": string|null, "qty": number, "confidence": "high"|"medium"|"low" }],
  "total_charges": number|null,
  "grant_credits": [{ "ref": string, "label": string, "amount": number }],
  "amount_owed": number|null,
  "warnings": string[]
}
Rules:
- One entry per product line on the invoice, across ALL pages. Skip subtotal/total rows, fees, and headers.
- "description" is the product text as printed (fix obvious OCR errors only).
- "weight_lbs" is the line's total gross weight in pounds if the invoice shows it.
- "section" is the group heading the line sits under, if the invoice groups lines (e.g. "Fresh Produce National", "Purchase Food", "TEFAP Orange P1").
- "product_cost" is the line's TOTAL product cost (the "Cost Total" / extended price column), 0 when the product is donated/free. Do NOT put shared maintenance / handling fees here.
- "maintenance_fee" is the line's shared maintenance / handling fee total (often a per-lb rate x weight), 0 or null if none.
- Map EVERY line to a catalog item, including purchased ones (non-food lines like cutlery or paper goods get item_code null).
- Billing block at the bottom: "total_charges" is TOTAL CHARGES (product cost + fees). "grant_credits" lists every line like "LESS Grant: <ref> <name> : $X" — "ref" is the grant number/code as printed (e.g. "500889_31"), "label" the rest of the grant name, "amount" the positive credit. "amount_owed" is the balance the agency must pay (Amount Owed / Balance Due). If the invoice has no billing block, use null and [].
- "invoice_date" is the pickup / delivery / ship date (when the food was received); fall back to the invoice or order date.
- Map each line to exactly one catalog item_code below by what the food IS:
${catalogText}
  Canned, boxed, shelf-stable, dry goods (rice, beans, pasta, cereal, canned veg/fruit, peanut butter, juice, snacks) -> NON-PERISHABLE (use it rather than Dry Grocery when both exist).
  Fresh fruit & vegetables -> PRODUCE. Bread & baked goods -> BAKERY. Chicken/turkey -> POULTRY. Beef -> beef. Fish/seafood -> FISH.
  Other refrigerated items (cheese, yogurt, deli, mixed fresh) -> PERISHABLES unless a more specific item fits.
- "qty" is in the catalog item's unit: for "lb" items use total pounds (weight_lbs); for "gallon" (milk) use gallons; for "dozen" (eggs) use dozens; for "meal" use meal count. If a per-unit item only shows weight, convert sensibly (1 gallon milk ~ 8.6 lb, 1 dozen eggs ~ 1.5 lb) and set confidence "medium".
- If no weight is printed for a "lb" line, estimate from cases x case weight only if case weight is printed; otherwise set qty 0 and confidence "low".
- If you can't tell which catalog item fits, set item_code null and confidence "low".
- Put anything staff should double-check (blurry rows, totals that don't add up, cut-off pages) in "warnings".
Never invent lines that aren't on the invoice.`;

  const pages = imageDataUris.length === 1 ? "is the invoice" : `are ${imageDataUris.length} pages of one invoice, in order`;
  const textHint = pdfText?.trim()
    ? `\n\nThe invoice is a PDF. Its embedded text layer is below between the ---- markers (columns may be jumbled; use the images for layout and the text for exact numbers):\n----\n${pdfText.slice(0, 30000)}\n----`
    : "";
  const raw = await extractJsonFromImages<any>(imageDataUris, system, `Here ${pages}. Extract it.${textHint}`);

  const codes = new Set(catalog.map((c) => c.code));
  const lines: ExtractedLine[] = (Array.isArray(raw?.lines) ? raw.lines : [])
    .map((l: any) => {
      const code = typeof l?.item_code === "string" && codes.has(l.item_code) ? l.item_code : null;
      const qty = num(l?.qty) ?? 0;
      return {
        description: String(l?.description ?? "").trim().slice(0, 140),
        cases: num(l?.cases),
        weight_lbs: num(l?.weight_lbs),
        item_code: code,
        qty: Math.max(0, Math.round(qty * 100) / 100),
        confidence: code ? (["high", "medium", "low"].includes(l?.confidence) ? l.confidence : "medium") : "low",
        section: typeof l?.section === "string" ? l.section.trim().slice(0, 80) || null : null,
        product_cost: num(l?.product_cost),
        maintenance_fee: num(l?.maintenance_fee),
      } as ExtractedLine;
    })
    .filter((l: ExtractedLine) => l.description);

  const date = typeof raw?.invoice_date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(raw.invoice_date) ? raw.invoice_date : null;

  return {
    food_bank_name: typeof raw?.food_bank_name === "string" ? raw.food_bank_name.trim().slice(0, 150) || null : null,
    invoice_number: typeof raw?.invoice_number === "string" ? raw.invoice_number.trim().slice(0, 60) || null : null,
    invoice_date: date,
    total_weight_lbs: num(raw?.total_weight_lbs),
    lines,
    total_charges: num(raw?.total_charges),
    grant_credits: (Array.isArray(raw?.grant_credits) ? raw.grant_credits : [])
      .map((g: any) => ({
        ref: String(g?.ref ?? "").trim().slice(0, 60),
        label: String(g?.label ?? "").trim().slice(0, 150),
        amount: Math.abs(num(g?.amount) ?? 0),
      }))
      .filter((g: GrantCredit) => g.amount > 0)
      .slice(0, 5),
    amount_owed: num(raw?.amount_owed),
    warnings: (Array.isArray(raw?.warnings) ? raw.warnings : []).map((w: unknown) => String(w).slice(0, 300)).slice(0, 10),
  };
}

// Invoice photos as Salesforce file attachments (added to each header).
export async function loadInvoiceAttachments(
  paths: string[] | null | undefined,
  baseName: string
): Promise<{ filename: string; ext: string; bytes: Uint8Array }[]> {
  if (!paths?.length) return [];
  const pdf = paths.filter((p) => p.endsWith(".pdf"));
  if (pdf.length) paths = pdf; // the original PDF beats our rendered page images
  const admin = createAdminClient();
  const out: { filename: string; ext: string; bytes: Uint8Array }[] = [];
  for (let i = 0; i < paths.length; i++) {
    const { data } = await admin.storage.from(FOOD_BANK_BUCKET).download(paths[i]);
    if (!data) continue;
    const ext = paths[i].split(".").pop() || "jpg";
    out.push({
      filename: paths.length > 1 ? `${baseName} - Food Bank Invoice p${i + 1}` : `${baseName} - Food Bank Invoice`,
      ext,
      bytes: new Uint8Array(await data.arrayBuffer()),
    });
  }
  return out;
}

// ---------------------------------------------------------------------
// Per-office food bank profiles (Admin → InKind → Food Banks). An office
// with no profile gets the default: every line in-kind, no charges.
// ---------------------------------------------------------------------
export type GrantMapping = { ref: string; gm_grant_id: string; gm_line_id: string | null };

export type FoodBankProfile = {
  id: string;
  office_id: string;
  name: string;
  aliases: string[];
  inkind_rule: "all_lines" | "zero_cost_only";
  track_charges: boolean;
  ticket_requestor_id: string | null;
  grant_mappings: GrantMapping[];
  notes: string | null;
};

export async function loadOfficeFoodBanks(officeId: string): Promise<FoodBankProfile[]> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("inkind_food_banks")
    .select("id, office_id, name, aliases, inkind_rule, track_charges, ticket_requestor_id, grant_mappings, notes")
    .eq("office_id", officeId)
    .eq("is_active", true)
    .order("name");
  return ((data ?? []) as any[]).map((r) => ({ ...r, aliases: r.aliases ?? [], grant_mappings: Array.isArray(r.grant_mappings) ? r.grant_mappings : [] }));
}

const squash = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

// Best profile for the name printed on the invoice (or the only one the
// office has).
export function matchFoodBank(profiles: FoodBankProfile[], printedName: string | null): FoodBankProfile | null {
  if (printedName) {
    const n = squash(printedName);
    const hit = profiles.find((p) => [p.name, ...p.aliases].some((a) => {
      const k = squash(a);
      return k && (n.includes(k) || k.includes(n));
    }));
    if (hit) return hit;
  }
  return profiles.length === 1 ? profiles[0] : null;
}

// Grant mapping for a credit as printed on the invoice ("500889_31 Orange
// County Y25 2061 FP - P2"): match on the reference number.
export function mappingFor(profile: FoodBankProfile | null, ref: string, label = ""): GrantMapping | null {
  if (!profile) return null;
  const text = squash(`${ref} ${label}`);
  return profile.grant_mappings.find((m) => m.ref && text.includes(squash(m.ref))) ?? null;
}

// A line counts as in-kind under the profile's rule.
export function isInkindLine(rule: FoodBankProfile["inkind_rule"], productCost: number | null): boolean {
  return rule === "all_lines" || !(Number(productCost) > 0);
}
