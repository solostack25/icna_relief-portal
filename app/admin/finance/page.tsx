import { redirect } from "next/navigation";

// The old helpdesk finance-approval admin (tiers / coverage / requests) was
// retired in favour of Finance Tickets; coverage now lives there.
export default function FinanceAdminPage() {
  redirect("/admin/finance-tickets/approvals");
}
