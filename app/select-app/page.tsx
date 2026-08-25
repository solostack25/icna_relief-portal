import { redirect } from "next/navigation";
import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { getOpenItTicketCountForTechnician } from "@/lib/sharepoint";
import { getCoursesWithStatus } from "@/lib/lms";
import SelectAppView, { HeroStat } from "./SelectAppView";

export default async function SelectAppPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/");

  const { data: employee } = await supabase
    .from("employees")
    .select("id, first_name, last_name, role, email")
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

  const { data: openClockEntry } = await supabase
    .from("time_clock_entries")
    .select("id, clock_in_at")
    .eq("employee_id", employee.id)
    .is("clock_out_at", null)
    .order("clock_in_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: access } = await supabase
    .from("employee_program_access")
    .select("program_slug")
    .eq("employee_id", employee.id);
  const allowedSlugs = (access ?? []).map((a) => a.program_slug);
  const hasProgram = (slug: string) => employee.role === "admin" || allowedSlugs.includes(slug);

  const { data: apps } = await supabase
    .from("app_registry")
    .select("slug, display_name, route, icon, is_active, sort_order")
    .eq("is_active", true)
    .order("sort_order");

  const visibleApps = (apps ?? []).filter(
    (a) =>
      !a.slug.startsWith("helpdesk-") &&
      (employee.role === "admin" ? true : allowedSlugs.includes(a.slug))
  );

  // Monthly per-program numbers — real, not fabricated, only shown for
  // the programs that actually have this data computed (FATE/DRS/B2S).
  // Everything else in "Your Programs" shows without a subtitle rather
  // than a made-up count.
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const programStats: Record<string, string> = {};

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
    programStats["back-to-school"] = `${backpacks} backpacks this month`;
  }

  if (hasProgram("fate")) {
    const { count } = await supabase
      .from("fate_submissions")
      .select("id", { count: "exact", head: true })
      .eq("employee_id", employee.id)
      .eq("year", year)
      .eq("month", month);
    programStats["fate"] = `${count ?? 0} submissions this month`;
  }

  if (hasProgram("drs")) {
    const { count } = await supabase
      .from("drs_submissions")
      .select("id", { count: "exact", head: true })
      .eq("employee_id", employee.id)
      .eq("year", year)
      .eq("month", month)
      .eq("activity_occurred", true);
    programStats["drs"] = `${count ?? 0} logged this month`;
  }

  // Real "My Open Tickets" and "Awaiting Your Approval" — no placeholders.
  const { count: openTicketsCount } = await supabase
    .from("helpdesk_requests")
    .select("id", { count: "exact", head: true })
    .eq("submitted_by_email", employee.email)
    .neq("overall_status", "closed");

  const { count: pendingApprovalsCount } = await supabase
    .from("finance_approval_steps")
    .select("id", { count: "exact", head: true })
    .eq("status", "pending")
    .ilike("approver_email", employee.email);

  const courses = await getCoursesWithStatus(supabase, employee.id, employee.role);
  const trainingDueCount = courses.filter(
    (c) => c.required && (c.status === "not_started" || c.status === "due_for_refresher")
  ).length;

  const canSeeAdminPortal =
    employee.role === "admin" ||
    employee.role === "regional_director" ||
    employee.role === "program_director" ||
    allowedSlugs.some((s) => s.startsWith("helpdesk-")) ||
    allowedSlugs.includes("in-kind-donation");

  const showClientIntake = visibleApps.length > 0 || employee.role === "admin";

  const todayLabel = now.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });

  return (
    <SelectAppView
      employeeId={employee.id}
      employeeFirstName={employee.first_name}
      openClockEntry={openClockEntry ?? null}
      openTicketsCount={openTicketsCount ?? 0}
      pendingApprovalsCount={pendingApprovalsCount ?? 0}
      trainingDueCount={trainingDueCount}
      itTicketSlot={
        <Suspense fallback={<HeroStatSkeleton label="Help Desk (IT)" />}>
          <ItTicketHeroStat fullName={`${employee.first_name} ${employee.last_name}`} />
        </Suspense>
      }
      showClientIntake={showClientIntake}
      visibleApps={visibleApps as { slug: string; display_name: string; route: string }[]}
      programStats={programStats}
      canSeeAdminPortal={canSeeAdminPortal}
      employeeIsAdmin={employee.role === "admin"}
      todayLabel={todayLabel}
      hourNow={now.getHours()}
    />
  );
}

async function ItTicketHeroStat({ fullName }: { fullName: string }) {
  try {
    const count = await getOpenItTicketCountForTechnician(fullName);
    return <HeroStat value={count} label="Help Desk (IT)" last />;
  } catch {
    return <HeroStat value="—" label="Help Desk (IT)" last />;
  }
}

function HeroStatSkeleton({ label }: { label: string }) {
  return (
    <div className="px-5 py-4 min-w-[100px] animate-pulse">
      <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 24, color: "rgba(251,247,239,0.4)" }}>…</div>
      <div className="text-[11px]" style={{ color: "rgba(251,247,239,0.5)" }}>
        {label}
      </div>
    </div>
  );
}
