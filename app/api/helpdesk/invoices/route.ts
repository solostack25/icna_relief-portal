import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { createAdminClient } from "@/lib/supabase/server";
import { hardwareViewer } from "@/lib/helpdeskHardwareAccess";
import { normaliseImage } from "@/lib/financeReceipts";
import { logHardwareEvent, usd } from "@/lib/helpdeskHardware";
import { grantLineOptions } from "@/lib/helpdeskHardwareCloseout";

export const maxDuration = 60;

const BUCKET = "helpdesk-invoices";
const ALLOWED = ["image/", "application/pdf"];
const PAYMENT_METHODS = ["pex", "corporate_card", "check", "ach", "reimbursement", "other"];

async function listInvoices(legId: string) {
  const admin = createAdminClient();
  const { data } = await admin
    .from("helpdesk_attachments")
    .select("*")
    .eq("leg_id", legId)
    .eq("kind", "invoice")
    .order("uploaded_at");
  type Row = {
    id: string;
    file_name: string;
    storage_path: string;
    content_type: string | null;
    size_bytes: number | null;
    uploaded_at: string;
    uploaded_by_employee_id: string | null;
    amount: number | string | null;
    vendor: string | null;
    payment_method: string | null;
    gm_line_id: string | null;
    gm_expense_id: string | null;
  };
  const rows = (data ?? []) as Row[];
  const signed: { signedUrl: string | null }[] = rows.length ? (await admin.storage.from(BUCKET).createSignedUrls(rows.map((r) => r.storage_path), 60 * 30)).data ?? [] : [];
  const ids = [...new Set(rows.map((r) => r.uploaded_by_employee_id).filter(Boolean))] as string[];
  const { data: people } = ids.length ? await admin.from("employees").select("id, first_name, last_name").in("id", ids) : { data: [] };
  const names = new Map((people ?? []).map((p: any) => [p.id, `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim()]));
  return rows.map((r, i) => ({
    id: r.id,
    file_name: r.file_name,
    content_type: r.content_type,
    size_bytes: r.size_bytes,
    uploaded_at: r.uploaded_at,
    uploaded_by: r.uploaded_by_employee_id ? names.get(r.uploaded_by_employee_id) ?? null : null,
    url: signed[i]?.signedUrl ?? null,
    amount: r.amount != null ? Number(r.amount) : null,
    vendor: r.vendor ?? null,
    payment_method: r.payment_method ?? null,
    gm_expense_id: r.gm_expense_id ?? null,
  }));
}

// Grant context for the upload form: which grant, and its budget lines
// (with a best guess for hardware) so the invoice can post to the right line.
async function grantContext(legId: string) {
  const admin = createAdminClient();
  const { data: d } = await admin.from("helpdesk_leg_details_it").select("is_grant_purchase, gm_grant_id, grant_name").eq("leg_id", legId).maybeSingle();
  if (!d?.is_grant_purchase || !d.gm_grant_id) return null;
  const { lines, suggested } = await grantLineOptions(d.gm_grant_id);
  return { grantId: d.gm_grant_id as string, grantName: (d.grant_name as string | null) ?? "Grant", lines, suggested };
}

// GET ?legId=  -> the ticket's invoices (IT managers and the requester)
export async function GET(req: Request) {
  const legId = new URL(req.url).searchParams.get("legId") ?? "";
  const access = await hardwareViewer(legId);
  if ("error" in access) return NextResponse.json({ error: access.error }, { status: access.status });
  const [invoices, grant] = await Promise.all([listInvoices(legId), grantContext(legId)]);
  return NextResponse.json({ invoices, grant, gated: access.viewer.leg.hardware_gate });
}

// POST multipart { legId, file, amount, vendor, payment_method, gm_line_id }
// -> attach an invoice (IT managers only). On a gated hardware ticket the
// amount and how it was paid are required (they become the grant expense
// for grant purchases).
export async function POST(req: Request) {
  const form = await req.formData().catch(() => null);
  const legId = String(form?.get("legId") ?? "");
  const access = await hardwareViewer(legId);
  if ("error" in access) return NextResponse.json({ error: access.error }, { status: access.status });
  const { viewer } = access;
  if (!viewer.isItManager) return NextResponse.json({ error: "Only the IT team can upload invoices." }, { status: 403 });
  if (viewer.leg.department !== "it") return NextResponse.json({ error: "Invoices are for IT tickets." }, { status: 400 });
  if (viewer.leg.hardware_approval_status === "denied") return NextResponse.json({ error: "This purchase was denied, so there's nothing to invoice." }, { status: 400 });
  if (viewer.leg.hardware_approval_status === "pending") {
    return NextResponse.json({ error: "This purchase isn't approved yet. Upload the invoice after it's approved and bought." }, { status: 400 });
  }

  const file = form?.get("file");
  if (!(file instanceof Blob)) return NextResponse.json({ error: "No file received." }, { status: 400 });
  if (file.size > 20 * 1024 * 1024) return NextResponse.json({ error: "That file is over 20 MB." }, { status: 400 });
  const type = file.type || "application/octet-stream";
  if (!ALLOWED.some((a) => type.startsWith(a))) return NextResponse.json({ error: "Upload a PDF or a photo of the invoice." }, { status: 400 });
  const fileName = ((file instanceof File && file.name) || "invoice").slice(0, 200);

  const rawAmount = String(form?.get("amount") ?? "").replace(/[$,\s]/g, "");
  const amount = rawAmount ? Math.round(Number(rawAmount) * 100) / 100 : null;
  if (amount !== null && !(amount > 0)) return NextResponse.json({ error: "Enter the invoice total as a dollar amount." }, { status: 400 });
  const vendor = String(form?.get("vendor") ?? "").trim().slice(0, 200) || null;
  const paymentRaw = String(form?.get("payment_method") ?? "");
  const paymentMethod = PAYMENT_METHODS.includes(paymentRaw) ? paymentRaw : null;
  const lineRaw = String(form?.get("gm_line_id") ?? "");
  const grant = await grantContext(legId);
  const lineId = grant && grant.lines.some((l) => l.id === lineRaw) ? lineRaw : null;
  if (viewer.leg.hardware_gate) {
    if (amount === null) return NextResponse.json({ error: "Enter the invoice total." }, { status: 400 });
    if (!paymentMethod) return NextResponse.json({ error: "How was it paid?" }, { status: 400 });
    if (grant && grant.lines.length && !lineId) return NextResponse.json({ error: `Pick the ${grant.grantName} budget line this purchase goes on.` }, { status: 400 });
  }

  let buffer: Buffer = Buffer.from(await file.arrayBuffer());
  let contentType = type;
  let ext = (fileName.split(".").pop() ?? "pdf").toLowerCase().slice(0, 5);
  if (type.startsWith("image/")) {
    const n = await normaliseImage(buffer);
    buffer = n.buffer;
    contentType = n.contentType;
    ext = contentType === "image/jpeg" ? "jpg" : ext;
  }

  const admin = createAdminClient();
  const path = `${legId}/${randomUUID()}.${ext}`;
  const { error: upErr } = await admin.storage.from(BUCKET).upload(path, buffer, { contentType, upsert: false });
  if (upErr) return NextResponse.json({ error: `Couldn't save the file: ${upErr.message}` }, { status: 500 });

  const { error } = await admin.from("helpdesk_attachments").insert({
    request_id: viewer.leg.request_id,
    leg_id: legId,
    uploaded_by_employee_id: viewer.employeeId,
    file_name: fileName,
    storage_path: path,
    kind: "invoice",
    content_type: contentType,
    size_bytes: buffer.length,
    amount,
    vendor,
    payment_method: paymentMethod,
    gm_line_id: lineId,
  });
  if (error) {
    await admin.storage.from(BUCKET).remove([path]);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (viewer.leg.hardware_gate) {
    await logHardwareEvent(legId, "invoice", `Invoice uploaded: ${fileName}${amount ? ` (${usd(amount)}${vendor ? `, ${vendor}` : ""})` : ""}.`);
  }
  return NextResponse.json({ invoices: await listInvoices(legId), grant });
}

// DELETE ?id=&legId= -> remove an invoice uploaded by mistake (IT
// managers, only while the ticket is still open)
export async function DELETE(req: Request) {
  const url = new URL(req.url);
  const legId = url.searchParams.get("legId") ?? "";
  const id = url.searchParams.get("id") ?? "";
  const access = await hardwareViewer(legId);
  if ("error" in access) return NextResponse.json({ error: access.error }, { status: access.status });
  const { viewer } = access;
  if (!viewer.isItManager) return NextResponse.json({ error: "Only the IT team can remove invoices." }, { status: 403 });
  if (["closed", "handed_off"].includes(viewer.leg.status)) {
    return NextResponse.json({ error: "The ticket is closed, so its invoice is part of the record now." }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: row } = await admin.from("helpdesk_attachments").select("id, storage_path, file_name, gm_expense_id").eq("id", id).eq("leg_id", legId).eq("kind", "invoice").maybeSingle();
  if (!row) return NextResponse.json({ error: "Invoice not found." }, { status: 404 });
  if (row.gm_expense_id) return NextResponse.json({ error: "This invoice is already posted to Grant Management. Ask the grant team to remove that expense first." }, { status: 400 });
  const { error } = await admin.from("helpdesk_attachments").delete().eq("id", row.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await admin.storage.from(BUCKET).remove([row.storage_path]);
  if (viewer.leg.hardware_gate) await logHardwareEvent(legId, "invoice", `Invoice removed: ${row.file_name}.`);
  return NextResponse.json({ invoices: await listInvoices(legId), grant: await grantContext(legId) });
}
