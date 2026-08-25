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

  let pendingApprovals: {
    request_id: string;
    amount: number;
    title: string | null;
    submitted_by: string | null;
    approver_name: string;
    approver_job_title: string | null;
  }[] = [];
  if (access.canManageFinance) {
    const { data: steps } = await supabase
      .from("finance_approval_steps")
      .select("finance_approval_request_id, approver_name, chain_person_job_title, status")
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(3);
    if (steps && steps.length > 0) {
      const farIds = steps.map((s) => s.finance_approval_request_id);
      const { data: fars } = await supabase
        .from("finance_approval_requests")
        .select("id, request_id, amount")
        .in("id", farIds);
      const farMap = new Map((fars ?? []).map((f) => [f.id, f]));
      const requestIds = (fars ?? []).map((f) => f.request_id);
      const { data: tickets } = await supabase
        .from("helpdesk_requests")
        .select("id, title, submitted_by")
        .in("id", requestIds.length ? requestIds : ["00000000-0000-0000-0000-000000000000"]);
      const ticketMap = new Map((tickets ?? []).map((t) => [t.id, t]));

      pendingApprovals = steps
        .map((s) => {
          const far = farMap.get(s.finance_approval_request_id);
          const ticket = far ? ticketMap.get(far.request_id) : null;
          return far
            ? {
                request_id: far.request_id,
                amount: far.amount,
                title: ticket?.title ?? null,
                submitted_by: ticket?.submitted_by ?? null,
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
