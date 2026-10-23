import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/grantManagement/server";
import { requireViewer, fail, readJson } from "@/lib/grantManagement/api";
import { audit } from "@/lib/grantManagement/server";
import { setNonGrant } from "@/lib/pex/allocation";

// PEX queue housekeeping (Grant Management). Coding / splitting a
// transaction happens at /api/grant-management/pex/[id]/allocate.
//   assign  { employee_id }  - route it to a person
//   ignore  { note }         - whole transaction is not a grant expense
//   restore                  - clear the non-grant portion
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireViewer({ manager: true });
  if ("res" in auth) return auth.res;
  const { viewer } = auth;
  const admin = createAdminClient();
  const { data: tx } = await admin.from("gm_pex_transactions").select("id, status, employee_id").eq("id", id).maybeSingle();
  if (!tx) return fail("Transaction not found.", 404);
  const body = await readJson(req);
  const action = String(body.action ?? "");

  if (action === "assign") {
    if (typeof body.employee_id !== "string") return fail("Pick the employee.");
    await admin.from("gm_pex_transactions").update({ employee_id: body.employee_id }).eq("id", id);
    await audit(admin, { entity: "pex", entityId: id, action: "assigned", actorId: viewer.employeeId, changes: { from: tx.employee_id, to: body.employee_id } });
    return NextResponse.json({ ok: true });
  }
  if (action === "ignore" || action === "restore") {
    const r = await setNonGrant(admin, viewer, id, action, typeof body.note === "string" && body.note.trim() ? body.note.trim() : null);
    if ("error" in r && r.error) return fail(r.error);
    return NextResponse.json({ ok: true });
  }
  return fail("Unknown action.");
}
