import { redirect } from "next/navigation";
import { getFinanceAdminAccess } from "@/lib/financeAdminAccess";
import FinanceAdminClient from "./FinanceAdminClient";

export default async function FinanceAdminPage() {
  const access = await getFinanceAdminAccess();
  if (!access.ok) redirect("/select-app");

  return (
    <div>
      <h1 style={{ fontFamily: "'Fraunces', serif", fontStyle: "italic", fontWeight: 500, fontSize: 30, margin: "0 0 8px" }}>
        Finance Approvals
      </h1>
      <p className="text-sm mb-8" style={{ color: "rgba(22,48,43,0.55)" }}>
        Approval thresholds, temporary coverage, and in-flight requests for the
        finance helpdesk category's dollar-amount approval chain.
      </p>
      <FinanceAdminClient />
    </div>
  );
}
