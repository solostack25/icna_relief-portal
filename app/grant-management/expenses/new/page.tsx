import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/grantManagement/server";
import { getGmViewer, loadEntryGrants } from "@/lib/grantManagement/server";
import ExpenseForm from "@/components/grantManagement/ExpenseForm";
import { Notice, PageTitle } from "@/components/grantManagement/ui";

export default async function NewExpensePage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  // PEX transactions are coded (and split) on their own screen now.
  if (sp.pex) redirect(`/grant-management/pex/${encodeURIComponent(sp.pex)}`);
  const viewer = (await getGmViewer())!;
  const admin = createAdminClient();
  const grants = await loadEntryGrants(viewer, [], admin);

  let pex = null;
  if (sp.pex) {
    const { data } = await admin.from("gm_pex_transactions").select("id, transaction_date, amount, merchant, memo, employee_id, status").eq("id", sp.pex).maybeSingle();
    if (data && data.status === "unmatched" && (data.employee_id === viewer.employeeId || viewer.isManager)) pex = { ...data, amount: Number(data.amount) };
    else return <Notice tone="warn">That PEX transaction isn&apos;t waiting to be coded.</Notice>;
  }
  const preset = sp.grant && grants.some((g) => g.id === sp.grant) ? sp.grant : undefined;

  return (
    <div className="max-w-3xl">
      <PageTitle eyebrow={pex ? "PEX transaction" : "Expense"} title={pex ? "Code PEX transaction" : "Add an expense"} />
      <ExpenseForm grants={grants} initial={preset ? { grant_id: preset } : undefined} pex={pex ?? undefined} isManager={viewer.isManager} />
    </div>
  );
}
