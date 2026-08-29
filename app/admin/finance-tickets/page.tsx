import { redirect } from "next/navigation";
import { getFinanceAdminAccess } from "@/lib/financeAdminAccess";
import FinanceTicketQueueClient from "./FinanceTicketQueueClient";

export default async function FinanceTicketQueuePage() {
  const access = await getFinanceAdminAccess();
  if (!access.ok) redirect("/select-app");

  return (
    <div className="max-w-5xl mx-auto p-6">
      <h1 style={{ fontFamily: "'Fraunces', serif", fontStyle: "italic", fontWeight: 500, fontSize: 30, margin: "0 0 8px" }}>
        Finance Ticket Queue
      </h1>
      <p className="text-sm mb-8" style={{ color: "rgba(22,48,43,0.55)" }}>
        Every submitted ticket, across every requestor. Pick one up to process it, and mark it processed once it's paid.
      </p>
      <FinanceTicketQueueClient />
    </div>
  );
}
