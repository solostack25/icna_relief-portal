import { redirect } from "next/navigation";
import { getFinanceAdminAccess } from "@/lib/financeAdminAccess";
import FinanceAdminClient from "./FinanceAdminClient";

export default async function FinanceAdminPage() {
  const access = await getFinanceAdminAccess();
  if (!access.ok) redirect("/select-app");

  return (
    <div>
      <h1 className="text-xl font-semibold mb-2">Finance Approvals</h1>
      <p className="text-sm text-[var(--color-text-dim)] mb-8">
        Approval thresholds, temporary coverage, and in-flight requests for the
        finance helpdesk category's dollar-amount approval chain.
      </p>
      <FinanceAdminClient />
    </div>
  );
}
