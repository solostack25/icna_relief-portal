import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/grantManagement/server";
import { requireViewer, fail, readJson } from "@/lib/grantManagement/api";
import { audit } from "@/lib/grantManagement/server";

// PEX queue housekeeping. Coding a transaction to a grant happens through
// POST /api/grant-management/expenses with pex_transaction_id.
//   assign  { employee_id }  - Grant Management routes it to a person
//   ignore  { note }         - not a grant expense (Grant Management)
//   restore                  - back to unmatched
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
    if (tx.status === "coded") return fail("Already coded to an expense.");
    await admin.from("gm_pex_transactions").update({ status: action === "ignore" ? "ignored" : "unmatched" }).eq("id", id);
    await audit(admin, { entity: "pex", entityId: id, action: action === "ignore" ? "ignored" : "restored", actorId: viewer.employeeId, note: typeof body.note === "string" ? body.note : null });
    return NextResponse.json({ ok: true });
  }
  return fail("Unknown action.");
}
