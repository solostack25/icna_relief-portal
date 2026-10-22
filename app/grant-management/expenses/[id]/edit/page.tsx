import Link from "next/link";
import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/grantManagement/server";
import { getGmViewer, grantAccess, loadEntryGrants } from "@/lib/grantManagement/server";
import { lineLabel } from "@/lib/grantManagement/shared";
import ExpenseForm from "@/components/grantManagement/ExpenseForm";
import { Notice, PageTitle, faint } from "@/components/grantManagement/ui";

export default async function EditExpensePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const viewer = (await getGmViewer())!;
  const admin = createAdminClient();
  const { data: e } = await admin.from("gm_expenses").select("*").eq("id", id).maybeSingle();
  if (!e) notFound();
  const access = await grantAccess(viewer, e.grant_id, admin);
  const isOwner = e.created_by === viewer.employeeId;
  if (!(access.canManage || (isOwner && ["draft", "returned"].includes(e.status)))) {
    return <Notice tone="warn">This expense can&apos;t be edited right now.</Notice>;
  }
  const [grants, { data: docs }, { data: line }] = await Promise.all([
    loadEntryGrants(viewer, [e.grant_id], admin),
    admin.from("gm_expense_documents").select("id, file_name, doc_type, content_type, extracted").eq("expense_id", id),
    admin.from("gm_budget_lines").select("id, category, subcategory").eq("id", e.line_id).single(),
  ]);
  const pex = e.pex_transaction_id ? (await admin.from("gm_pex_transactions").select("id, transaction_date, amount, merchant, memo").eq("id", e.pex_transaction_id).single()).data : null;

  return (
    <div className="max-w-3xl">
      <Link href={`/grant-management/expenses/${id}`} className="text-xs" style={{ color: faint }}>
        ← Back to expense
      </Link>
      <PageTitle eyebrow="Expense" title="Edit expense" />
      <ExpenseForm
        grants={grants}
        expenseId={id}
        status={e.status}
        isManager={viewer.isManager}
        docs={(docs ?? []).map((d) => ({ ...d, file_name: d.file_name ?? "document" }))}
        currentLine={line ? { id: line.id, label: lineLabel(line) } : undefined}
        pex={pex ? { ...pex, amount: Number(pex.amount) } : undefined}
        initial={{
          grant_id: e.grant_id,
          line_id: e.line_id,
          expense_date: e.expense_date,
          vendor: e.vendor ?? "",
          amount: String(e.amount),
          description: e.description,
          kind: e.kind,
          payment_method: e.payment_method ?? "",
          external_ref: e.external_ref ?? "",
        }}
      />
    </div>
  );
}
