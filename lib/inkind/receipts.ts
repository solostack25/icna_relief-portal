import { extractJsonFromImages } from "@/lib/ai/azureOpenAI";
import { createAdminClient } from "@/lib/supabase/server";
import { getKioskViewer, resolveIntakeOffice, type InkindOffice } from "@/lib/inkind/offices";

// Server helpers for InKind "Scan Receipts" sessions.
// A session = one Excel sheet; each scanned receipt = one row.

export const RECEIPTS_BUCKET = "inkind-receipts";
export const MAX_RECEIPT_PHOTOS = 4; // a receipt can take a few photos (front/back, close-ups)

export type ReceiptItem = {
  category: string | null; // printed row it's written on, e.g. "Clothing (Lbs)"
  description: string; // what was written, e.g. "Shoe rack"
  qty: number | null;
  unit: string | null; // "lbs" for weighed rows, otherwise null (count)
  condition: "used" | "new" | null;
};

// One handwritten ICNA Relief donation receipt. Only what staff wrote in —
// never the form's printed ICNA address, tax ID, hours or disclaimer.
export type ReceiptFields = {
  donor_name: string | null;
  donor_phone: string | null;
  donor_email: string | null;
  donor_address: string | null;
  receipt_number: string | null;
  receipt_date: string | null; // YYYY-MM-DD
  received_by: string | null;
  items: ReceiptItem[];
  notes: string | null;
};

export type ReceiptRow = ReceiptFields & { id: string; session_id: string; image_paths: string[] | null; created_at: string };

export const RECEIPT_COLUMNS =
  "id, session_id, donor_name, donor_phone, donor_email, donor_address, receipt_number, receipt_date, received_by, items, notes, image_paths, created_at";

function num(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(/[,\s]/g, ""));
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}

function str(v: unknown, max: number): string | null {
  if (typeof v !== "string" && typeof v !== "number") return null;
  const s = String(v).trim().slice(0, max);
  return s || null;
}

// 10-digit US numbers as 832-660-7819; anything else kept as written.
export function formatPhone(raw: string | null): string | null {
  if (!raw) return null;
  const d = raw.replace(/\D/g, "");
  const ten = d.length === 11 && d.startsWith("1") ? d.slice(1) : d;
  return ten.length === 10 ? `${ten.slice(0, 3)}-${ten.slice(3, 6)}-${ten.slice(6)}` : raw.trim();
}

// Clean anything (AI output or a staff edit) into storable receipt fields.
export function cleanReceiptFields(raw: any): ReceiptFields {
  const date = typeof raw?.receipt_date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(raw.receipt_date) ? raw.receipt_date : null;
  const items: ReceiptItem[] = (Array.isArray(raw?.items) ? raw.items : [])
    .map((i: any) => {
      const cond = String(i?.condition ?? "").toLowerCase();
      return {
        category: str(i?.category, 80),
        description: String(i?.description ?? "").trim().slice(0, 160),
        qty: num(i?.qty),
        unit: str(i?.unit, 20),
        condition: cond === "used" || cond === "new" ? cond : null,
      } as ReceiptItem;
    })
    .filter((i: ReceiptItem) => i.description || i.category)
    .map((i: ReceiptItem) => ({ ...i, description: i.description || i.category || "" }))
    .slice(0, 200);
  return {
    donor_name: str(raw?.donor_name, 150),
    donor_phone: formatPhone(str(raw?.donor_phone, 40)),
    donor_email: str(raw?.donor_email, 150)?.toLowerCase() ?? null,
    donor_address: str(raw?.donor_address, 250),
    receipt_number: str(raw?.receipt_number, 40),
    receipt_date: date,
    received_by: str(raw?.received_by, 100),
    items,
    notes: str(raw?.notes, 500),
  };
}

export async function extractReceipt(imageDataUris: string[]): Promise<{ fields: ReceiptFields; warnings: string[] }> {
  const system = `You read ICNA Relief in-kind donation receipts: a printed form that staff fill in BY HAND when someone drops off donated goods. Extract ONLY what was handwritten (plus the pre-printed receipt number). Ignore the form's printed ICNA Relief header, office address, phone, hours, tax ID, website and disclaimer text completely.
Return ONLY a JSON object with this shape:
{
  "donor_name": string|null,
  "donor_phone": string|null,
  "donor_email": string|null,
  "donor_address": string|null,
  "receipt_number": string|null,
  "receipt_date": "YYYY-MM-DD"|null,
  "received_by": string|null,
  "items": [{ "category": string|null, "description": string, "qty": number|null, "unit": "lbs"|null, "condition": "used"|"new"|null }],
  "warnings": string[]
}
Rules:
- The photo may be rotated sideways or upside down; read it in whatever orientation the text runs.
- "donor_name", "donor_phone", "donor_email", "donor_address" are what's handwritten in the NAME / PHONE / EMAIL / ADDRESS boxes. Capitalize names normally ("ABEER FAREED" -> "Abeer Fareed"). Phone as digits with dashes. null if a box is blank.
- "receipt_number" is the printed/stamped number next to "RECEIPT #" / "No" (keep leading zeros, e.g. "009651").
- "receipt_date" is the handwritten DATE. "received_by" is the handwritten name after "RECEIVED BY".
- Items: the form has printed rows (Clothing (Lbs), Cups & Glasses, Plates, Bowls, Bed Sheets, Shoes/H.Bags, Toaster/Blender/Grill, Rice Cooker/Slow Cooker, Insta Pot/Iron, Kitchen Gadget Small, Comforter/Blankets, Decoration/Toys, Meat (Lbs), Prepared Meals (Qty), Grocery (Lbs), etc.) with USED and NEW tick columns. Make one item for every row that has anything handwritten on it, and one for every extra handwritten line in blank rows.
  - "category" is the printed row label it's written on, or null for a blank row.
  - "description" is the handwritten item text (e.g. "Shoe rack", "Drill", "Kitchen stress mats"). If staff only wrote a number/tick on a printed row, use the printed label as the description. If the printed label is crossed out and something else written, the handwritten text is the description.
  - "qty" is the handwritten number (e.g. "Shoe rack 3" -> 3, "180 lb" -> 180, "20+10" -> 30). If a row lists two things with two numbers, make two items.
  - "unit" is "lbs" for weighed rows (Clothing/Meat/Grocery (Lbs)) or when "lb" is written, else null.
  - "condition" is "used" or "new" from which column is ticked/written on that line; null if neither or unclear.
- Fix only obvious handwriting misreads. Never invent items. Put anything staff should double-check (hard-to-read words or numbers, rows you weren't sure about) in "warnings", naming the row.`;

  const n = imageDataUris.length;
  const raw = await extractJsonFromImages<any>(
    imageDataUris,
    system,
    n === 1 ? "Here is the donation receipt. Extract it." : `Here are ${n} photos of one donation receipt, in order. Extract it.`
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
