import { createAdminClient } from "@/lib/supabase/server";
import { describeImage } from "@/lib/ai/azureOpenAI";

export const RECEIPT_BUCKET = "finance-receipts";

export type ReceiptExtract = {
  vendor: string | null;
  total: number | null;
  date: string | null; // YYYY-MM-DD
  description: string | null;
  kind: "purchase" | "utility" | "vendor_invoice" | "unknown";
  confidence: "high" | "medium" | "low";
};

const PROMPT = `You read receipts and invoices for a nonprofit's expense reimbursements.
Return ONLY a JSON object, no prose, with these keys:
{"vendor": string|null, "total": number|null, "date": "YYYY-MM-DD"|null, "description": string|null, "kind": "purchase"|"utility"|"vendor_invoice"|"unknown", "confidence": "high"|"medium"|"low"}
- vendor: the store or company name as printed.
- total: the final amount paid including tax and tip, as a plain number (no $). If several totals appear, use the grand total.
- date: the transaction or invoice date.
- description: 2 to 6 words saying what was bought, e.g. "Office supplies", "Groceries for food pantry", "Team lunch".
- kind: "utility" for electric, water, gas, internet or phone bills; "vendor_invoice" for an invoice addressed to the organization that still needs paying; "purchase" for a store or restaurant receipt that was already paid; otherwise "unknown".
- confidence: how clearly you could read the total.
If the image is not a receipt or invoice, return all nulls with kind "unknown" and confidence "low".`;

function clean(raw: string): ReceiptExtract {
  const empty: ReceiptExtract = { vendor: null, total: null, date: null, description: null, kind: "unknown", confidence: "low" };
  const m = raw.match(/\{[\s\S]*\}/);
  if (!m) return empty;
  try {
    const j = JSON.parse(m[0]);
    const total = typeof j.total === "number" ? j.total : Number(String(j.total ?? "").replace(/[^0-9.]/g, ""));
    const date = typeof j.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(j.date) ? j.date : null;
    const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim().slice(0, 120) : null);
    return {
      vendor: str(j.vendor),
      total: Number.isFinite(total) && total > 0 ? Math.round(total * 100) / 100 : null,
      date,
      description: str(j.description),
      kind: ["purchase", "utility", "vendor_invoice"].includes(j.kind) ? j.kind : "unknown",
      confidence: ["high", "medium", "low"].includes(j.confidence) ? j.confidence : "low",
    };
  } catch {
    return empty;
  }
}

export async function readReceipt(buffer: Buffer, contentType: string): Promise<ReceiptExtract> {
  const dataUrl = `data:${contentType};base64,${buffer.toString("base64")}`;
  return clean(await describeImage(dataUrl, PROMPT));
}

// Normalise phone photos: honour EXIF rotation, cap the size, JPEG.
export async function normaliseImage(buffer: Buffer): Promise<{ buffer: Buffer; contentType: string }> {
  try {
    const sharp = (await import("sharp")).default;
    const out = await sharp(buffer).rotate().resize({ width: 1800, height: 1800, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 82 }).toBuffer();
    return { buffer: out, contentType: "image/jpeg" };
  } catch {
    return { buffer, contentType: "image/jpeg" };
  }
}

// Links receipts uploaded on the new-ticket form to the ticket once it
// exists. Only the uploader's own unattached receipts can be claimed.
export async function attachReceipts(ticketId: string, employeeId: string, paths: unknown) {
  if (!Array.isArray(paths) || paths.length === 0) return;
  const clean = paths.filter((p): p is string => typeof p === "string").slice(0, 20);
  const admin = createAdminClient();
  await admin
    .from("finance_ticket_receipts")
    .update({ finance_ticket_id: ticketId })
    .in("storage_path", clean)
    .eq("uploaded_by", employeeId)
    .is("finance_ticket_id", null);
}

export async function signedReceipts(ticketId: string) {
  const admin = createAdminClient();
  const { data } = await admin
    .from("finance_ticket_receipts")
    .select("id, storage_path, extracted, content_type, created_at")
    .eq("finance_ticket_id", ticketId)
    .order("created_at");
  const rows = (data ?? []) as { id: string; storage_path: string; extracted: unknown; content_type: string | null }[];
  if (!rows.length) return [];
  const { data: signed } = await admin.storage.from(RECEIPT_BUCKET).createSignedUrls(rows.map((r) => r.storage_path), 60 * 30);
  return rows.map((r, i) => ({
    id: r.id as string,
    url: signed?.[i]?.signedUrl ?? null,
    extracted: r.extracted as ReceiptExtract | null,
    is_pdf: (r.content_type ?? "").includes("pdf") || r.storage_path.endsWith(".pdf"),
  }));
}
