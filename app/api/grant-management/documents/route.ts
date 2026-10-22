import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { createAdminClient } from "@/lib/grantManagement/server";
import { requireViewer, fail } from "@/lib/grantManagement/api";
import { audit, grantAccess, GM_BUCKET } from "@/lib/grantManagement/server";
import { normaliseImage, readReceipt, type ReceiptExtract } from "@/lib/financeReceipts";

export const maxDuration = 60;

const DOC_TYPES = ["receipt", "invoice", "purchase_order", "contract", "approval", "timesheet", "other"];
const ALLOWED = ["image/", "application/pdf", "application/vnd.openxmlformats-officedocument", "application/msword", "application/vnd.ms-excel", "text/csv"];

// Upload a supporting document. Photos are read for vendor / date /
// amount (same reader the Finance Tickets receipts use). With no
// expense_id the file waits, unattached, until the expense is saved.
export async function POST(req: Request) {
  const auth = await requireViewer();
  if ("res" in auth) return auth.res;
  const { viewer } = auth;
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof Blob)) return fail("No file received.");
  if (file.size > 20 * 1024 * 1024) return fail("That file is over 20 MB.");
  const type = file.type || "application/octet-stream";
  if (!ALLOWED.some((a) => type.startsWith(a))) return fail("Use a photo, PDF, Word or Excel file.");
  const docType = DOC_TYPES.includes(String(form?.get("doc_type"))) ? String(form?.get("doc_type")) : "receipt";
  const expenseId = typeof form?.get("expense_id") === "string" && form?.get("expense_id") ? String(form?.get("expense_id")) : null;
  const fileName = String(form?.get("file_name") ?? "").trim() || (file instanceof File && file.name) || "document";

  const admin = createAdminClient();
  let grantId: string | null = null;
  if (expenseId) {
    const { data: e } = await admin.from("gm_expenses").select("grant_id, created_by, status").eq("id", expenseId).maybeSingle();
    if (!e) return fail("Expense not found.", 404);
    const access = await grantAccess(viewer, e.grant_id, admin);
    const ok = access.canManage || access.canApprove || (e.created_by === viewer.employeeId && e.status !== "rejected");
    if (!ok) return fail("You can't add documents to this expense.", 403);
    grantId = e.grant_id;
  }

  let buffer: Buffer = Buffer.from(await file.arrayBuffer());
  let contentType = type;
  let ext = (fileName.split(".").pop() ?? "bin").toLowerCase().slice(0, 5);
  const isImage = type.startsWith("image/");
  if (isImage) {
    const n = await normaliseImage(buffer);
    buffer = n.buffer;
    contentType = n.contentType;
    ext = "jpg";
  }

  const path = `${expenseId ?? `pending/${viewer.employeeId}`}/${randomUUID()}.${ext}`;
  const { error: upErr } = await admin.storage.from(GM_BUCKET).upload(path, buffer, { contentType, upsert: false });
  if (upErr) return fail(`Couldn't save the file: ${upErr.message}`, 500);

  let extracted: ReceiptExtract | null = null;
  let readError: string | null = null;
  if (isImage && form?.get("read") !== "0") {
    try {
      extracted = await readReceipt(buffer, contentType);
    } catch (e) {
      readError = e instanceof Error ? e.message : "Couldn't read it.";
    }
  }

  const { data: doc, error } = await admin
    .from("gm_expense_documents")
    .insert({ expense_id: expenseId, storage_path: path, file_name: fileName.slice(0, 200), content_type: contentType, size_bytes: buffer.length, doc_type: docType, extracted, uploaded_by: viewer.employeeId })
    .select("id")
    .single();
  if (error || !doc) return fail(error?.message ?? "Couldn't save the file.", 500);
  if (expenseId) await audit(admin, { entity: "document", entityId: expenseId, grantId, action: "uploaded", actorId: viewer.employeeId, changes: { file: fileName, doc_type: docType } });

  const { data: signed } = await admin.storage.from(GM_BUCKET).createSignedUrl(path, 60 * 60);
  return NextResponse.json({ id: doc.id, file_name: fileName, doc_type: docType, content_type: contentType, previewUrl: signed?.signedUrl ?? null, extracted, readError });
}
