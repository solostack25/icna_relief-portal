import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { createAdminClient } from "@/lib/supabase/server";
import { hardwareViewer } from "@/lib/helpdeskHardwareAccess";
import { normaliseImage } from "@/lib/financeReceipts";
import { logHardwareEvent } from "@/lib/helpdeskHardware";

export const maxDuration = 60;

const BUCKET = "helpdesk-invoices";
const ALLOWED = ["image/", "application/pdf"];

async function listInvoices(legId: string) {
  const admin = createAdminClient();
  const { data } = await admin
    .from("helpdesk_attachments")
    .select("id, file_name, storage_path, content_type, size_bytes, uploaded_at, uploaded_by_employee_id")
    .eq("leg_id", legId)
    .eq("kind", "invoice")
    .order("uploaded_at");
  type Row = { id: string; file_name: string; storage_path: string; content_type: string | null; size_bytes: number | null; uploaded_at: string; uploaded_by_employee_id: string | null };
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
  }));
}

// GET ?legId=  -> the ticket's invoices (IT managers and the requester)
export async function GET(req: Request) {
  const legId = new URL(req.url).searchParams.get("legId") ?? "";
  const access = await hardwareViewer(legId);
  if ("error" in access) return NextResponse.json({ error: access.error }, { status: access.status });
  return NextResponse.json({ invoices: await listInvoices(legId) });
}

// POST multipart { legId, file } -> attach an invoice (IT managers only)
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
  });
  if (error) {
    await admin.storage.from(BUCKET).remove([path]);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (viewer.leg.hardware_gate) await logHardwareEvent(legId, "invoice", `Invoice uploaded: ${fileName}.`);
  return NextResponse.json({ invoices: await listInvoices(legId) });
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
  const { data: row } = await admin.from("helpdesk_attachments").select("id, storage_path, file_name").eq("id", id).eq("leg_id", legId).eq("kind", "invoice").maybeSingle();
  if (!row) return NextResponse.json({ error: "Invoice not found." }, { status: 404 });
  const { error } = await admin.from("helpdesk_attachments").delete().eq("id", row.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await admin.storage.from(BUCKET).remove([row.storage_path]);
  if (viewer.leg.hardware_gate) await logHardwareEvent(legId, "invoice", `Invoice removed: ${row.file_name}.`);
  return NextResponse.json({ invoices: await listInvoices(legId) });
}
