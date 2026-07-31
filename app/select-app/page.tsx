import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

export default async function SelectAppPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/");

  // 1. find the employee row for this authenticated user
  const { data: employee } = await supabase
    .from("employees")
    .select("id, first_name, last_name, role")
    .eq("auth_user_id", user.id)
    .single();

  if (!employee) {
    return (
      <main className="min-h-screen flex items-center justify-center px-4">
        <p className="text-sm text-[var(--color-text-dim)]">
          No employee record found for this account. Contact an admin.
        </p>
      </main>
    );
  }

  // 2. get this employee's program access (separate query — no join,
  //    per the sb_publishable_ key relational-join issue)
  const { data: access } = await supabase
    .from("employee_program_access")
    .select("program_slug")
    .eq("employee_id", employee.id);

  const allowedSlugs = (access ?? []).map((a) => a.program_slug);

  // 3. get the active app registry, filter in memory
  const { data: apps } = await supabase
    .from("app_registry")
    .select("slug, display_name, route, icon, is_active, sort_order")
    .eq("is_active", true)
    .order("sort_order");

  const visibleApps = (apps ?? []).filter((a) =>
    employee.role === "admin" ? true : allowedSlugs.includes(a.slug)
  );

  return (
    <main className="min-h-screen px-4 py-12">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-xl font-semibold mb-1">
          Welcome, {employee.first_name}
        </h1>
        <p className="text-sm text-[var(--color-text-dim)] mb-8">
          Choose an app to continue
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {(visibleApps.length > 0 || employee.role === "admin") && (
            <Link
              href="/intake"
              className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 hover:border-[var(--color-accent)] transition-colors sm:col-span-2"
            >
              <div className="text-lg font-medium">Client Intake</div>
              <div className="text-xs text-[var(--color-text-dim)] mt-1">
                Search existing clients or register a new one
              </div>
            </Link>
          )}

          {visibleApps.map((app) => (
            <Link
              key={app.slug}
              href={app.route}
              className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 hover:border-[var(--color-accent)] transition-colors"
            >
              <div className="text-lg font-medium">{app.display_name}</div>
            </Link>
          ))}

          {employee.role === "admin" && (
            <Link
              href="/admin"
              className="rounded-xl border border-[var(--color-accent)]/40 bg-[var(--color-surface)] p-6 hover:border-[var(--color-accent)] transition-colors"
            >
              <div className="text-lg font-medium text-[var(--color-accent)]">
                Admin Portal
              </div>
            </Link>
          )}

          {(employee.role === "regional_director" || employee.role === "program_director") && (
            <Link
              href="/admin/review"
              className="rounded-xl border border-[var(--color-accent)]/40 bg-[var(--color-surface)] p-6 hover:border-[var(--color-accent)] transition-colors"
            >
              <div className="text-lg font-medium text-[var(--color-accent)]">
                Review Submissions
              </div>
              <div className="text-xs text-[var(--color-text-dim)] mt-1">
                {employee.role === "regional_director"
                  ? "Your region's submissions"
                  : "Your program's submissions"}
              </div>
            </Link>
          )}
        </div>

        {visibleApps.length === 0 && employee.role !== "admin" && (
          <p className="text-sm text-[var(--color-text-dim)] mt-4">
            You don't have access to any apps yet. Contact an admin.
          </p>
        )}
      </div>
    </main>
  );
}
