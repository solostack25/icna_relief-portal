import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  DEPARTMENT_LABELS,
  LEG_STATUS_LABELS,
  getManagedDepartments,
  getDepartmentStaff,
  formatTicketAge,
  hoursRemainingInWindow,
  isOverdue,
  type Department,
  type LegStatus,
} from "@/lib/helpdesk";
import LegActions from "./LegActions";
import EmailAction from "./EmailAction";
import MoveToWorkboardAction from "./MoveToWorkboardAction";

export default async function HelpdeskRequestPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
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

  const { data: request } = await supabase
    .from("helpdesk_requests")
    .select("*")
    .eq("id", id)
    .single();
  if (!request) notFound();

  const { data: legs } = await supabase
    .from("helpdesk_request_legs")
    .select("*")
    .eq("request_id", id)
    .order("created_at", { ascending: true });

  const managedDepartments = await getManagedDepartments(supabase, me.id, me.role);
  const isQuestThemed = managedDepartments.includes("it");
  const isSubmitter = request.submitted_by_email === me.email;
  const managesAnyLegDepartment = (legs ?? []).some((l) =>
    managedDepartments.includes(l.department as Department)
  );

  if (!isSubmitter && !managesAnyLegDepartment) redirect("/helpdesk");

  const currentLegDept = [...(legs ?? [])].reverse().find((l) => l.status !== "handed_off")
    ?.department as Department | undefined;
  const departmentStaff =
    currentLegDept && managedDepartments.includes(currentLegDept)
      ? await getDepartmentStaff(supabase, currentLegDept)
      : [];

  const legIds = (legs ?? []).map((l) => l.id);

  const { data: itDetails } = await supabase
    .from("helpdesk_leg_details_it")
    .select("*")
    .in("leg_id", legIds.length ? legIds : ["00000000-0000-0000-0000-000000000000"]);
  const itDetailsMap = new Map((itDetails ?? []).map((d) => [d.leg_id, d]));

  const assigneeIds = [...new Set((legs ?? []).map((l) => l.assigned_to_employee_id).filter(Boolean))] as string[];
  const { data: assignees } = await supabase
    .from("employees")
    .select("id, first_name, last_name")
    .in("id", assigneeIds.length ? assigneeIds : ["00000000-0000-0000-0000-000000000000"]);
  const assigneeMap = new Map((assignees ?? []).map((a) => [a.id, a]));

  const { data: comments } = await supabase
    .from("helpdesk_comments")
    .select("id, body, created_at, author_employee_id")
    .eq("request_id", id)
    .order("created_at", { ascending: true });

  const commentAuthorIds = [...new Set((comments ?? []).map((c) => c.author_employee_id).filter(Boolean))] as string[];
  const { data: commentAuthors } = await supabase
    .from("employees")
    .select("id, first_name, last_name")
    .in("id", commentAuthorIds.length ? commentAuthorIds : ["00000000-0000-0000-0000-000000000000"]);
  const authorMap = new Map((commentAuthors ?? []).map((a) => [a.id, a]));

  const currentLeg = [...(legs ?? [])].reverse().find((l) => l.status !== "handed_off") ?? null;

  // Email-bonus eligibility for the current leg, if it's IT and still
  // active: has an email already been sent (bonus can only be earned
  // once), and is the 5h window still open.
  let alreadyEmailed = false;
  if (currentLeg?.department === "it") {
    const { data: emailLog } = await supabase
      .from("helpdesk_email_log")
      .select("id")
      .eq("leg_id", currentLeg.id)
      .limit(1);
    alreadyEmailed = (emailLog ?? []).length > 0;
  }
  const emailBonusWindow =
    currentLeg && !alreadyEmailed ? hoursRemainingInWindow(currentLeg.created_at, 5) : null;
  const closeBonusWindow = currentLeg ? hoursRemainingInWindow(currentLeg.created_at, 24) : null;
  const currentLegIsActiveIt =
    currentLeg?.department === "it" && currentLeg.status !== "closed" && currentLeg.status !== "handed_off";

  // ============================================================
  // QUEST THEME
  // ============================================================
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
        <style>{`@import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@600;700&family=DM+Sans:wght@400;500;700;800&display=swap');`}</style>
        <div style={{ maxWidth: 600, margin: "0 auto" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <Link href="/helpdesk" style={{ fontSize: 12, color: "#9C8FD9" }}>
              ← Back to Help Desk
            </Link>
            <span
              style={{
                fontSize: 11,
                fontWeight: 800,
                padding: "3px 10px",
                borderRadius: 20,
                background: request.overall_status === "closed" ? "rgba(255,255,255,0.08)" : "rgba(0,229,255,0.15)",
                color: request.overall_status === "closed" ? "#9C8FD9" : "#00E5FF",
              }}
            >
              {request.overall_status === "closed" ? "✓ Complete" : "In Progress"}
            </span>
          </div>

          <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700, fontSize: 20, marginBottom: 6 }}>
            {request.title}
          </div>
          <p style={{ fontSize: 12, color: "#9C8FD9", marginBottom: 20 }}>
            Submitted by {request.submitted_by} ({request.submitted_by_email}) ·{" "}
            {new Date(request.created_at).toLocaleDateString()}
          </p>

          {request.description && (
            <div
              style={{
                background: "rgba(255,255,255,0.04)",
                border: "1px solid #3A2C68",
                borderRadius: 12,
                padding: 14,
                fontSize: 13,
                marginBottom: 16,
                whiteSpace: "pre-wrap",
              }}
            >
              {request.description}
            </div>
          )}

          {currentLeg && (
            <p style={{ fontSize: 11, color: isOverdue(currentLeg.created_at, currentLeg.status as LegStatus) ? "#FF6B6B" : "#9C8FD9", fontWeight: isOverdue(currentLeg.created_at, currentLeg.status as LegStatus) ? 700 : 400, marginBottom: 16 }}>
              {isOverdue(currentLeg.created_at, currentLeg.status as LegStatus) && "⚠ OVERDUE · "}
              ⏱ {formatTicketAge(currentLeg.created_at)}
            </p>
          )}

          {currentLegIsActiveIt && emailBonusWindow && (
            <div
              style={{
                background: "rgba(255,215,0,0.1)",
                border: "1px solid #FFD700",
                borderRadius: 12,
                padding: 12,
                marginBottom: 12,
                fontSize: 12,
                color: "#FFD700",
                fontWeight: 700,
              }}
            >
              📧 Email this employee now for +2 bonus points — expires in {emailBonusWindow.hours}h{" "}
              {emailBonusWindow.minutes}m
            </div>
          )}

          {currentLegIsActiveIt && closeBonusWindow && (
            <div
              style={{
                background: "rgba(0,229,255,0.1)",
                border: "1px solid #00E5FF",
                borderRadius: 12,
                padding: 12,
                marginBottom: 24,
                fontSize: 12,
                color: "#00E5FF",
                fontWeight: 700,
              }}
            >
              🏆 Close this ticket now for +5 bonus points — expires in {closeBonusWindow.hours}h{" "}
              {closeBonusWindow.minutes}m
            </div>
          )}

          <div style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em", color: "#9C8FD9", marginBottom: 10 }}>
            Quest Chain
          </div>
          <div style={{ marginBottom: 24 }}>
            {(legs ?? []).map((leg) => {
              const assignee = leg.assigned_to_employee_id ? assigneeMap.get(leg.assigned_to_employee_id) : null;
              const itDetail = itDetailsMap.get(leg.id);
              const isCurrent = currentLeg?.id === leg.id;
              return (
                <div
                  key={leg.id}
                  style={{
                    background: "rgba(255,255,255,0.05)",
                    border: `1px solid ${isCurrent ? "#FF3EA5" : "#3A2C68"}`,
                    borderRadius: 14,
                    padding: 14,
                    marginBottom: 12,
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                    <span style={{ fontSize: 11, fontWeight: 800, color: "#00E5FF" }}>
                      {leg.department === "it" ? "⚔️ " : leg.department === "marketing" ? "🎨 " : leg.department === "hr" ? "🧑‍💼 " : "💰 "}
                      {DEPARTMENT_LABELS[leg.department as Department]} Guild
                      {leg.handed_off_from_leg_id && <span style={{ color: "#9C8FD9", fontWeight: 500 }}> ← handed off</span>}
                    </span>
                    <span style={{ fontSize: 10, fontWeight: 800, color: "#9C8FD9", background: "rgba(255,255,255,0.06)", padding: "2px 8px", borderRadius: 20 }}>
                      {LEG_STATUS_LABELS[leg.status as LegStatus]}
                    </span>
                  </div>
                  <div style={{ fontSize: 11, color: "#9C8FD9" }}>
                    {leg.category ?? "No category"} · Priority: {leg.priority} ·{" "}
                    {assignee
                      ? `${assignee.first_name} ${assignee.last_name}`
                      : leg.assigned_to_raw_name
                        ? `${leg.assigned_to_raw_name} (legacy)`
                        : "Unclaimed"}
                  </div>
                  {itDetail?.solution && (
                    <div style={{ marginTop: 8, fontSize: 12.5 }}>
                      <span style={{ color: "#9C8FD9" }}>Solution: </span>
                      {itDetail.solution}
                    </div>
                  )}
                  {itDetail?.additional_notes && (
                    <div style={{ marginTop: 8, fontSize: 12.5, whiteSpace: "pre-wrap" }}>{itDetail.additional_notes}</div>
                  )}

                  {leg.department === "it" && leg.status !== "closed" && leg.status !== "handed_off" && (
                    <div style={{ marginTop: 10, display: "flex", flexWrap: "wrap", gap: 8, alignItems: "flex-start" }}>
                      <EmailAction
                        legId={leg.id}
                        defaultSubject={`Update on your ticket: ${request.title}`}
                        submittedBy={request.submitted_by}
                      />
                      {me.role === "admin" && (
                        <MoveToWorkboardAction legId={leg.id} ticketTitle={request.title} currentUserId={me.id} />
                      )}
                    </div>
                  )}

                  {isCurrent && managedDepartments.includes(leg.department as Department) && (
                    <LegActions
                      legId={leg.id}
                      requestId={request.id}
                      department={leg.department}
                      status={leg.status}
                      currentUserId={me.id}
                      departmentStaff={departmentStaff}
                      assignedToEmployeeId={leg.assigned_to_employee_id}
                      theme="quest"
                      legCreatedAt={leg.created_at}
                    />
                  )}
                </div>
              );
            })}
          </div>

          <div style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em", color: "#9C8FD9", marginBottom: 10 }}>
            Comments
          </div>
          <div style={{ marginBottom: 16 }}>
            {(comments ?? []).length === 0 && <p style={{ fontSize: 12, color: "#9C8FD9" }}>No comments yet.</p>}
            {(comments ?? []).map((c) => {
              const author = c.author_employee_id ? authorMap.get(c.author_employee_id) : null;
              return (
                <div key={c.id} style={{ fontSize: 13, borderBottom: "1px solid #3A2C68", paddingBottom: 12, marginBottom: 12 }}>
                  <div style={{ fontSize: 11, color: "#9C8FD9", marginBottom: 4 }}>
                    {author ? `${author.first_name} ${author.last_name}` : "Unknown"} ·{" "}
                    {new Date(c.created_at).toLocaleString()}
                  </div>
                  <div style={{ whiteSpace: "pre-wrap" }}>{c.body}</div>
                </div>
              );
            })}
          </div>

          {currentLeg && (
            <LegActions
              legId={currentLeg.id}
              requestId={request.id}
              department={currentLeg.department}
              status={currentLeg.status}
              currentUserId={me.id}
              commentOnly
              theme="quest"
            />
          )}
        </div>
      </main>
    );
  }

  // ============================================================
  // PLAIN THEME
  // ============================================================
  return (
    <main className="min-h-screen px-4 py-12">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <Link href="/helpdesk" className="text-sm text-[var(--color-text-dim)] hover:text-[var(--color-text)]">
            ← Back to Help Desk
          </Link>
          <span
            className={`text-xs px-2 py-1 rounded-full ${
              request.overall_status === "closed"
                ? "bg-black/5 text-[var(--color-text-dim)]"
                : "bg-[var(--color-accent)]/10 text-[var(--color-accent)]"
            }`}
          >
            {request.overall_status === "closed" ? "Closed" : "Open"}
          </span>
        </div>

        <h1 className="text-xl font-semibold mb-1">{request.title}</h1>
        <p className="text-sm text-[var(--color-text-dim)] mb-6">
          Submitted by {request.submitted_by} ({request.submitted_by_email}) ·{" "}
          {new Date(request.created_at).toLocaleDateString()}
        </p>

        {request.description && (
          <div className="rounded-lg bg-black/[0.03] p-4 text-sm mb-8 whitespace-pre-wrap">
            {request.description}
          </div>
        )}

        <h2 className="text-sm font-semibold mb-3 text-[var(--color-text-dim)] uppercase tracking-wide">
          Department Chain
        </h2>
        <div className="space-y-3 mb-8">
          {(legs ?? []).map((leg) => {
            const assignee = leg.assigned_to_employee_id ? assigneeMap.get(leg.assigned_to_employee_id) : null;
            const itDetail = itDetailsMap.get(leg.id);
            const isCurrent = currentLeg?.id === leg.id;
            return (
              <div
                key={leg.id}
                className={`rounded-xl border p-4 ${
                  isCurrent ? "border-[var(--color-accent)]" : "border-[var(--color-border)]"
                } bg-[var(--color-surface)]`}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold uppercase tracking-wide text-[var(--color-accent)]">
                      {DEPARTMENT_LABELS[leg.department as Department]}
                    </span>
                    {leg.handed_off_from_leg_id && (
                      <span className="text-xs text-[var(--color-text-dim)]">← handed off</span>
                    )}
                  </div>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-black/5 text-[var(--color-text-dim)]">
                    {LEG_STATUS_LABELS[leg.status as LegStatus]}
                  </span>
                </div>
                <div className="text-xs text-[var(--color-text-dim)]">
                  {leg.category ?? "No category"} · Priority: {leg.priority} ·{" "}
                  {assignee
                    ? `${assignee.first_name} ${assignee.last_name}`
                    : leg.assigned_to_raw_name
                      ? `${leg.assigned_to_raw_name} (legacy)`
                      : "Unassigned"}
                </div>
                {itDetail?.solution && (
                  <div className="mt-2 text-sm">
                    <span className="text-[var(--color-text-dim)]">Solution: </span>
                    {itDetail.solution}
                  </div>
                )}
                {itDetail?.additional_notes && (
                  <div className="mt-2 text-sm whitespace-pre-wrap">{itDetail.additional_notes}</div>
                )}

                {isCurrent && managedDepartments.includes(leg.department as Department) && (
                  <LegActions
                    legId={leg.id}
                    requestId={request.id}
                    department={leg.department}
                    status={leg.status}
                    currentUserId={me.id}
                    departmentStaff={departmentStaff}
                    assignedToEmployeeId={leg.assigned_to_employee_id}
                    legCreatedAt={leg.created_at}
                  />
                )}
              </div>
            );
          })}
        </div>

        <h2 className="text-sm font-semibold mb-3 text-[var(--color-text-dim)] uppercase tracking-wide">
          Comments
        </h2>
        <div className="space-y-3 mb-4">
          {(comments ?? []).length === 0 && (
            <p className="text-sm text-[var(--color-text-dim)]">No comments yet.</p>
          )}
          {(comments ?? []).map((c) => {
            const author = c.author_employee_id ? authorMap.get(c.author_employee_id) : null;
            return (
              <div key={c.id} className="text-sm border-b border-[var(--color-border)] pb-3">
                <div className="text-xs text-[var(--color-text-dim)] mb-1">
                  {author ? `${author.first_name} ${author.last_name}` : "Unknown"} ·{" "}
                  {new Date(c.created_at).toLocaleString()}
                </div>
                <div className="whitespace-pre-wrap">{c.body}</div>
              </div>
            );
          })}
        </div>

        {currentLeg && (
          <LegActions
            legId={currentLeg.id}
            requestId={request.id}
            department={currentLeg.department}
            status={currentLeg.status}
            currentUserId={me.id}
            commentOnly
          />
        )}
      </div>
    </main>
  );
}
