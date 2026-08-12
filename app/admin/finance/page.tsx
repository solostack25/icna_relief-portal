import { redirect } from "next/navigation";
import Link from "next/link";
import { getFinanceAdminAccess } from "@/lib/financeAdminAccess";
import FinanceAdminClient from "./FinanceAdminClient";

export default async function FinanceAdminPage() {
  const access = await getFinanceAdminAccess();
  if (!access.ok) redirect("/select-app");

  return (
    <main className="min-h-screen px-4 py-12">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-2">
          <h1 className="text-xl font-semibold">Finance Approvals</h1>
          <Link href="/admin" className="text-sm text-[var(--color-text-dim)] hover:text-[var(--color-text)]">
            ← Back to Admin Portal
          </Link>
        </div>
        <p className="text-sm text-[var(--color-text-dim)] mb-8">
          Approval thresholds, temporary coverage, and in-flight requests for the
          finance helpdesk category's dollar-amount approval chain.
        </p>
        <FinanceAdminClient />
      </div>
    </main>
  );
}
