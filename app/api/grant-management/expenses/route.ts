import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/grantManagement/server";
import { requireViewer, fail, readJson } from "@/lib/grantManagement/api";
import { audit, checkExpenseAgainstGrant, cleanExpenseInput, grantAccess } from "@/lib/grantManagement/server";
import { attachDocuments, submitExpense } from "@/lib/grantManagement/expenses";

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

  // PEX: the transaction fixes date, amount and merchant.
  let pex: { id: string; transaction_date: string; amount: number; merchant: string | null; employee_id: string | null; status: string } | null = null;
  if (typeof body.pex_transaction_id === "string") {
    const { data } = await admin.from("gm_pex_transactions").select("id, transaction_date, amount, merchant, employee_id, status").eq("id", body.pex_transaction_id).maybeSingle();
    if (!data) return fail("That PEX transaction wasn't found.", 404);
    if (data.status !== "unmatched") return fail("That PEX transaction has already been coded.");
    if (data.employee_id !== viewer.employeeId && !viewer.isManager) return fail("That PEX transaction isn't yours.", 403);
    pex = data;
    if (Math.abs(Number(data.amount) - input.amount) > 0.005) return fail("Amount must match the PEX transaction.", 400, { amount: `PEX amount is $${Number(data.amount).toFixed(2)}.` });
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
    await admin.from("gm_pex_transactions").update({ status: "coded", expense_id: row.id }).eq("id", pex.id);
    await audit(admin, { entity: "pex", entityId: pex.id, grantId: row.grant_id, action: "coded", actorId: viewer.employeeId, changes: { expense_id: row.id } });
  }

  if (body.submit === true) {
    const r = await submitExpense(admin, row, viewer);
    if (r.error) return NextResponse.json({ id: row.id, status: "draft", warning: `Saved as a draft: ${r.error}` });
    return NextResponse.json({ id: row.id, status: r.status });
  }
  return NextResponse.json({ id: row.id, status: "draft" });
}
