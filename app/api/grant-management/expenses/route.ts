import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/grantManagement/server";
import { requireViewer, fail, readJson } from "@/lib/grantManagement/api";
import { audit, checkExpenseAgainstGrant, cleanExpenseInput, grantAccess } from "@/lib/grantManagement/server";
import { attachDocuments, submitExpense } from "@/lib/grantManagement/expenses";
import { refreshPexTransaction } from "@/lib/pex/allocation";
import { checkPortion, remaining } from "@/lib/pex/rules";

// Create an expense (draft, or submitted straight away with submit: true).
// Also used to code a PEX transaction (pex_transaction_id).
export async function POST(req: Request) {
  const auth = await requireViewer();
  if ("res" in auth) return auth.res;
  const { viewer } = auth;
  const body = await readJson(req);
  const { input, errors } = cleanExpenseInput(body);
  if (!input) return fail("Please fix the highlighted fields.", 400, errors);

  const admin = createAdminClient();
  const access = await grantAccess(viewer, input.grant_id, admin);
  const check = await checkExpenseAgainstGrant(admin, input, access);
  if (Object.keys(check.errors).length) return fail("Please fix the highlighted fields.", 400, check.errors);
  const grant = check.grant!;

  // PEX: the transaction fixes the date and merchant. The amount can be
  // the whole transaction or one portion of a split (the rest is coded
  // separately, or marked non-grant).
  let pex: { id: string; amount: number; employee_id: string | null; status: string } | null = null;
  if (typeof body.pex_transaction_id === "string") {
    const { data } = await admin
      .from("gm_pex_transactions")
      .select("id, transaction_date, amount, merchant, employee_id, status, is_pending, allocated_amount, non_grant_amount, in_grant_scope")
      .eq("id", body.pex_transaction_id)
      .maybeSingle();
    if (!data) return fail("That PEX transaction wasn't found.", 404);
    if (!data.in_grant_scope) return fail("This charge wasn't made on a card assigned to a grant for that date, so it can't be coded to a grant.", 403);
    if (data.is_pending) return fail("That PEX transaction is still pending. It can be coded once it settles.");
    if (!["unmatched", "partial"].includes(data.status)) return fail("That PEX transaction has already been fully coded.");
    if (data.employee_id !== viewer.employeeId && !viewer.isManager) return fail("That PEX transaction isn't yours.", 403);
    const left = remaining(Number(data.amount), Number(data.allocated_amount), Number(data.non_grant_amount));
    const portionErr = checkPortion(Number(data.amount), left, input.amount);
    if (portionErr) return fail("Amount doesn't fit the PEX transaction.", 400, { amount: portionErr });
    if (input.expense_date !== data.transaction_date) return fail("The date comes from the PEX transaction.", 400, { expense_date: `PEX date is ${data.transaction_date}.` });
    pex = { id: data.id, amount: Number(data.amount), employee_id: data.employee_id, status: data.status };
  }

  const { data: row, error } = await admin
    .from("gm_expenses")
    .insert({
      ...input,
      office_id: input.office_id ?? grant.office_id,
      program: input.program ?? grant.program,
      payment_method: pex ? "pex" : input.payment_method,
      doc_required: check.docRequired,
      status: "draft",
      source: pex ? "pex" : "manual",
      pex_transaction_id: pex?.id ?? null,
      created_by: viewer.employeeId,
    })
    .select("id, grant_id, status, doc_required, created_by, amount")
    .single();
  if (error || !row) return fail(error?.message ?? "Couldn't save the expense.", 500);

  await attachDocuments(admin, row.id, viewer.employeeId, body.document_ids);
  await audit(admin, { entity: "expense", entityId: row.id, grantId: row.grant_id, action: "created", actorId: viewer.employeeId, changes: { ...input, source: pex ? "pex" : "manual" } });
  if (pex) {
    const after = await refreshPexTransaction(admin, pex.id);
    await audit(admin, { entity: "pex", entityId: pex.id, grantId: row.grant_id, action: "coded", actorId: viewer.employeeId, changes: { expense_id: row.id, amount: row.amount, status: { from: pex.status, to: after?.status } } });
  }

  if (body.submit === true) {
    const r = await submitExpense(admin, row, viewer);
    if (r.error) return NextResponse.json({ id: row.id, status: "draft", warning: `Saved as a draft: ${r.error}` });
    return NextResponse.json({ id: row.id, status: r.status });
  }
  return NextResponse.json({ id: row.id, status: "draft" });
}
