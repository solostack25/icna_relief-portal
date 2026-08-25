import { redirect } from "next/navigation";
import { getFinanceAdminAccess } from "@/lib/financeAdminAccess";
import FinanceAdminClient from "./FinanceAdminClient";
import FinanceHeader from "./FinanceHeader";

export default async function FinanceAdminPage() {
  const access = await getFinanceAdminAccess();
  if (!access.ok) redirect("/select-app");

  return (
    <div>
      <FinanceHeader />
      <FinanceAdminClient />
    </div>
  );
}
