import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  DEPARTMENT_LABELS,
  LEG_STATUS_LABELS,
  getManagedDepartments,
  getWeeklyItLeaderboard,
  formatTicketAge,
  isOverdue,
  type Department,
  type LegStatus,
} from "@/lib/helpdesk";

const DIFFICULTY_BY_PRIORITY: Record<string, { label: string; cls: string }> = {
  low: { label: "EASY", cls: "easy" },
  normal: { label: "EASY", cls: "easy" },
  high: { label: "HARD", cls: "hard" },
  urgent: { label: "EPIC", cls: "epic" },
};

function initials(first: string, last: string) {
  return `${first[0] ?? ""}${last[0] ?? ""}`.toUpperCase();
}

// Two genuinely separate systems living behind one shared data-fetching
// component, not two skins on the same content:
//
// mode "submit" (/helpdesk) — open a ticket, check your own requests.
// Identical for absolutely everyone: regular employees, department
// managers, IT staff, admins. Always plain style — the quest theme
// never appears here, on purpose, so opening a ticket is never gated
// behind "which theme am I about to see."
//
// mode "manage" (/admin/helpdesk/manage) — a department's queue. Quest-themed
// automatically if IT is one of the departments being managed (matches
// the rest of the portal's convention that quest styling is IT-specific),
// otherwise plain. Nothing here is reachable unless the employee actually
// manages at least one department.
export async function HelpdeskView({
  mode,
  dept,
  status,
}: {
  mode: "submit" | "manage";
  dept?: string;
  status?: string;
}) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/");

  const { data: me } = await supabase
    .from("employees")
    .select("id, first_name, last_name, role, email")
    .eq("auth_user_id", user.id)
    .single();
  if (!me) redirect("/select-app");

  const managedDepartments = await getManagedDepartments(supabase, me.id, me.role);

  if (mode === "manage" && managedDepartments.length === 0) {
    // Nothing to manage — this employee only has the submit-a-ticket
    // system available to them.
    redirect("/helpdesk");
  }

  const isQuestThemed = mode === "manage" && managedDepartments.includes("it");

  // ============================================================
  // SUBMIT MODE — everyone, always plain, no department queue
  // ============================================================
  if (mode === "submit") {
    const { data: myRequests } = await supabase
      .from("helpdesk_requests")
      .select("id, ticket_number, title, overall_status, created_at")
      .eq("submitted_by_email", me.email)
      .order("created_at", { ascending: false })
      .limit(20);

    const { data: pendingApprovalSteps } = await supabase
      .from("finance_approval_steps")
      .select("id, approval_token, chain_person_job_title, finance_approval_request_id")
      .eq("status", "pending")
      .ilike("approver_email", me.email);

    const farIds = [...new Set((pendingApprovalSteps ?? []).map((s) => s.finance_approval_request_id))];
    const { data: pendingFars } = await supabase
      .from("finance_approval_requests")
      .select("id, amount, request_id")
      .in("id", farIds.length ? farIds : ["00000000-0000-0000-0000-000000000000"]);
    const farMap = new Map((pendingFars ?? []).map((f) => [f.id, f]));

    const pendingRequestIds = [...new Set((pendingFars ?? []).map((f) => f.request_id))];
    const { data: pendingTickets } = await supabase
      .from("helpdesk_requests")
      .select("id, title")
      .in("id", pendingRequestIds.length ? pendingRequestIds : ["00000000-0000-0000-0000-000000000000"]);
    const ticketMap = new Map((pendingTickets ?? []).map((t) => [t.id, t]));

    const pendingApprovals = (pendingApprovalSteps ?? [])
      .map((s) => {
        const far = farMap.get(s.finance_approval_request_id);
        const ticket = far ? ticketMap.get(far.request_id) : null;
        return far && ticket
          ? { ...s, amount: far.amount, ticketTitle: ticket.title }
          : null;
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);

    return (
      <main className="min-h-screen px-4 py-12">
        <div className="max-w-3xl mx-auto">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-xl font-semibold">Help Desk</h1>
              <p className="text-sm text-[var(--color-text-dim)]">
                Submit a request, or check on one you've already sent in
              </p>
            </div>
            <div className="flex items-center gap-4">
              {managedDepartments.length > 0 && (
                <Link
                  href="/admin/helpdesk/manage"
                  className="text-sm text-[var(--color-accent)] hover:underline"
                >
                  Manage Tickets →
                </Link>
              )}
              <Link
                href="/select-app"
                className="text-sm text-[var(--color-text-dim)] hover:text-[var(--color-text)]"
              >
                ← Back
              </Link>
            </div>
          </div>

          <Link
            href="/helpdesk/wizard"
            className="block text-center rounded-lg bg-[var(--color-accent)] text-white text-sm font-medium py-3 mb-8"
          >
            + Submit a Request
          </Link>

          {pendingApprovals.length > 0 && (
            <>
              <h2 className="text-sm font-semibold mb-3 text-[var(--color-text-dim)] uppercase tracking-wide">
                Pending Your Approval
              </h2>
              <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] overflow-hidden mb-8">
                {pendingApprovals.map((a) => (
                  <Link
                    key={a.id}
                    href={`/finance-approvals/${a.approval_token}`}
                    className="flex items-center justify-between px-5 py-3.5 border-b border-[var(--color-border)] last:border-b-0 hover:bg-black/5 transition-colors"
                  >
                    <span className="text-sm font-medium truncate">{a.ticketTitle}</span>
                    <span className="text-xs px-2 py-0.5 rounded-full whitespace-nowrap bg-amber-100 text-amber-700">
                      ${a.amount}
                    </span>
                  </Link>
                ))}
              </div>
            </>
          )}

          <h2 className="text-sm font-semibold mb-3 text-[var(--color-text-dim)] uppercase tracking-wide">
            My Requests
          </h2>
          <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] overflow-hidden">
            {(myRequests ?? []).length === 0 ? (
              <p className="p-5 text-sm text-[var(--color-text-dim)]">
                You haven't submitted any requests.
              </p>
            ) : (
              (myRequests ?? []).map((r) => (
                <Link
                  key={r.id}
                  href={`/helpdesk/${r.id}`}
                  className="flex items-center justify-between px-5 py-3.5 border-b border-[var(--color-border)] last:border-b-0 hover:bg-black/5 transition-colors"
                >
                  <span className="min-w-0">
                    <span className="block text-sm font-medium truncate">{r.title}</span>
                    <span className="block text-xs text-[var(--color-text-dim)] font-mono">{r.ticket_number}</span>
                  </span>
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full whitespace-nowrap ${
                      r.overall_status === "closed"
                        ? "bg-black/5 text-[var(--color-text-dim)]"
                        : "bg-[var(--color-accent)]/10 text-[var(--color-accent)]"
                    }`}
                  >
                    {r.overall_status === "closed" ? "Closed" : "Open"}
                  </span>
                </Link>
              ))
            )}
          </div>
        </div>
      </main>
    );
  }

  // ============================================================
  // MANAGE MODE — department queue(s), quest-themed if IT is one of them
  // ============================================================
  const activeDept: Department | null =
    dept && managedDepartments.includes(dept as Department)
      ? (dept as Department)
      : managedDepartments[0] ?? null;

  let legs: any[] = [];
  let legsError: string | null = null;
  const statusFilter: "open" | "closed" = status === "closed" ? "closed" : "open";
  const statusesForFilter =
    statusFilter === "closed" ? ["closed", "handed_off"] : ["open", "in_progress", "on_hold", "quality_assurance"];

  if (activeDept) {
    const { data, error } = await supabase
      .from("helpdesk_request_legs")
      .select(
        "id, department, status, priority, category, created_at, closed_at, request_id, assigned_to_employee_id, assigned_to_raw_name, handed_off_from_leg_id"
      )
      .eq("department", activeDept)
      .in("status", statusesForFilter)
      .order("created_at", { ascending: false })
      .limit(100);
    legs = data ?? [];
    // Surface a real query failure (e.g. an enum value referenced
    // before its migration has run) instead of silently rendering an
    // empty queue that looks identical to "nothing's open right now."
    legsError = error?.message ?? null;
  }

  // Overdue (open >48h) tickets bubble to the top regardless of
  // department queue order. Array.sort is stable in modern JS
  // engines, so this preserves the existing created_at-desc order
  // within each bucket rather than shuffling everything.
  legs.sort((a, b) => {
    const aOverdue = isOverdue(a.created_at, a.status as LegStatus) ? 1 : 0;
    const bOverdue = isOverdue(b.created_at, b.status as LegStatus) ? 1 : 0;
    return bOverdue - aOverdue;
  });

  const requestIds = [...new Set(legs.map((l) => l.request_id))];
  const { data: requests } = await supabase
    .from("helpdesk_requests")
    .select("id, title, submitted_by, submitted_by_email")
    .in("id", requestIds.length ? requestIds : ["00000000-0000-0000-0000-000000000000"]);
  const requestMap = new Map((requests ?? []).map((r) => [r.id, r]));

  const assigneeIds = [
    ...new Set(legs.map((l) => l.assigned_to_employee_id).filter(Boolean)),
  ] as string[];
  const { data: assignees } = await supabase
    .from("employees")
    .select("id, first_name, last_name")
    .in("id", assigneeIds.length ? assigneeIds : ["00000000-0000-0000-0000-000000000000"]);
  const assigneeMap = new Map((assignees ?? []).map((a) => [a.id, a]));

  // Only IT is scored — leaderboard only fetched/shown on the IT tab.
  let leaderboard: { employeeId: string; points: number }[] = [];
  let leaderboardEmployeeMap = new Map<string, { first_name: string; last_name: string }>();
  if (isQuestThemed && activeDept === "it") {
    leaderboard = await getWeeklyItLeaderboard(supabase);
    const lbIds = leaderboard.map((l) => l.employeeId);
    const { data: lbEmployees } = await supabase
      .from("employees")
      .select("id, first_name, last_name")
      .in("id", lbIds.length ? lbIds : ["00000000-0000-0000-0000-000000000000"]);
    leaderboardEmployeeMap = new Map((lbEmployees ?? []).map((e) => [e.id, e]));
  }
  const topScore = leaderboard[0]?.points ?? 1;

  if (isQuestThemed) {
    return (
      <main
        style={{
          minHeight: "100vh",
          background: "radial-gradient(ellipse at top, #2A1858 0%, #150B2E 60%)",
          color: "#EDE6FF",
          fontFamily: "'DM Sans', sans-serif",
          padding: "28px 16px 60px",
        }}
      >
        <style>{`
          @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@600;700&family=DM+Sans:wght@400;500;700;800&display=swap');
          a.qbtn:hover{ border-color:#FF3EA5 !important; }
        `}</style>
        <div style={{ maxWidth: 960, margin: "0 auto" }}>
          <div style={{ maxWidth: 640, margin: "0 auto" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <Link href="/select-app" style={{ fontSize: 12, color: "#9C8FD9" }}>
              ← Back
            </Link>
            <Link href="/admin/workboards" style={{ fontSize: 12, color: "#00E5FF", fontWeight: 700 }}>
              📋 Workboards
            </Link>
          </div>
          {activeDept === "it" && (
            <p style={{ fontSize: 11, color: "#9C8FD9", textAlign: "right", marginBottom: 8 }}>
              Live leaderboard, resets Mondays
            </p>
          )}

          <div style={{ textAlign: "center", margin: "16px 0 24px" }}>
            <div
              style={{
                fontFamily: "'Space Grotesk', sans-serif",
                fontWeight: 700,
                fontSize: 30,
                backgroundImage: "linear-gradient(90deg,#FF3EA5,#00E5FF)",
                WebkitBackgroundClip: "text",
                backgroundClip: "text",
                color: "transparent",
              }}
            >
              HELP DESK
            </div>
            <div style={{ fontSize: 12, color: "#9C8FD9", marginTop: 6 }}>
              Welcome back, {me.first_name}
            </div>
          </div>

          <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
            {managedDepartments.map((d) => {
              const isIt = d === "it";
              const isActive = activeDept === d;
              return (
                <Link
                  key={d}
                  href={`/admin/helpdesk/manage?dept=${d}&status=${statusFilter}`}
                  className="qbtn"
                  style={{
                    padding: "8px 16px",
                    borderRadius: 20,
                    fontSize: 12,
                    fontWeight: 700,
                    textDecoration: "none",
                    border: isActive ? "1.5px solid transparent" : "1.5px solid #4A3B7A",
                    color: isActive ? "#fff" : "#B5A8E8",
                    background: isActive ? "linear-gradient(90deg,#FF3EA5,#7B3EFF)" : "transparent",
                    boxShadow: isActive ? "0 0 16px rgba(255,62,165,0.4)" : "none",
                  }}
                >
                  {isIt ? "⚔️ " : d === "marketing" ? "🎨 " : d === "hr" ? "🧑‍💼 " : "💰 "}
                  {DEPARTMENT_LABELS[d]} Guild
                </Link>
              );
            })}
          </div>

          <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
            {(["open", "closed"] as const).map((s) => (
              <Link
                key={s}
                href={`/admin/helpdesk/manage?dept=${activeDept}&status=${s}`}
                style={{
                  padding: "5px 14px",
                  borderRadius: 20,
                  fontSize: 11,
                  fontWeight: 700,
                  textDecoration: "none",
                  border: statusFilter === s ? "1.5px solid transparent" : "1.5px solid #4A3B7A",
                  color: statusFilter === s ? "#150B2E" : "#B5A8E8",
                  background: statusFilter === s ? "#EDE6FF" : "transparent",
                }}
              >
                {s === "open" ? "Open" : "Closed"}
              </Link>
            ))}
          </div>

          {activeDept === "it" && statusFilter === "open" && (
            <div
              style={{
                background: "rgba(255,255,255,0.04)",
                border: "1px solid #3A2C68",
                borderRadius: 14,
                padding: 16,
                marginBottom: 20,
              }}
            >
              <div style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em", color: "#9C8FD9", marginBottom: 12 }}>
                ⚡ This Week's Leaderboard
              </div>
              {leaderboard.length === 0 ? (
                <p style={{ fontSize: 12, color: "#9C8FD9" }}>
                  No points scored yet this week — close a ticket to get on the board.
                </p>
              ) : (
                leaderboard.map((entry, i) => {
                  const emp = leaderboardEmployeeMap.get(entry.employeeId);
                  const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `#${i + 1}`;
                  return (
                    <div key={entry.employeeId} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                      <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700, fontSize: 13, color: "#FFD700", width: 24 }}>
                        {medal}
                      </div>
                      <div
                        style={{
                          width: 30,
                          height: 30,
                          borderRadius: 8,
                          background: "linear-gradient(135deg,#FF3EA5,#7B3EFF)",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontSize: 11,
                          fontWeight: 800,
                          flexShrink: 0,
                        }}
                      >
                        {emp ? initials(emp.first_name, emp.last_name) : "?"}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12.5, fontWeight: 700 }}>
                          {emp ? `${emp.first_name} ${emp.last_name}` : "Unknown"}
                        </div>
                        <div style={{ height: 6, background: "#3A2C68", borderRadius: 4, marginTop: 4, overflow: "hidden" }}>
                          <div
                            style={{
                              height: "100%",
                              width: `${Math.max(6, (entry.points / topScore) * 100)}%`,
                              background: "linear-gradient(90deg,#00E5FF,#7B3EFF)",
                              borderRadius: 4,
                            }}
                          />
                        </div>
                      </div>
                      <div style={{ fontSize: 11, color: "#9C8FD9", fontWeight: 700 }}>{entry.points} pts</div>
                    </div>
                  );
                })
              )}
            </div>
          )}
          </div>

          <div style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em", color: "#9C8FD9", marginBottom: 10 }}>
            {statusFilter === "open" ? "Open Quests" : "Completed Quests"}
          </div>

          {legs.length === 0 && (
            <p style={{ fontSize: 12, color: "#9C8FD9" }}>
              {legsError ? (
                <span style={{ color: "#FF6B6B" }}>⚠ Couldn't load tickets: {legsError}</span>
              ) : (
                "Nothing here right now. 🎉"
              )}
            </p>
          )}

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
              gap: 12,
            }}
          >
            {legs.map((leg) => {
              const req = requestMap.get(leg.request_id);
              const diff = DIFFICULTY_BY_PRIORITY[leg.priority] ?? DIFFICULTY_BY_PRIORITY.normal;
              const assignee = leg.assigned_to_employee_id ? assigneeMap.get(leg.assigned_to_employee_id) : null;
              const assigneeLabel = assignee
                ? `${assignee.first_name} ${assignee.last_name}`
                : leg.assigned_to_raw_name
                  ? `${leg.assigned_to_raw_name} (legacy)`
                  : "Unclaimed";
              const overdue = isOverdue(leg.created_at, leg.status as LegStatus);

              return (
                <Link
                  key={leg.id}
                  href={`/helpdesk/${leg.request_id}`}
                  style={{
                    display: "block",
                    background: "rgba(255,255,255,0.05)",
                    border: `1px solid ${overdue ? "#FF3E3E" : "#3A2C68"}`,
                    borderRadius: 14,
                    padding: 12,
                    position: "relative",
                    textDecoration: "none",
                    color: "inherit",
                    boxShadow: overdue ? "0 0 14px rgba(255,62,62,0.25)" : "none",
                  }}
                >
                  <div style={{ display: "flex", gap: 4, position: "absolute", top: 0, right: 0 }}>
                    {overdue && (
                      <span
                        style={{
                          fontSize: 9,
                          fontWeight: 800,
                          padding: "4px 8px",
                          background: "#FF3E3E",
                          color: "#fff",
                          borderBottomLeftRadius: diff ? 0 : 10,
                        }}
                      >
                        ⚠ OVERDUE
                      </span>
                    )}
                    <span
                      style={{
                        fontSize: 9,
                        fontWeight: 800,
                        padding: "4px 8px",
                        borderBottomLeftRadius: overdue ? 0 : 10,
                        background: diff.cls === "epic" ? "#4D3A1E" : diff.cls === "hard" ? "#4D1E2A" : "#1E4D3A",
                        color: diff.cls === "epic" ? "#FFD700" : diff.cls === "hard" ? "#FF6B9C" : "#5FFFAE",
                      }}
                    >
                      {diff.label}
                    </span>
                  </div>
                  <div style={{ fontWeight: 700, fontSize: 13, marginTop: 14, marginBottom: 6, lineHeight: 1.3 }}>
                    {req?.title ?? "Untitled request"}
                  </div>
                  <div style={{ fontSize: 10.5, color: "#9C8FD9", marginBottom: 2 }}>
                    {req?.submitted_by}
                  </div>
                  <div style={{ fontSize: 10.5, color: "#9C8FD9", marginBottom: 4 }}>
                    {assigneeLabel}
                    {leg.handed_off_from_leg_id && <span style={{ color: "#00E5FF" }}> · ↳</span>}
                  </div>
                  <div style={{ fontSize: 10, color: overdue ? "#FF6B6B" : "#7A6FAE", fontWeight: overdue ? 700 : 400 }}>
                    ⏱ {formatTicketAge(leg.created_at)}
                  </div>
                  {leg.department === "it" && statusFilter === "open" && (
                    <span
                      style={{
                        display: "inline-block",
                        marginTop: 8,
                        fontSize: 9,
                        fontWeight: 800,
                        color: "#FFD700",
                        background: "rgba(255,215,0,0.1)",
                        padding: "2px 7px",
                        borderRadius: 20,
                      }}
                    >
                      +pts
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
        </div>
      </main>
    );
  }

  // ============================================================
  // MANAGE MODE, plain — HR/Marketing/Finance managers
  // ============================================================
  return (
    <main className="min-h-screen px-4 py-12">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-semibold">Help Desk — Manage</h1>
            <p className="text-sm text-[var(--color-text-dim)]">
              Your department's ticket queue
            </p>
          </div>
          <Link
            href="/select-app"
            className="text-sm text-[var(--color-text-dim)] hover:text-[var(--color-text)]"
          >
            ← Back
          </Link>
        </div>

        <div className="flex gap-2 mb-4 flex-wrap">
          {managedDepartments.map((d) => (
            <Link
              key={d}
              href={`/admin/helpdesk/manage?dept=${d}&status=${statusFilter}`}
              className={`px-3 py-1.5 rounded-lg text-sm border ${
                activeDept === d
                  ? "bg-[var(--color-accent)] text-white border-[var(--color-accent)]"
                  : "border-[var(--color-border)] text-[var(--color-text-dim)] hover:border-[var(--color-accent)]"
              }`}
            >
              {DEPARTMENT_LABELS[d]}
            </Link>
          ))}
        </div>

        <div className="flex gap-2 mb-6">
          {(["open", "closed"] as const).map((s) => (
            <Link
              key={s}
              href={`/admin/helpdesk/manage?dept=${activeDept}&status=${s}`}
              className={`px-3 py-1 rounded-full text-xs font-medium border ${
                statusFilter === s
                  ? "bg-[var(--color-text)] text-[var(--color-surface)] border-[var(--color-text)]"
                  : "border-[var(--color-border)] text-[var(--color-text-dim)] hover:border-[var(--color-text)]"
              }`}
            >
              {s === "open" ? "Open" : "Closed"}
            </Link>
          ))}
        </div>

        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] overflow-hidden">
          {legs.length === 0 ? (
            <p className="p-6 text-sm text-[var(--color-text-dim)]">
              {legsError ? (
                <span className="text-red-600">⚠ Couldn't load tickets: {legsError}</span>
              ) : (
                `No ${statusFilter} tickets in this queue.`
              )}
            </p>
          ) : (
            legs.map((leg) => {
              const req = requestMap.get(leg.request_id);
              const assignee = leg.assigned_to_employee_id
                ? assigneeMap.get(leg.assigned_to_employee_id)
                : null;
              const overdue = isOverdue(leg.created_at, leg.status as LegStatus);
              return (
                <Link
                  key={leg.id}
                  href={`/helpdesk/${leg.request_id}`}
                  className={`block px-5 py-4 border-b border-[var(--color-border)] last:border-b-0 hover:bg-black/5 transition-colors ${
                    overdue ? "bg-red-50/50" : ""
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-[10px] font-bold uppercase tracking-wide text-[var(--color-accent)]">
                          {DEPARTMENT_LABELS[leg.department as Department]}
                        </span>
                        {overdue && (
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-red-600 text-white">
                            ⚠ OVERDUE
                          </span>
                        )}
                        {leg.handed_off_from_leg_id && (
                          <span className="text-[10px] text-[var(--color-text-dim)]">
                            (handed off)
                          </span>
                        )}
                      </div>
                      <div className="text-sm font-medium truncate">
                        {req?.title ?? "Untitled request"}
                      </div>
                      <div className="text-xs text-[var(--color-text-dim)]">
                        {req?.submitted_by} ·{" "}
                        {assignee
                          ? `${assignee.first_name} ${assignee.last_name}`
                          : leg.assigned_to_raw_name
                            ? `${leg.assigned_to_raw_name} (legacy)`
                            : "Unassigned"}
                        {" · "}
                        {formatTicketAge(leg.created_at)}
                      </div>
                    </div>
                    <span className="text-xs whitespace-nowrap px-2 py-1 rounded-full bg-[var(--color-accent)]/10 text-[var(--color-accent)]">
                      {LEG_STATUS_LABELS[leg.status as keyof typeof LEG_STATUS_LABELS]}
                    </span>
                  </div>
                </Link>
              );
            })
          )}
        </div>
      </div>
    </main>
  );
}
