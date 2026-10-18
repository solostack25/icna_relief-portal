import { redirect } from "next/navigation";
import { getFinanceAdminAccess } from "@/lib/financeAdminAccess";
import FinanceDashboardClient from "./FinanceDashboardClient";

export const dynamic = "force-dynamic";

// Finance team dashboard: approvals waiting on you, the pipeline from
// submitted → approved → paid, where tickets are stuck, and spend trends.
export default async function FinanceDashboardPage() {
  const access = await getFinanceAdminAccess();
  if (!access.ok) redirect("/select-app");
  return <FinanceDashboardClient />;
}
