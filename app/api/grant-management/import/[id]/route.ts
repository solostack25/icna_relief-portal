import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/grantManagement/server";
import { requireViewer, fail } from "@/lib/grantManagement/api";
import { audit } from "@/lib/grantManagement/server";

// Undo a bulk upload. Expenses keep their audit trail entries (the log
// records the removal); PEX transactions already coded stay put.
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireViewer({ manager: true });
  if ("res" in auth) return auth.res;
  const { viewer } = auth;
  const admin = createAdminClient();
  const { data: batch } = await admin.from("gm_import_batches").select("id, kind, status, file_name").eq("id", id).maybeSingle();
  if (!batch) return fail("Upload not found.", 404);
  if (batch.status === "removed") return fail("Already removed.");

  let removed = 0;
  if (batch.kind === "expenses") {
    const { data: rows } = await admin.from("gm_expenses").select("id, grant_id, amount").eq("import_batch_id", id);
    const { error } = await admin.from("gm_expenses").delete().eq("import_batch_id", id);
    if (error) return fail(error.message, 500);
    removed = rows?.length ?? 0;
    const grants = new Map<string, number>();
    (rows ?? []).forEach((r: { grant_id: string }) => grants.set(r.grant_id, (grants.get(r.grant_id) ?? 0) + 1));
    for (const [gid, n] of grants) await audit(admin, { entity: "import", entityId: id, grantId: gid, action: "import_removed", actorId: viewer.employeeId, changes: { file: batch.file_name, rows: n } });
  } else {
    const { data: rows } = await admin.from("gm_pex_transactions").delete().eq("batch_id", id).eq("status", "unmatched").select("id");
    removed = rows?.length ?? 0;
    await audit(admin, { entity: "import", entityId: id, action: "pex_import_removed", actorId: viewer.employeeId, changes: { file: batch.file_name, rows: removed } });
  }
  await admin.from("gm_import_batches").update({ status: "removed" }).eq("id", id);
  return NextResponse.json({ ok: true, removed });
}
