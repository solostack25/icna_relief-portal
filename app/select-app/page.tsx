import { redirect } from "next/navigation";
import Link from "next/link";
import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import DayAtAGlance from "./DayAtAGlance";
import ItTicketCountCard, { ItTicketCountSkeleton } from "./ItTicketCountCard";
import LogoutButton from "./LogoutButton";

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

  const visibleApps = (apps ?? []).filter(
    (a) =>
      !a.slug.startsWith("helpdesk-") && // department manage-access flags, not real apps
      (employee.role === "admin" ? true : allowedSlugs.includes(a.slug))
  );

  // 4. Day at a Glance stats — this employee's activity this month,
  //    only for programs they actually have access to
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const hasProgram = (slug: string) =>
    employee.role === "admin" || allowedSlugs.includes(slug);

  const glanceCards: { label: string; value: number | string; connected: boolean }[] = [];

  if (hasProgram("back-to-school")) {
    const { data: b2s } = await supabase
      .from("b2s_submissions")
      .select("elementary_backpacks, middle_backpacks, high_backpacks")
      .eq("employee_id", employee.id)
      .eq("year", year)
      .eq("month", month);
    const backpacks = (b2s ?? []).reduce(
      (sum, r) => sum + (r.elementary_backpacks ?? 0) + (r.middle_backpacks ?? 0) + (r.high_backpacks ?? 0),
      0
    );
    glanceCards.push({ label: "Backpacks Distributed (This Month)", value: backpacks, connected: true });
  }

  if (hasProgram("fate")) {
    const { count } = await supabase
      .from("fate_submissions")
      .select("id", { count: "exact", head: true })
      .eq("employee_id", employee.id)
      .eq("year", year)
      .eq("month", month);
    glanceCards.push({ label: "F.A.T.E. Submissions (This Month)", value: count ?? 0, connected: true });
  }

  if (hasProgram("drs")) {
    const { count } = await supabase
      .from("drs_submissions")
      .select("id", { count: "exact", head: true })
      .eq("employee_id", employee.id)
      .eq("year", year)
      .eq("month", month)
      .eq("activity_occurred", true);
    glanceCards.push({ label: "D.R.S. Activity Logged (This Month)", value: count ?? 0, connected: true });
  }

  glanceCards.push({ label: "Pending Approvals", value: "—", connected: false });

  return (
    <main className="min-h-screen px-4 py-12">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <img src="/icna-relief-logo.png" alt="ICNA Relief" className="h-8" />
          <LogoutButton />
        </div>
        <h1 className="text-xl font-semibold mb-1">
          Welcome, {employee.first_name}
        </h1>
        <p className="text-sm text-[var(--color-text-dim)] mb-6">
          Choose an app to continue
        </p>

        <DayAtAGlance
          cards={glanceCards}
          extra={
            <Suspense fallback={<ItTicketCountSkeleton />}>
              <ItTicketCountCard fullName={`${employee.first_name} ${employee.last_name}`} />
            </Suspense>
          }
        />

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

          <Link
            href="/workboards"
            className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 hover:border-[var(--color-accent)] transition-colors"
          >
            <div className="text-lg font-medium">📋 Workboards</div>
            <div className="text-xs text-[var(--color-text-dim)] mt-1">
              Your private task board, or the IT team board
            </div>
          </Link>

          {(employee.role === "admin" || allowedSlugs.some((s) => s.startsWith("helpdesk-"))) && (
            <Link
              href="/helpdesk/manage"
              className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 hover:border-[var(--color-accent)] transition-colors"
            >
              <div className="text-lg font-medium">🎫 Manage Tickets</div>
              <div className="text-xs text-[var(--color-text-dim)] mt-1">
                Your department's help desk queue
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
