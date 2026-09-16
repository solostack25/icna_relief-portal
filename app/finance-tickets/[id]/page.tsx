import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getFinanceAdminAccess } from "@/lib/financeAdminAccess";
import FinanceTicketDetailClient from "./FinanceTicketDetailClient";

export default async function FinanceTicketDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/");

  const { data: offices } = await supabase.from("b2s_offices").select("id, field_office").eq("is_active", true).order("field_office");

  // Same access check the Finance Guild queue (Help Desk) and the
  // admin Finance Tickets queue use - admin, or the "helpdesk-finance"/
  // "helpdesk-it" program access grant. Determines whether Claim/Mark
  // as Paid controls show up on this page at all.
  const financeAccess = await getFinanceAdminAccess();

  return (
    <div className="max-w-2xl mx-auto p-6">
      <FinanceTicketDetailClient
        id={id}
        offices={offices ?? []}
        financeAccess={financeAccess.ok}
        currentEmployeeId={financeAccess.ok ? financeAccess.employeeId : null}
      />
    </div>
  );
}
