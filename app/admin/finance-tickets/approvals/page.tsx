import { redirect } from "next/navigation";
import { getFinanceAdminAccess } from "@/lib/financeAdminAccess";
import FinanceApprovalsClient from "./FinanceApprovalsClient";

export default async function FinanceApprovalCoveragePage() {
  const access = await getFinanceAdminAccess();
  if (!access.ok) redirect("/select-app");

  return (
    <div>
      <p className="text-sm mb-6" style={{ color: "rgba(22,48,43,0.55)" }}>
        When an approver is out, route their finance approvals to someone else for a set period. Who each ticket is waiting on is shown in the Ticket Queue.
      </p>
      <FinanceApprovalsClient />
    </div>
  );
}
