import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getAdminAccess } from "@/lib/adminAccess";
import AdminHomeView from "./AdminHomeView";

export default async function AdminPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/");

  const { data: me } = await supabase
    .from("employees")
    .select("id, role, assigned_office_id")
    .eq("auth_user_id", user.id)
    .single();
  if (!me) redirect("/select-app");

  const access = await getAdminAccess(supabase, me.id, me.role, me.assigned_office_id);
  if (!access.hasAnyAccess) redirect("/select-app");

  const { count: employeeCount } = access.isAdmin
    ? await supabase.from("employees").select("id", { count: "exact", head: true })
    : { count: null };

  const { data: unassignedAreaManagers } = access.isAdmin
    ? await supabase
        .from("employees")
        .select("id, first_name, last_name, email")
        .eq("role", "area_manager")
        .is("assigned_office_id", null)
        .order("last_name")
    : { data: null };

  // Finance tickets currently waiting on an approver (finance_tickets /
  // finance_approvals — the old helpdesk finance_approval_* flow is retired).
  let pendingApprovals: {
    href: string;
    amount: number;
    title: string | null;
    submitted_by: string | null;
    approver_name: string;
    approver_job_title: string | null;
  }[] = [];
  if (access.canManageFinance) {
    const { data: steps } = await supabase
      .from("finance_approvals")
      .select("finance_ticket_id, approver_name, chain_person_job_title, created_at")
      .eq("is_current_step", true)
      .eq("approval_status", "pending")
      .order("created_at", { ascending: false })
      .limit(3);
    if (steps && steps.length > 0) {
      const { data: tickets } = await supabase
        .from("finance_tickets")
        .select("id, title, total, employees:requestor_id(first_name, last_name)")
        .in("id", steps.map((s) => s.finance_ticket_id));
      const ticketMap = new Map((tickets ?? []).map((t: any) => [t.id, t]));
      pendingApprovals = steps
        .map((s) => {
          const t: any = ticketMap.get(s.finance_ticket_id);
          return t
            ? {
                href: `/finance-tickets/${t.id}`,
                amount: Number(t.total ?? 0),
                title: t.title ?? null,
                submitted_by: t.employees ? `${t.employees.first_name} ${t.employees.last_name}` : null,
                approver_name: s.approver_name,
                approver_job_title: s.chain_person_job_title,
              }
            : null;
        })
        .filter((x): x is NonNullable<typeof x> => x !== null);
    }
  }

  return (
    <AdminHomeView
      canManageFinance={access.canManageFinance}
      pendingApprovals={pendingApprovals}
      isAdmin={access.isAdmin}
      unassignedAreaManagers={(unassignedAreaManagers ?? []).map((e) => ({
        id: e.id,
        first_name: e.first_name,
        last_name: e.last_name,
      }))}
      employeeCount={employeeCount}
    />
  );
}
