import { redirect } from "next/navigation";
import Link from "next/link";
import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import PortalHeader from "@/app/PortalHeader";
import { getOpenItTicketCountForTechnician } from "@/lib/sharepoint";

function timeGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

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

  const canSeeAdminPortal =
    employee.role === "admin" ||
    employee.role === "regional_director" ||
    employee.role === "program_director" ||
    allowedSlugs.some((s) => s.startsWith("helpdesk-")) ||
    allowedSlugs.includes("in-kind-donation");

  const showClientIntake = visibleApps.length > 0 || employee.role === "admin";

  return (
    <main style={{ minHeight: "100vh", background: "var(--portal-sand)" }}>
      <PortalHeader />

      <div className="max-w-4xl mx-auto px-4 sm:px-10 py-8 sm:py-10">
        {/* ---------- HERO ---------- */}
        <div
          className="relative overflow-hidden rounded-3xl px-6 py-8 sm:px-10 sm:py-10 mb-10"
          style={{ background: "var(--portal-emerald)", color: "var(--portal-sand)" }}
        >
          <div
            aria-hidden
            className="absolute inset-0 pointer-events-none"
            style={{
              background:
                "radial-gradient(ellipse 480px 320px at 88% -10%, rgba(251,247,239,0.14), transparent 70%)",
            }}
          />
          <div className="relative flex flex-wrap items-end justify-between gap-6">
            <div>
              <div
                className="text-xs mb-3"
                style={{
                  fontFamily: "'IBM Plex Mono', monospace",
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                  color: "var(--portal-gold-soft)",
                }}
              >
                {now.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}
              </div>
              <h1
                style={{
                  fontFamily: "'Fraunces', serif",
                  fontStyle: "italic",
                  fontWeight: 500,
                  fontSize: "clamp(28px, 5vw, 42px)",
                  lineHeight: 1.08,
                  letterSpacing: "-0.01em",
                  margin: "0 0 10px",
                }}
              >
                {timeGreeting()},<br />
                <span style={{ fontStyle: "normal", fontWeight: 600, color: "var(--portal-gold-soft)" }}>
                  {employee.first_name}.
                </span>
              </h1>
              <p className="text-sm max-w-md" style={{ color: "rgba(251,247,239,0.78)" }}>
                Here&apos;s what&apos;s on your plate today.
              </p>
            </div>

            <div
              className="flex rounded-2xl overflow-hidden"
              style={{ background: "rgba(251,247,239,0.08)", border: "1px solid rgba(251,247,239,0.18)" }}
            >
              <HeroStat value={openTicketsCount ?? 0} label="Open Tickets" />
              <HeroStat value={pendingApprovalsCount ?? 0} label="Awaiting Your Approval" gold />
              <Suspense fallback={<HeroStatSkeleton label="Help Desk (IT)" />}>
                <ItTicketHeroStat fullName={`${employee.first_name} ${employee.last_name}`} />
              </Suspense>
            </div>
          </div>
        </div>

        {/* ---------- QUICK ACTIONS ---------- */}
        <SectionHead title="Quick Actions" note="The things you reach for most" />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-10">
          {showClientIntake && (
            <QuickCard
              href="/intake"
              title="Client Intake"
              desc="Search existing clients or register a new one"
              tint="#EAF3EF"
              iconColor="var(--portal-emerald)"
              icon={
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="8" r="4" />
                  <path d="M4 21c0-4 3.5-7 8-7s8 3 8 7" />
                </svg>
              }
            />
          )}
          <QuickCard
            href="/directory"
            title="Employee Directory"
            desc="Find anyone by name, office, or title — live from AD"
            tint="#FBF0DC"
            iconColor="#A57420"
            icon={
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M4 19V6a2 2 0 012-2h9l5 5v10a2 2 0 01-2 2H6a2 2 0 01-2-2z" />
                <path d="M8 10h6M8 14h8" />
              </svg>
            }
          />
          <QuickCard
            href="/office-apps"
            title="Office & Apps"
            desc="Use Microsoft 365 online, or grab the desktop apps"
            tint="#E9F1F4"
            iconColor="var(--portal-sky)"
            icon={
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="4" width="18" height="14" rx="2" />
                <path d="M3 9h18" />
              </svg>
            }
          />
        </div>

        {/* ---------- YOUR PROGRAMS ---------- */}
        {(visibleApps.length > 0 || employee.role === "admin") && (
          <>
            <SectionHead title="Your Programs" note="Based on your access" />
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mb-10">
              {visibleApps.map((app) => (
                <Link
                  key={app.slug}
                  href={app.route}
                  className="rounded-xl bg-white p-4 transition-all hover:-translate-y-0.5"
                  style={{ border: "1px solid var(--portal-line)", boxShadow: "0 1px 2px rgba(22,48,43,0.04)" }}
                >
                  <div className="flex items-center gap-2 text-sm font-bold mb-0.5">
                    <span
                      className="inline-block w-1.5 h-1.5 rounded-full"
                      style={{ background: "var(--portal-emerald)" }}
                    />
                    {app.display_name}
                  </div>
                  {programStats[app.slug] && (
                    <div
                      className="text-[11px]"
                      style={{ color: "rgba(22,48,43,0.5)", fontFamily: "'IBM Plex Mono', monospace" }}
                    >
                      {programStats[app.slug]}
                    </div>
                  )}
                </Link>
              ))}
            </div>
          </>
        )}

        {visibleApps.length === 0 && employee.role !== "admin" && (
          <p className="text-sm text-[var(--color-text-dim)] mb-10">
            You don&apos;t have access to any apps yet. Contact an admin.
          </p>
        )}

        {/* ---------- ADMIN PORTAL STRIP ---------- */}
        {canSeeAdminPortal && (
          <Link
            href="/admin"
            className="relative flex items-center justify-between overflow-hidden rounded-2xl px-6 py-5 transition-transform hover:-translate-y-0.5"
            style={{ background: "var(--portal-ink)", color: "var(--portal-sand)" }}
          >
            <div
              aria-hidden
              className="absolute inset-0 pointer-events-none"
              style={{ background: "linear-gradient(120deg, rgba(201,154,61,0.10), transparent 55%)" }}
            />
            <div className="relative flex items-center gap-4">
              <div
                className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
                style={{ background: "rgba(201,154,61,0.18)", color: "var(--portal-gold)" }}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="19" height="19">
                  <rect x="3" y="4" width="18" height="16" rx="2" />
                  <path d="M3 9h18M8 4v5M16 4v5" />
                </svg>
              </div>
              <div>
                <h3 className="text-sm font-bold m-0">Admin Portal</h3>
                <p className="text-xs m-0" style={{ color: "rgba(251,247,239,0.55)" }}>
                  Manage tickets, finance approvals, workboards, and more
                </p>
              </div>
            </div>
            <div
              className="relative text-xs flex items-center gap-1.5 px-4 py-2 rounded-lg"
              style={{
                fontFamily: "'IBM Plex Mono', monospace",
                color: "var(--portal-gold)",
                border: "1px solid rgba(201,154,61,0.4)",
              }}
            >
              Enter
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" width="11" height="11">
                <path d="M5 12h14M13 6l6 6-6 6" />
              </svg>
            </div>
          </Link>
        )}
      </div>
    </main>
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

function HeroStat({
  value,
  label,
  gold,
  last,
}: {
  value: number | string;
  label: string;
  gold?: boolean;
  last?: boolean;
}) {
  return (
    <div
      className="px-5 py-4 min-w-[100px]"
      style={{ borderRight: last ? "none" : "1px solid rgba(251,247,239,0.16)" }}
    >
      <div
        style={{
          fontFamily: "'IBM Plex Mono', monospace",
          fontSize: 24,
          fontWeight: 500,
          color: gold ? "var(--portal-gold-soft)" : "var(--portal-sand)",
        }}
      >
        {value}
      </div>
      <div className="text-[11px]" style={{ color: "rgba(251,247,239,0.65)" }}>
        {label}
      </div>
    </div>
  );
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

function SectionHead({ title, note }: { title: string; note: string }) {
  return (
    <div className="flex items-baseline justify-between mb-4">
      <div
        className="text-xs font-medium"
        style={{
          fontFamily: "'IBM Plex Mono', monospace",
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          color: "var(--portal-emerald)",
        }}
      >
        {title}
      </div>
      <div className="text-xs" style={{ color: "rgba(22,48,43,0.5)" }}>
        {note}
      </div>
    </div>
  );
}

function QuickCard({
  href,
  title,
  desc,
  icon,
  tint,
  iconColor,
}: {
  href: string;
  title: string;
  desc: string;
  icon: React.ReactNode;
  tint: string;
  iconColor: string;
}) {
  return (
    <Link
      href={href}
      className="relative block rounded-2xl bg-white p-6 transition-all hover:-translate-y-0.5"
      style={{
        border: "1px solid var(--portal-line)",
        boxShadow: "0 1px 2px rgba(22,48,43,0.04), 0 8px 24px -8px rgba(22,48,43,0.10)",
      }}
    >
      <div
        className="w-[42px] h-[42px] rounded-xl flex items-center justify-center mb-4"
        style={{ background: tint, color: iconColor }}
      >
        <span style={{ width: 21, height: 21, display: "block" }}>{icon}</span>
      </div>
      <h3 className="text-[15.5px] font-bold m-0 mb-1" style={{ letterSpacing: "-0.01em" }}>
        {title}
      </h3>
      <p className="text-xs m-0 leading-relaxed" style={{ color: "rgba(22,48,43,0.55)" }}>
        {desc}
      </p>
    </Link>
  );
}
