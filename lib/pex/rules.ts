// Pure rules for PEX transactions: which grant a card's spending belongs
// to, which budget line a merchant category suggests, what needs a
// second look, and the queue status after allocation. No I/O here so
// it can be reasoned about (and tested) on its own.

export type Designation = {
  id: string;
  card_id: string;
  grant_id: string;
  start_date: string;
  end_date: string | null;
  is_default: boolean;
  default_line_id: string | null;
};

export type GrantInfo = { id: string; status: string; start_date: string; end_date: string };
export type LineInfo = { id: string; grant_id: string; category: string; subcategory: string | null; is_active: boolean };

export type PexStatus = "unmatched" | "partial" | "coded" | "ignored";

export const FLAG_LABELS: Record<string, string> = {
  outside_grant_period: "Outside the grant period",
  restricted_merchant: "Merchant type usually not allowable",
  multiple_grants: "Card spends on several grants - pick one",
  grant_not_active: "Card's grant isn't active",
  amount_changed: "Amount changed when it settled",
  refund: "Refund / credit",
};

// Designations covering a date.
export function activeDesignations(all: Designation[], cardId: string | null, date: string): Designation[] {
  if (!cardId) return [];
  return all.filter((d) => d.card_id === cardId && d.start_date <= date && (!d.end_date || d.end_date >= date));
}

// Merchant category codes -> budget category (matched by name against
// the grant's own lines). Only the unambiguous families are mapped;
// everything else is left for the person coding it.
export function mccCategory(mcc: string | null | undefined): { category: string; subcategory: string | null } | null {
  const n = Number(mcc);
  if (!mcc || !Number.isFinite(n)) return null;
  if ((n >= 3000 && n <= 3299) || n === 4511) return { category: "Travel", subcategory: "Airfare" };
  if ((n >= 3351 && n <= 3441) || n === 7512) return { category: "Travel", subcategory: "Rental Car" };
  if ((n >= 3501 && n <= 3999) || n === 7011) return { category: "Travel", subcategory: "Hotel" };
  if (n === 5541 || n === 5542 || n === 5983) return { category: "Travel", subcategory: "Gas" };
  if (n === 4111 || n === 4121 || n === 4131 || n === 4784) return { category: "Travel", subcategory: null };
  if (n === 4814 || n === 4812 || n === 4899) return { category: "Occupancy", subcategory: "Telephone" };
  if (n === 5111 || n === 5943 || n === 5044 || n === 5045) return { category: "Operational", subcategory: null };
  return null;
}

// Bars, liquor, tobacco, gambling, dating - almost never allowable on a grant.
const RESTRICTED_MCC = new Set(["5813", "5921", "5993", "7995", "7273", "7800", "7801", "7802"]);
export const isRestrictedMcc = (mcc: string | null | undefined) => !!mcc && RESTRICTED_MCC.has(mcc.trim());

export function suggestLine(lines: LineInfo[], grantId: string, mcc: string | null | undefined, fallbackLineId: string | null): string | null {
  const own = lines.filter((l) => l.grant_id === grantId && l.is_active);
  const hit = mccCategory(mcc);
  if (hit) {
    const cat = hit.category.toLowerCase();
    const sub = hit.subcategory?.toLowerCase() ?? null;
    const exact = sub ? own.find((l) => l.category.toLowerCase() === cat && (l.subcategory ?? "").toLowerCase() === sub) : null;
    const loose = own.find((l) => l.category.toLowerCase() === cat);
    const line = exact ?? loose;
    if (line) return line.id;
  }
  return fallbackLineId && own.some((l) => l.id === fallbackLineId) ? fallbackLineId : null;
}

// Grant + line suggestion and review flags for one transaction.
export function suggest(
  tx: { card_id: string | null; transaction_date: string; mcc: string | null; amount: number },
  designations: Designation[],
  grants: Map<string, GrantInfo>,
  lines: LineInfo[]
): { grantId: string | null; lineId: string | null; flags: string[] } {
  const flags: string[] = [];
  if (isRestrictedMcc(tx.mcc)) flags.push("restricted_merchant");
  if (tx.amount < 0) flags.push("refund");

  // Designations on the card at all (any date), to tell "not a grant
  // card" apart from "grant card, but outside its dates".
  const anyOnCard = tx.card_id ? designations.filter((d) => d.card_id === tx.card_id) : [];
  const active = activeDesignations(designations, tx.card_id, tx.transaction_date);
  if (!active.length) {
    if (anyOnCard.length) flags.push("outside_grant_period");
    return { grantId: null, lineId: null, flags };
  }
  const defaults = active.filter((d) => d.is_default);
  const chosen = defaults.length === 1 ? defaults[0] : active.length === 1 ? active[0] : null;
  if (!chosen) {
    flags.push("multiple_grants");
    return { grantId: null, lineId: null, flags };
  }
  const g = grants.get(chosen.grant_id);
  if (g) {
    if (g.status !== "active") flags.push("grant_not_active");
    if (tx.transaction_date < g.start_date || tx.transaction_date > g.end_date) flags.push("outside_grant_period");
  }
  return { grantId: chosen.grant_id, lineId: suggestLine(lines, chosen.grant_id, tx.mcc, chosen.default_line_id), flags };
}

const r2 = (n: number) => Math.round(n * 100) / 100;

// Queue status from the amounts. Works for refunds (negative amounts)
// by comparing magnitudes.
export function pexStatus(amount: number, allocated: number, nonGrant: number): PexStatus {
  const total = Math.abs(r2(amount));
  const alloc = Math.abs(r2(allocated));
  const ng = Math.abs(r2(nonGrant));
  if (alloc + ng < 0.005) return "unmatched";
  if (alloc + ng + 0.005 < total) return "partial";
  return alloc < 0.005 ? "ignored" : "coded";
}

export const remaining = (amount: number, allocated: number, nonGrant: number) => r2(amount - allocated - nonGrant);

// Same sign as the transaction and not more than what's left.
export function checkPortion(txAmount: number, left: number, portion: number): string | null {
  if (!Number.isFinite(portion) || Math.abs(portion) < 0.005) return "Enter an amount.";
  if (Math.sign(portion) !== Math.sign(txAmount)) return txAmount < 0 ? "This is a refund - use a negative amount." : "Use a positive amount.";
  if (Math.abs(r2(portion)) > Math.abs(r2(left)) + 0.005) return `Only $${Math.abs(left).toFixed(2)} is left to allocate.`;
  return null;
}
