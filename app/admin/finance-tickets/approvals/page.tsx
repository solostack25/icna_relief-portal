import { redirect } from "next/navigation";
import { getFinanceAdminAccess } from "@/lib/financeAdminAccess";
import FinanceApprovalsClient from "./FinanceApprovalsClient";

export default async function FinanceTicketApprovalsPage() {
  const access = await getFinanceAdminAccess();
  if (!access.ok) redirect("/select-app");

  return (
    <div className="max-w-4xl mx-auto p-6">
      <h1 style={{ fontFamily: "'Fraunces', serif", fontStyle: "italic", fontWeight: 500, fontSize: 30, margin: "0 0 8px" }}>
        Approval Chains &amp; Coverage
      </h1>
      <p className="text-sm mb-8" style={{ color: "rgba(22,48,43,0.55)" }}>
        See exactly who a ticket is waiting on, and set up temporary coverage when someone's out.
      </p>
      <FinanceApprovalsClient />
    </div>
  );
}
