import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getManagedDepartments } from "@/lib/helpdesk";
import PortalHeader from "@/app/PortalHeader";

const ICONS: Record<string, React.ReactNode> = {
  addEmployee: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="9" cy="8" r="4" />
      <path d="M2 21c0-4 3-7 7-7s7 3 7 7M18 8v6M15 11h6" />
    </svg>
  ),
  mappings: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M9 17H7a5 5 0 010-10h2M15 7h2a5 5 0 010 10h-2M8 12h8" />
    </svg>
  ),
  preview: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  ),
  workload: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M4 20V10M12 20V4M20 20v-7" />
    </svg>
  ),
  tickets: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M9 11l3 3L22 4" />
      <path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" />
    </svg>
  ),
  finance: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 3" />
    </svg>
  ),
  inkind: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M21 8l-9-5-9 5 9 5 9-5zM3 8v8l9 5 9-5V8M12 13v8" />
    </svg>
  ),
  review: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M22 11.08V12a10 10 0 11-5.93-9.14" />
      <path d="M22 4L12 14.01l-3-3" />
    </svg>
  ),
  workboards: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M9 3v18M15 3v18" />
    </svg>
  ),
  training: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M22 10L12 5 2 10l10 5 10-5z" />
      <path d="M6 12v5c0 1.5 2.5 3 6 3s6-1.5 6-3v-5" />
    </svg>
  ),
};

export default async function AdminPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/");

  const { data: me } = await supabase
    .from("employees")
    .select("id, role")
    .eq("auth_user_id", user.id)
    .single();
  if (!me) redirect("/select-app");

  const isAdmin = me.role === "admin";
  const managedDepartments = await getManagedDepartments(supabase, me.id, me.role);
  const canManageTickets = isAdmin || managedDepartments.length > 0;
  const canManageFinance = isAdmin || managedDepartments.includes("finance") || managedDepartments.includes("it");
  const canReview = isAdmin || me.role === "regional_director" || me.role === "program_director";

  const { data: inkindAccess } = isAdmin
    ? { data: null }
    : await supabase
        .from("employee_program_access")
        .select("program_slug")
        .eq("employee_id", me.id)
        .eq("program_slug", "in-kind-donation")
        .maybeSingle();
  const canInkind = isAdmin || !!inkindAccess;

  if (!isAdmin && !canManageTickets && !canManageFinance && !canReview && !canInkind) {
    redirect("/select-app");
  }

  const { data: employees } = isAdmin
    ? await supabase
        .from("employees")
        .select("id, first_name, last_name, email, role, is_active")
        .order("last_name")
    : { data: null };

  // Real preview of what's currently stuck waiting, for anyone who can
  // manage finance — same idea as the "Active Requests" tab in
  // /admin/finance, trimmed to the 3 most recent so it fits as a
  // glance-able preview here rather than duplicating that full page.
  let pendingApprovals: {
    request_id: string;
    amount: number;
    title: string | null;
    submitted_by: string | null;
    approver_name: string;
    approver_job_title: string | null;
  }[] = [];
  if (canManageFinance) {
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

  const cards: { href: string; label: string; icon: string; show: boolean }[] = [
    { href: "/admin/employees/new", label: "Add Employee", icon: "addEmployee", show: isAdmin },
    { href: "/admin/ad-mappings", label: "AD Mappings", icon: "mappings", show: isAdmin },
    { href: "/admin/ad-preview", label: "AD Provisioning Preview", icon: "preview", show: isAdmin },
    { href: "/admin/helpdesk", label: "Help Desk Workload", icon: "workload", show: isAdmin },
    { href: "/helpdesk/manage", label: "Manage Tickets", icon: "tickets", show: canManageTickets },
    { href: "/admin/finance", label: "Finance Approvals", icon: "finance", show: canManageFinance },
    { href: "/inkind-admin", label: "InKind Admin", icon: "inkind", show: canInkind },
    { href: "/admin/review", label: "Review Submissions", icon: "review", show: canReview },
    { href: "/admin/training", label: "Training Courses", icon: "training", show: isAdmin },
    { href: "/workboards", label: "Workboards", icon: "workboards", show: true },
  ].filter((c) => c.show);

  return (
    <main style={{ minHeight: "100vh", background: "var(--portal-sand)" }}>
      <PortalHeader />

      <div className="max-w-4xl mx-auto px-4 sm:px-10 py-8 sm:py-10">
        <div className="flex items-center justify-between mb-8">
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
              Admin Portal
            </h1>
            <p className="text-sm" style={{ color: "rgba(22,48,43,0.55)" }}>
              {isAdmin ? "Manage employees and app access" : "Management tools"}
            </p>
          </div>
          <Link href="/select-app" className="text-sm" style={{ color: "rgba(22,48,43,0.5)" }}>
            ← Back to apps
          </Link>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-10">
          {cards.map((c) => (
            <Link
              key={c.href}
              href={c.href}
              className="rounded-xl bg-white p-4 transition-all hover:-translate-y-0.5"
              style={{
                border: "1px solid var(--portal-line)",
                boxShadow: "0 1px 2px rgba(22,48,43,0.04)",
              }}
            >
              <div
                className="w-8 h-8 rounded-lg flex items-center justify-center mb-3"
                style={{ background: "#EAF3EF", color: "var(--portal-emerald)" }}
              >
                <span style={{ width: 16, height: 16, display: "block" }}>{ICONS[c.icon]}</span>
              </div>
              <div className="text-sm font-bold">{c.label}</div>
            </Link>
          ))}
        </div>

        {canManageFinance && pendingApprovals.length > 0 && (
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

        {isAdmin && (
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
                    <th
                      className="px-4 py-3 text-left font-medium"
                      style={{ color: "rgba(22,48,43,0.5)" }}
                    >
                      Name
                    </th>
                    <th
                      className="px-4 py-3 text-left font-medium"
                      style={{ color: "rgba(22,48,43,0.5)" }}
                    >
                      Email
                    </th>
                    <th
                      className="px-4 py-3 text-left font-medium"
                      style={{ color: "rgba(22,48,43,0.5)" }}
                    >
                      Role
                    </th>
                    <th
                      className="px-4 py-3 text-left font-medium"
                      style={{ color: "rgba(22,48,43,0.5)" }}
                    >
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
                        <Link
                          href={`/admin/employees/${emp.id}`}
                          style={{ color: "var(--portal-emerald)" }}
                        >
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
    </main>
  );
}
