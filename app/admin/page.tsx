import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getManagedDepartments } from "@/lib/helpdesk";

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

  // This whole page is now a management hub, not admin-only - anyone
  // with SOME elevated access (a department queue, finance, review
  // authority, InKind admin) gets in and sees only the cards relevant
  // to them. Only full admins see the employee-management table and the
  // org-wide setup tools (Add Employee, AD Mappings, AD Preview, the
  // cross-department Workload view) - those stay gated within the page,
  // not at the page boundary.
  if (!isAdmin && !canManageTickets && !canManageFinance && !canReview && !canInkind) {
    redirect("/select-app");
  }

  const { data: employees } = isAdmin
    ? await supabase
        .from("employees")
        .select("id, first_name, last_name, email, role, is_active")
        .order("last_name")
    : { data: null };

  return (
    <main className="min-h-screen px-4 py-12">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-semibold">Admin Portal</h1>
            <p className="text-sm text-[var(--color-text-dim)]">
              {isAdmin ? "Manage employees and app access" : "Management tools"}
            </p>
          </div>
          <Link
            href="/select-app"
            className="text-sm text-[var(--color-text-dim)] hover:text-[var(--color-text)]"
          >
            ← Back to apps
          </Link>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-10">
          {isAdmin && (
            <Link
              href="/admin/employees/new"
              className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4 hover:border-[var(--color-accent)] transition-colors"
            >
              <div className="text-sm font-medium">➕ Add Employee</div>
            </Link>
          )}
          {isAdmin && (
            <Link
              href="/admin/ad-mappings"
              className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4 hover:border-[var(--color-accent)] transition-colors"
            >
              <div className="text-sm font-medium">🔗 AD Mappings</div>
            </Link>
          )}
          {isAdmin && (
            <Link
              href="/admin/ad-preview"
              className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4 hover:border-[var(--color-accent)] transition-colors"
            >
              <div className="text-sm font-medium">👁️ AD Provisioning Preview</div>
            </Link>
          )}
          {isAdmin && (
            <Link
              href="/admin/helpdesk"
              className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4 hover:border-[var(--color-accent)] transition-colors"
            >
              <div className="text-sm font-medium">📊 Help Desk Workload</div>
            </Link>
          )}
          {canManageTickets && (
            <Link
              href="/helpdesk/manage"
              className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4 hover:border-[var(--color-accent)] transition-colors"
            >
              <div className="text-sm font-medium">🎫 Manage Tickets</div>
            </Link>
          )}
          <Link
            href="/helpdesk/wizard"
            className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4 hover:border-[var(--color-accent)] transition-colors"
          >
            <div className="text-sm font-medium">📝 Submit a Ticket</div>
          </Link>
          {canManageFinance && (
            <Link
              href="/admin/finance"
              className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4 hover:border-[var(--color-accent)] transition-colors"
            >
              <div className="text-sm font-medium">💰 Finance Approvals</div>
            </Link>
          )}
          {canInkind && (
            <Link
              href="/inkind-admin"
              className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4 hover:border-[var(--color-accent)] transition-colors"
            >
              <div className="text-sm font-medium">📦 InKind Admin</div>
            </Link>
          )}
          {canReview && (
            <Link
              href="/admin/review"
              className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4 hover:border-[var(--color-accent)] transition-colors"
            >
              <div className="text-sm font-medium">✅ Review Submissions</div>
            </Link>
          )}
          <Link
            href="/workboards"
            className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4 hover:border-[var(--color-accent)] transition-colors"
          >
            <div className="text-sm font-medium">📋 Workboards</div>
          </Link>
        </div>

        {isAdmin && (
          <>
            <h2 className="text-sm font-semibold mb-3 text-[var(--color-text-dim)] uppercase tracking-wide">
              Employees
            </h2>
            <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--color-border)] text-left text-[var(--color-text-dim)]">
                    <th className="px-4 py-3 font-medium">Name</th>
                    <th className="px-4 py-3 font-medium">Email</th>
                    <th className="px-4 py-3 font-medium">Role</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {(employees ?? []).map((emp) => (
                    <tr
                      key={emp.id}
                      className="border-b border-[var(--color-border)] last:border-0"
                    >
                      <td className="px-4 py-3">
                        {emp.first_name} {emp.last_name}
                      </td>
                      <td className="px-4 py-3 text-[var(--color-text-dim)]">
                        {emp.email}
                      </td>
                      <td className="px-4 py-3 capitalize">{emp.role}</td>
                      <td className="px-4 py-3">
                        {emp.is_active ? (
                          <span className="text-[var(--color-accent)]">Active</span>
                        ) : (
                          <span className="text-[#B55139]">Inactive</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Link
                          href={`/admin/employees/${emp.id}`}
                          className="text-[var(--color-accent)] hover:underline"
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
