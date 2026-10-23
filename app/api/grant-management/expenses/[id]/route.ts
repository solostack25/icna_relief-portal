import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/grantManagement/server";
import { requireViewer, fail, readJson } from "@/lib/grantManagement/api";
import { audit, checkExpenseAgainstGrant, cleanExpenseInput, diff, grantAccess } from "@/lib/grantManagement/server";
import { attachDocuments, EXPENSE_EDIT_FIELDS, submitExpense } from "@/lib/grantManagement/expenses";
import { refreshPexTransaction } from "@/lib/pex/allocation";
import { checkPortion, remaining } from "@/lib/pex/rules";

async function load(id: string) {
  const admin = createAdminClient();
  const { data } = await admin.from("gm_expenses").select("*").eq("id", id).maybeSingle();
  return { admin, expense: data };
}

// Edit. The person who entered it can edit while it's a draft or was
// returned to them; Grant Management can correct anything (audited).
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireViewer();
  if ("res" in auth) return auth.res;
  const { viewer } = auth;
  const { admin, expense } = await load(id);
  if (!expense) return fail("Expense not found.", 404);
  const currentAccess = await grantAccess(viewer, expense.grant_id, admin);
  const isOwner = expense.created_by === viewer.employeeId;
  const canEdit = currentAccess.canManage || (isOwner && ["draft", "returned"].includes(expense.status));
  if (!canEdit) return fail(isOwner ? "This expense is already submitted. Ask your approver to return it if it needs a change." : "You can't edit this expense.", 403);

  const body = await readJson(req);
  if (currentAccess.canManage && expense.status === "approved" && !(typeof body.change_reason === "string" && body.change_reason.trim())) {
    return fail("Say why an approved expense is being changed.", 400, { change_reason: "Required for approved expenses." });
  }
  const { input, errors } = cleanExpenseInput({ ...expense, ...body });
  if (!input) return fail("Please fix the highlighted fields.", 400, errors);
  // PEX portions: the date is fixed; the amount can move within what's
  // left of the transaction (other portions + non-grant stay put).
  if (expense.pex_transaction_id) {
    const { data: tx } = await admin.from("gm_pex_transactions").select("amount, allocated_amount, non_grant_amount, transaction_date").eq("id", expense.pex_transaction_id).maybeSingle();
    if (tx) {
      if (input.expense_date !== tx.transaction_date) return fail("The date comes from the PEX transaction.", 400, { expense_date: "Fixed by PEX." });
      if (Math.abs(Number(expense.amount) - input.amount) > 0.005) {
        const counted = expense.status === "rejected" ? 0 : Number(expense.amount);
        const left = remaining(Number(tx.amount), Number(tx.allocated_amount) - counted, Number(tx.non_grant_amount));
        const err = checkPortion(Number(tx.amount), left, input.amount);
        if (err) return fail("Amount doesn't fit the PEX transaction.", 400, { amount: err });
      }
    }
  }
  const access = input.grant_id === expense.grant_id ? currentAccess : await grantAccess(viewer, input.grant_id, admin);
  const check = await checkExpenseAgainstGrant(admin, input, access);
  // Grant Management may correct an approved expense on a closed grant.
  if (check.errors.grant_id && currentAccess.canManage && input.grant_id === expense.grant_id) delete check.errors.grant_id;
  if (Object.keys(check.errors).length) return fail("Please fix the highlighted fields.", 400, check.errors);

  const update: Record<string, unknown> = {};
  for (const k of EXPENSE_EDIT_FIELDS) update[k] = k === "doc_required" ? check.docRequired : (input as Record<string, unknown>)[k] ?? null;
  update.office_id = input.office_id ?? expense.office_id;
  update.program = input.program ?? expense.program;
  const changes = diff(expense, update, Object.keys(update));
  if (Object.keys(changes).length) {
    const { error } = await admin.from("gm_expenses").update({ ...update, updated_at: new Date().toISOString() }).eq("id", id);
    if (error) return fail(error.message, 500);
    await audit(admin, {
      entity: "expense",
      entityId: id,
      grantId: String(update.grant_id),
      action: "edited",
      actorId: viewer.employeeId,
      changes,
      note: typeof body.change_reason === "string" ? body.change_reason : null,
    });
  }
  if (expense.pex_transaction_id && "amount" in changes) await refreshPexTransaction(admin, expense.pex_transaction_id);
  const attached = await attachDocuments(admin, id, viewer.employeeId, body.document_ids);
  if (attached) await audit(admin, { entity: "document", entityId: id, grantId: String(update.grant_id), action: "attached", actorId: viewer.employeeId, changes: { count: attached } });

  if (body.submit === true) {
    const r = await submitExpense(admin, { ...expense, ...update, id } as never, viewer);
    if (r.error) return fail(r.error);
    return NextResponse.json({ ok: true, status: r.status });
  }
  return NextResponse.json({ ok: true });
}

// Delete: only things that never counted (draft / returned / rejected).
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireViewer();
  if ("res" in auth) return auth.res;
  const { viewer } = auth;
  const { admin, expense } = await load(id);
  if (!expense) return fail("Expense not found.", 404);
  const access = await grantAccess(viewer, expense.grant_id, admin);
  if (!(access.canManage || expense.created_by === viewer.employeeId)) return fail("You can't delete this expense.", 403);
  if (!["draft", "returned", "rejected"].includes(expense.status)) return fail("Submitted and approved expenses can't be deleted. Reject it instead.", 400);

  const { data: docs } = await admin.from("gm_expense_documents").select("storage_path").eq("expense_id", id);
  const { error } = await admin.from("gm_expenses").delete().eq("id", id);
  if (error) return fail(error.message, 500);
  // Its PEX portion goes back in the queue.
  if (expense.pex_transaction_id) await refreshPexTransaction(admin, expense.pex_transaction_id);
  if (docs?.length) await admin.storage.from("grant-documents").remove(docs.map((d: { storage_path: string }) => d.storage_path));
  await audit(admin, { entity: "expense", entityId: id, grantId: expense.grant_id, action: "deleted", actorId: viewer.employeeId, changes: expense });
  return NextResponse.json({ ok: true });
}
