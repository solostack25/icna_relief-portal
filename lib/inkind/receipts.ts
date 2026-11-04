import { extractJsonFromImages } from "@/lib/ai/azureOpenAI";
import { createAdminClient } from "@/lib/supabase/server";
import { getKioskViewer, resolveIntakeOffice, type InkindOffice } from "@/lib/inkind/offices";

// Server helpers for InKind "Scan Receipts" sessions.
// A session = one Excel sheet; each scanned receipt = one row.

export const RECEIPTS_BUCKET = "inkind-receipts";
export const MAX_RECEIPT_PHOTOS = 4; // long receipts can take a few photos

export type ReceiptItem = { description: string; qty: number | null; unit_price: number | null; amount: number | null };

export type ReceiptFields = {
  merchant: string | null;
  merchant_address: string | null;
  receipt_date: string | null; // YYYY-MM-DD
  receipt_time: string | null;
  receipt_number: string | null;
  payment_method: string | null;
  card_last4: string | null;
  subtotal: number | null;
  tax: number | null;
  tip: number | null;
  discount: number | null;
  total: number | null;
  items: ReceiptItem[];
  notes: string | null;
};

export type ReceiptRow = ReceiptFields & { id: string; session_id: string; image_paths: string[] | null; created_at: string };

export const RECEIPT_COLUMNS =
  "id, session_id, merchant, merchant_address, receipt_date, receipt_time, receipt_number, payment_method, card_last4, subtotal, tax, tip, discount, total, items, notes, image_paths, created_at";

function num(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(/[$,\s]/g, ""));
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}

function str(v: unknown, max: number): string | null {
  if (typeof v !== "string" && typeof v !== "number") return null;
  const s = String(v).trim().slice(0, max);
  return s || null;
}

// Clean anything (AI output or a staff edit) into storable receipt fields.
export function cleanReceiptFields(raw: any): ReceiptFields {
  const date = typeof raw?.receipt_date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(raw.receipt_date) ? raw.receipt_date : null;
  const last4 = str(raw?.card_last4, 8)?.replace(/\D/g, "").slice(-4) || null;
  const items: ReceiptItem[] = (Array.isArray(raw?.items) ? raw.items : [])
    .map((i: any) => ({
      description: String(i?.description ?? "").trim().slice(0, 160),
      qty: num(i?.qty),
      unit_price: num(i?.unit_price),
      amount: num(i?.amount),
    }))
    .filter((i: ReceiptItem) => i.description)
    .slice(0, 200);
  return {
    merchant: str(raw?.merchant, 150),
    merchant_address: str(raw?.merchant_address, 250),
    receipt_date: date,
    receipt_time: str(raw?.receipt_time, 20),
    receipt_number: str(raw?.receipt_number, 80),
    payment_method: str(raw?.payment_method, 40),
    card_last4: last4,
    subtotal: num(raw?.subtotal),
    tax: num(raw?.tax),
    tip: num(raw?.tip),
    discount: num(raw?.discount),
    total: num(raw?.total),
    items,
    notes: str(raw?.notes, 500),
  };
}

export async function extractReceipt(imageDataUris: string[]): Promise<{ fields: ReceiptFields; warnings: string[] }> {
  const system = `You read store / purchase receipts and turn them into structured data.
Return ONLY a JSON object with this shape:
{
  "merchant": string|null,
  "merchant_address": string|null,
  "receipt_date": "YYYY-MM-DD"|null,
  "receipt_time": string|null,
  "receipt_number": string|null,
  "payment_method": string|null,
  "card_last4": string|null,
  "subtotal": number|null,
  "tax": number|null,
  "tip": number|null,
  "discount": number|null,
  "total": number|null,
  "items": [{ "description": string, "qty": number|null, "unit_price": number|null, "amount": number|null }],
  "warnings": string[]
}
Rules:
- "merchant" is the store / business name as printed at the top. "merchant_address" is its street, city, state, zip on one line.
- "receipt_date" is the purchase date. "receipt_time" is the printed time (e.g. "2:41 PM").
- "receipt_number" is the receipt / transaction / order / invoice number (prefer the transaction #).
- "payment_method" is how it was paid: "Visa", "Mastercard", "Amex", "Discover", "Debit", "Cash", "Check", "EBT", "Gift Card", etc.
- "card_last4" is only the last 4 digits of the card if printed (never more).
- Money values are plain numbers with no $ sign. "discount" is the total savings/coupons as a positive number.
- "total" is the final amount paid (grand total), including tax and tip.
- One "items" entry per purchased product line, across ALL photos. Skip subtotal/tax/total/change/tender rows. "amount" is the line's extended price; negative only for refunds.
- If several photos are given, they are parts of the SAME receipt in order (top to bottom); don't double-count overlapping lines.
- Put anything staff should double-check (blurry text, cut-off receipt, totals that don't add up) in "warnings".
Never invent values that aren't on the receipt; use null.`;

  const n = imageDataUris.length;
  const raw = await extractJsonFromImages<any>(
    imageDataUris,
    system,
    n === 1 ? "Here is the receipt. Extract it." : `Here are ${n} photos of one receipt, top to bottom. Extract it.`
  );
  const warnings = (Array.isArray(raw?.warnings) ? raw.warnings : []).map((w: unknown) => String(w).slice(0, 300)).slice(0, 8);
  return { fields: cleanReceiptFields(raw), warnings };
}

// Resolve the station's office and (optionally) check the session belongs to it.
export async function receiptAccess(
  officeId: string | null | undefined,
  sessionId?: string | null
): Promise<{ office: InkindOffice; session: { id: string; name: string; office_id: string; created_at: string; updated_at: string } | null } | { error: string; status: number }> {
  // Unlike the donor kiosk, receipt sessions list everything an office has
  // scanned, so they need a signed-in staff member (not just an office id).
  const viewer = await getKioskViewer();
  if (!viewer.signedIn) return { error: "Sign in to the portal to use Scan Receipts.", status: 401 };
  const { office, error } = await resolveIntakeOffice(officeId ?? null);
  if (!office) return { error: error ?? "Choose this station's office first.", status: 400 };
  if (!sessionId) return { office, session: null };
  const admin = createAdminClient();
  const { data: session } = await admin
    .from("inkind_receipt_sessions")
    .select("id, name, office_id, created_at, updated_at")
    .eq("id", sessionId)
    .maybeSingle();
  if (!session || session.office_id !== office.id) return { error: "Session not found", status: 404 };
  return { office, session };
}

export async function touchSession(sessionId: string) {
  await createAdminClient().from("inkind_receipt_sessions").update({ updated_at: new Date().toISOString() }).eq("id", sessionId);
}
