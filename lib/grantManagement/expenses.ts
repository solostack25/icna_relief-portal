import { createAdminClient } from "@/lib/grantManagement/server";
import { audit, grantAccess, type GmViewer } from "./server";

type Admin = ReturnType<typeof createAdminClient>;

export const EXPENSE_EDIT_FIELDS = [
  "grant_id",
  "line_id",
  "expense_date",
  "vendor",
  "amount",
  "description",
  "office_id",
  "program",
  "kind",
  "payment_method",
  "external_ref",
  "doc_required",
] as const;

// Link documents uploaded before the expense existed. Only the
// uploader's own unattached documents can be claimed.
export async function attachDocuments(admin: Admin, expenseId: string, employeeId: string, ids: unknown) {
  if (!Array.isArray(ids) || !ids.length) return 0;
  const clean = ids.filter((x): x is string => typeof x === "string").slice(0, 25);
  const { data } = await admin
    .from("gm_expense_documents")
    .update({ expense_id: expenseId })
    .in("id", clean)
    .eq("uploaded_by", employeeId)
    .is("expense_id", null)
    .select("id");
  return data?.length ?? 0;
}

export async function docCount(admin: Admin, expenseId: string) {
  const { count } = await admin.from("gm_expense_documents").select("id", { count: "exact", head: true }).eq("expense_id", expenseId);
  return count ?? 0;
}

type ExpenseRow = { id: string; grant_id: string; status: string; doc_required: boolean; created_by: string | null; amount: number };

// Submit: needs its documents; skips straight to approved when the
// grant doesn't require approval.
export async function submitExpense(admin: Admin, e: ExpenseRow, viewer: GmViewer): Promise<{ error?: string; status?: string }> {
  if (!["draft", "returned"].includes(e.status)) return { error: "Only drafts or returned expenses can be submitted." };
  if (e.doc_required && (await docCount(admin, e.id)) === 0) return { error: "Attach the receipt or invoice before submitting." };
  const { data: grant } = await admin.from("gm_grants").select("approval_required, status").eq("id", e.grant_id).single();
  if (grant?.status !== "active") return { error: "This grant isn't open for spending." };
  const now = new Date().toISOString();
  const auto = grant && !grant.approval_required;
  const patch = auto
    ? { status: "approved", submitted_by: viewer.employeeId, submitted_at: now, reviewed_by: null, reviewed_at: now, review_note: "Auto-approved: this grant doesn't require approval.", updated_at: now }
    : { status: "submitted", submitted_by: viewer.employeeId, submitted_at: now, reviewed_by: null, reviewed_at: null, review_note: null, updated_at: now };
  const { error } = await admin.from("gm_expenses").update(patch).eq("id", e.id);
  if (error) return { error: error.message };
  await audit(admin, { entity: "expense", entityId: e.id, grantId: e.grant_id, action: auto ? "submitted_auto_approved" : "submitted", actorId: viewer.employeeId });
  return { status: patch.status };
}

export async function reviewExpense(
  admin: Admin,
  e: ExpenseRow,
  viewer: GmViewer,
  decision: "approve" | "reject" | "return" | "reopen",
  note: string | null
): Promise<{ error?: string; status?: string }> {
  const access = await grantAccess(viewer, e.grant_id, admin);
  if (decision === "reopen") {
    if (!access.canManage) return { error: "Only Grant Management can reopen an approved expense." };
    if (!["approved", "rejected"].includes(e.status)) return { error: "Only approved or rejected expenses can be reopened." };
    if (!note) return { error: "Say why it's being reopened." };
  } else {
    if (!access.canApprove) return { error: "You can't approve expenses on this grant." };
    if (e.status !== "submitted") return { error: "Only submitted expenses can be reviewed." };
    if (e.created_by === viewer.employeeId && !viewer.isManager) return { error: "You can't approve your own expense. Another approver or Grant Management needs to." };
    if (decision !== "approve" && !note) return { error: decision === "reject" ? "Say why it's rejected." : "Say what needs fixing." };
    if (decision === "approve" && e.doc_required && (await docCount(admin, e.id)) === 0) return { error: "This expense still needs its receipt or invoice." };
  }
  const status = { approve: "approved", reject: "rejected", return: "returned", reopen: "returned" }[decision];
  const now = new Date().toISOString();
  const { error } = await admin
    .from("gm_expenses")
    .update({ status, reviewed_by: viewer.employeeId, reviewed_at: now, review_note: note, updated_at: now })
    .eq("id", e.id)
    .eq("status", e.status);
  if (error) return { error: error.message };
  await audit(admin, {
    entity: "expense",
    entityId: e.id,
    grantId: e.grant_id,
    action: { approve: "approved", reject: "rejected", return: "returned", reopen: "reopened" }[decision],
    actorId: viewer.employeeId,
    changes: { status: { from: e.status, to: status } },
    note,
  });
  return { status };
}
