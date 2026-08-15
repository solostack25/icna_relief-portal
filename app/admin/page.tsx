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

  const { data: me } = await supabase.from("employees").select("id, role").eq("auth_user_id", user.id).single();
  if (!me) redirect("/select-app");

  const access = await getAdminAccess(supabase, me.id, me.role);
  if (!access.hasAnyAccess) redirect("/select-app");

  const { data: employees } = access.isAdmin
    ? await supabase
        .from("employees")
        .select("id, first_name, last_name, email, role, is_active")
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
                className="flex items-center justify-between px-5 py-3.5 hover:bg-black/[0.02] transition-colors"
                style={{
                  borderBottom: i < pendingApprovals.length - 1 ? "1px solid var(--portal-line)" : "none",
                }}
              >
                <div>
                  <div className="text-sm font-bold">{p.title ?? "Untitled request"}</div>
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
          <div
            className="rounded-2xl bg-white overflow-hidden"
            style={{ border: "1px solid var(--portal-line)", boxShadow: "0 1px 2px rgba(22,48,43,0.04)" }}
          >
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: "1px solid var(--portal-line)" }}>
                  <th className="px-4 py-3 text-left font-medium" style={{ color: "rgba(22,48,43,0.5)" }}>
                    Name
                  </th>
                  <th className="px-4 py-3 text-left font-medium" style={{ color: "rgba(22,48,43,0.5)" }}>
                    Email
                  </th>
                  <th className="px-4 py-3 text-left font-medium" style={{ color: "rgba(22,48,43,0.5)" }}>
                    Role
                  </th>
                  <th className="px-4 py-3 text-left font-medium" style={{ color: "rgba(22,48,43,0.5)" }}>
                    Status
                  </th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {(employees ?? []).map((emp, i) => (
                  <tr
                    key={emp.id}
                    style={{
                      borderBottom: i < (employees ?? []).length - 1 ? "1px solid var(--portal-line)" : "none",
                    }}
                  >
                    <td className="px-4 py-3">
                      {emp.first_name} {emp.last_name}
                    </td>
                    <td className="px-4 py-3" style={{ color: "rgba(22,48,43,0.55)" }}>
                      {emp.email}
                    </td>
                    <td className="px-4 py-3 capitalize">{emp.role}</td>
                    <td className="px-4 py-3">
                      {emp.is_active ? (
                        <span style={{ color: "var(--portal-emerald)" }}>Active</span>
                      ) : (
                        <span style={{ color: "#B55139" }}>Inactive</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link href={`/admin/employees/${emp.id}`} style={{ color: "var(--portal-emerald)" }}>
                        Manage →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
