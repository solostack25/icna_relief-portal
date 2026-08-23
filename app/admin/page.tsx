import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getAdminAccess } from "@/lib/adminAccess";

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
    <div>
      <h1
        style={{
          fontFamily: "'Fraunces', serif",
          fontStyle: "italic",
          fontWeight: 500,
          fontSize: 30,
          margin: "0 0 4px",
        }}
      >
        Welcome back
      </h1>
      <p className="text-sm mb-8" style={{ color: "rgba(22,48,43,0.55)" }}>
        Pick a tool from the sidebar, or check what's waiting below.
      </p>

      {access.canManageFinance && pendingApprovals.length > 0 && (
        <>
          <div
            className="text-xs font-medium mb-3"
            style={{
              fontFamily: "'IBM Plex Mono', monospace",
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              color: "var(--portal-emerald)",
            }}
          >
            Awaiting Approval
          </div>
          <div
            className="rounded-2xl bg-white overflow-hidden mb-10"
            style={{ border: "1px solid var(--portal-line)", boxShadow: "0 1px 2px rgba(22,48,43,0.04)" }}
          >
            {pendingApprovals.map((p, i) => (
              <Link
                key={i}
                href={`/helpdesk/${p.request_id}`}
                className="flex flex-wrap items-center justify-between gap-2 px-5 py-3.5 hover:bg-black/[0.02] transition-colors"
                style={{
                  borderBottom: i < pendingApprovals.length - 1 ? "1px solid var(--portal-line)" : "none",
                }}
              >
                <div className="min-w-0">
                  <div className="text-sm font-bold truncate">{p.title ?? "Untitled request"}</div>
                  <div
                    className="text-[11px]"
                    style={{ color: "rgba(22,48,43,0.5)", fontFamily: "'IBM Plex Mono', monospace" }}
                  >
                    {p.submitted_by?.toUpperCase()} · ${p.amount.toLocaleString()}
                  </div>
                </div>
                <span
                  className="text-[10.5px] px-2.5 py-1 rounded-full font-semibold"
                  style={{ background: "var(--portal-gold-soft)", color: "#7A5A17" }}
                >
                  Awaiting {p.approver_job_title ?? p.approver_name}
                </span>
              </Link>
            ))}
          </div>
        </>
      )}

      {access.isAdmin && (unassignedAreaManagers ?? []).length > 0 && (
        <div
          className="rounded-2xl px-4 py-3 mb-6 flex flex-wrap items-center gap-x-2 gap-y-1"
          style={{ background: "#FBF0E6", border: "1px solid #E9C9A6" }}
        >
          <span style={{ fontWeight: 700, color: "#8A4A1E" }}>
            {(unassignedAreaManagers ?? []).length} area manager{(unassignedAreaManagers ?? []).length === 1 ? "" : "s"} need
            {(unassignedAreaManagers ?? []).length === 1 ? "s" : ""} an office assigned:
          </span>
          {(unassignedAreaManagers ?? []).map((e, i) => (
            <span key={e.id}>
              <Link href={`/admin/employees/${e.id}`} style={{ color: "#8A4A1E", textDecoration: "underline" }}>
                {e.first_name} {e.last_name}
              </Link>
              {i < (unassignedAreaManagers ?? []).length - 1 ? "," : ""}
            </span>
          ))}
        </div>
      )}

      {access.isAdmin && (
        <>
          <div
            className="text-xs font-medium mb-3"
            style={{
              fontFamily: "'IBM Plex Mono', monospace",
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              color: "var(--portal-emerald)",
            }}
          >
            Employees
          </div>
          <Link
            href="/admin/employees"
            className="flex items-center justify-between rounded-2xl bg-white px-5 py-4"
            style={{ border: "1px solid var(--portal-line)", boxShadow: "0 1px 2px rgba(22,48,43,0.04)" }}
          >
            <span className="text-sm">
              <span style={{ fontWeight: 700, fontSize: 20 }}>{employeeCount ?? 0}</span>{" "}
              <span style={{ color: "rgba(22,48,43,0.5)" }}>employees have signed in — search, filter, and manage them</span>
            </span>
            <span style={{ color: "var(--portal-emerald)", fontWeight: 600 }}>View All →</span>
          </Link>
        </>
      )}
    </div>
  );
}
