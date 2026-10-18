import { redirect } from "next/navigation";
import { getFinanceAdminAccess } from "@/lib/financeAdminAccess";
import FinanceTicketQueueClient from "./FinanceTicketQueueClient";

export default async function FinanceTicketQueuePage() {
  const access = await getFinanceAdminAccess();
  if (!access.ok) redirect("/select-app");

  return (
    <div>
      <p className="text-sm mb-6" style={{ color: "rgba(22,48,43,0.55)" }}>
        Every ticket from every requestor, with who it&apos;s waiting on. Pick one up to process it and mark it processed once it&apos;s paid.
      </p>
      <FinanceTicketQueueClient currentEmployeeId={access.employeeId} />
    </div>
  );
}
