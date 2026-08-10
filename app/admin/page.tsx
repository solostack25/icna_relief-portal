import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function AdminPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/");

  const { data: me } = await supabase
    .from("employees")
    .select("role")
    .eq("auth_user_id", user.id)
    .single();

  if (me?.role !== "admin") redirect("/select-app");

  const { data: employees } = await supabase
    .from("employees")
    .select("id, first_name, last_name, email, role, is_active")
    .order("last_name");

  return (
    <main className="min-h-screen px-4 py-12">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-xl font-semibold">Admin Portal</h1>
            <p className="text-sm text-[var(--color-text-dim)]">
              Manage employees and app access
            </p>
          </div>
          <div className="flex items-center gap-4">
            <Link
              href="/admin/employees/new"
              className="text-sm text-[var(--color-accent)] hover:underline"
            >
              + Add Employee
            </Link>
            <Link
              href="/admin/ad-mappings"
              className="text-sm text-[var(--color-accent)] hover:underline"
            >
              AD Mappings
            </Link>
            <Link
              href="/workboards"
              className="text-sm text-[var(--color-accent)] hover:underline"
            >
              Workboards
            </Link>
            <Link
              href="/admin/helpdesk"
              className="text-sm text-[var(--color-accent)] hover:underline"
            >
              Help Desk Workload
            </Link>
            <Link
              href="/admin/review"
              className="text-sm text-[var(--color-accent)] hover:underline"
            >
              Review Submissions
            </Link>
            <Link
              href="/inkind-admin"
              className="text-sm text-[var(--color-accent)] hover:underline"
            >
              InKind Admin
            </Link>
            <Link
              href="/select-app"
              className="text-sm text-[var(--color-text-dim)] hover:text-[var(--color-text)]"
            >
              ← Back to apps
            </Link>
          </div>
        </div>

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
      </div>
    </main>
  );
}
