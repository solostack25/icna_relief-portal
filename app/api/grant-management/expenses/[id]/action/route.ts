import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/grantManagement/server";
import { requireViewer, fail, readJson } from "@/lib/grantManagement/api";
import { grantAccess } from "@/lib/grantManagement/server";
import { reviewExpense, submitExpense } from "@/lib/grantManagement/expenses";

// action: submit | approve | reject | return | reopen
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireViewer();
  if ("res" in auth) return auth.res;
  const { viewer } = auth;
  const admin = createAdminClient();
  const { data: e } = await admin.from("gm_expenses").select("id, grant_id, status, doc_required, created_by, amount").eq("id", id).maybeSingle();
  if (!e) return fail("Expense not found.", 404);

  const body = await readJson(req);
  const action = String(body.action ?? "");
  const note = typeof body.note === "string" && body.note.trim() ? body.note.trim().slice(0, 1000) : null;

  if (action === "submit") {
    const access = await grantAccess(viewer, e.grant_id, admin);
    if (e.created_by !== viewer.employeeId && !access.canManage) return fail("Only the person who entered it can submit this.", 403);
    const r = await submitExpense(admin, e, viewer);
    return r.error ? fail(r.error) : NextResponse.json({ ok: true, status: r.status });
  }
  if (["approve", "reject", "return", "reopen"].includes(action)) {
    const r = await reviewExpense(admin, e, viewer, action as "approve", note);
    return r.error ? fail(r.error) : NextResponse.json({ ok: true, status: r.status });
  }
  return fail("Unknown action.");
}
