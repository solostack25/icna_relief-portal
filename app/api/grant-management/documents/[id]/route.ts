import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/grantManagement/server";
import { requireViewer, fail } from "@/lib/grantManagement/api";
import { audit, grantAccess, GM_BUCKET } from "@/lib/grantManagement/server";

async function load(id: string) {
  const admin = createAdminClient();
  const { data } = await admin.from("gm_expense_documents").select("id, expense_id, storage_path, file_name, uploaded_by, gm_expenses(grant_id, status)").eq("id", id).maybeSingle();
  return { admin, doc: data as unknown as { id: string; expense_id: string | null; storage_path: string; file_name: string | null; uploaded_by: string; gm_expenses: { grant_id: string; status: string } | null } | null };
}

// Open a document (short-lived signed link).
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireViewer();
  if ("res" in auth) return auth.res;
  const { admin, doc } = await load(id);
  if (!doc) return fail("Not found.", 404);
  const ok = doc.uploaded_by === auth.viewer.employeeId || (doc.gm_expenses && (await grantAccess(auth.viewer, doc.gm_expenses.grant_id, admin)).canView);
  if (!ok) return fail("Not found.", 404);
  const { data } = await admin.storage.from(GM_BUCKET).createSignedUrl(doc.storage_path, 60 * 10, { download: false });
  if (!data?.signedUrl) return fail("Couldn't open the file.", 500);
  return NextResponse.redirect(data.signedUrl);
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireViewer();
  if ("res" in auth) return auth.res;
  const { viewer } = auth;
  const { admin, doc } = await load(id);
  if (!doc) return fail("Not found.", 404);
  const e = doc.gm_expenses;
  const access = e ? await grantAccess(viewer, e.grant_id, admin) : null;
  const ownerCanRemove = doc.uploaded_by === viewer.employeeId && (!e || ["draft", "returned"].includes(e.status));
  if (!(ownerCanRemove || access?.canManage)) return fail("This document is part of a submitted expense and can't be removed.", 403);
  await admin.from("gm_expense_documents").delete().eq("id", id);
  await admin.storage.from(GM_BUCKET).remove([doc.storage_path]);
  if (e) await audit(admin, { entity: "document", entityId: doc.expense_id, grantId: e.grant_id, action: "removed", actorId: viewer.employeeId, changes: { file: doc.file_name } });
  return NextResponse.json({ ok: true });
}
