import { redirect } from "next/navigation";
import { getFinanceAdminAccess } from "@/lib/financeAdminAccess";
import ExpensesClient from "./ExpensesClient";

export const dynamic = "force-dynamic";

// Finance's monthly expenses: what used to be built by hand in the
// "Expenditure PowerBi" workbook from the QuickBooks P&L by Class export.
export default async function ExpensesPage() {
  const access = await getFinanceAdminAccess();
  if (!access.ok) redirect(access.status === 401 ? "/" : "/select-app");
  return (
    <div>
      <h1 style={{ fontFamily: "'Fraunces', serif", fontStyle: "italic", fontWeight: 500, fontSize: 30, margin: "0 0 8px" }}>Expenses</h1>
      <p className="text-sm mb-6" style={{ color: "rgba(22,48,43,0.55)", maxWidth: 760 }}>
        Monthly expenses by office, central department and grant — the same layout as the Expenditure workbook. Pull a month from QuickBooks, upload the
        QuickBooks export or the cleaned file, or type it in. Central costs are shared to offices by FTE.
      </p>
      <ExpensesClient />
    </div>
  );
}
