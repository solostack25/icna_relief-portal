import { createClient, createAdminClient } from "@/lib/supabase/server";
import { graphGet } from "@/lib/msgraph";
import { getIntegrationSetting } from "@/lib/integrationSettings";
import { sendPortalEmail } from "@/lib/portalEmail";
import { pushConfigured, sendToEmployees } from "@/lib/push";
import { ORG_APP_BASE_URL } from "@/lib/orgConfig";
import { LEAVE_LABEL, formatRange, formatHours, type LeaveType } from "@/lib/timeOffShared";

// Server-only. Time off requests and weekly timesheets.
//
// Who approves: the employee's direct supervisor - employees.manager_email
// (synced from AD), else their manager in Entra (saved back onto the
// employee row), else the fallback approver set in Admin > Connectors > ADP.
// Admins can see and act on everything, including requests that had no
// approver to route to.

export type Me = {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  role: string | null;
  manager_email: string | null;
};

export type TeamMember = { id: string; first_name: string; last_name: string; email: string; job_title: string | null };

export const FALLBACK_APPROVER_KEY = "time_off_fallback_approver_email";

const norm = (e: string | null | undefined) => (e ?? "").trim().toLowerCase();
/** For ilike: match the email exactly (escape the LIKE wildcards). */
const exact = (e: string) => e.replace(/[\\%_]/g, (m) => `\\${m}`);

export function fullName(p: { first_name: string | null; last_name: string | null }) {
  return `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim();
}

/** The signed-in employee, or null. */
export async function getMe(): Promise<Me | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase
    .from("employees")
    .select("id, first_name, last_name, email, role, manager_email")
    .eq("auth_user_id", user.id)
    .single();
  return (data as Me) ?? null;
}

async function graphManagerEmail(email: string): Promise<string | null> {
  try {
    const m = await graphGet(`/users/${encodeURIComponent(email)}/manager?$select=mail,userPrincipalName`);
    return norm(m?.mail || m?.userPrincipalName) || null;
  } catch {
    return null;
  }
}

/** Who a new request from this employee goes to. */
export async function resolveApproverEmail(me: Me): Promise<string | null> {
  if (norm(me.manager_email)) return norm(me.manager_email);
  const fromGraph = await graphManagerEmail(me.email);
  if (fromGraph) {
    // Save it so the next request (and the team view) doesn't need Graph.
    await createAdminClient().from("employees").update({ manager_email: fromGraph }).eq("id", me.id);
    return fromGraph;
  }
  const fallback = await getIntegrationSetting(FALLBACK_APPROVER_KEY);
  return norm(fallback) || null;
}

/**
 * The people whose time this manager approves: their direct reports, plus
 * anyone who has sent them a request. Admins with nobody reporting to them
 * get every active employee (so the screens can be used and tested).
 */
export async function getTeam(me: Me): Promise<{ members: TeamMember[]; allStaff: boolean }> {
  const admin = createAdminClient();
  const email = norm(me.email);
  const [{ data: reports }, { data: routed }] = await Promise.all([
    admin
      .from("employees")
      .select("id, first_name, last_name, email, job_title")
      .eq("is_active", true)
      .ilike("manager_email", exact(email)),
    admin.from("hr_time_off_requests").select("employee_id").ilike("approver_email", exact(email)),
  ]);
  const ids = new Set((reports ?? []).map((r: TeamMember) => r.id));
  const extraIds = Array.from(new Set((routed ?? []).map((r: { employee_id: string }) => r.employee_id))).filter(
    (id) => !ids.has(id) && id !== me.id
  );
  let members: TeamMember[] = (reports ?? []).filter((r: TeamMember) => r.id !== me.id);
  if (extraIds.length) {
    const { data } = await admin.from("employees").select("id, first_name, last_name, email, job_title").in("id", extraIds);
    members = members.concat((data ?? []) as TeamMember[]);
  }
  if (members.length === 0 && me.role === "admin") {
    const { data } = await admin
      .from("employees")
      .select("id, first_name, last_name, email, job_title")
      .eq("is_active", true)
      .order("first_name");
    return { members: ((data ?? []) as TeamMember[]).filter((m) => m.id !== me.id), allStaff: true };
  }
  members.sort((a, b) => fullName(a).localeCompare(fullName(b)));
  return { members, allStaff: false };
}

/** Does this person see the Team time screens at all? */
export async function managesTime(me: Me): Promise<boolean> {
  if (me.role === "admin") return true;
  const admin = createAdminClient();
  const email = norm(me.email);
  const [{ count: reports }, { count: routed }] = await Promise.all([
    admin.from("employees").select("id", { count: "exact", head: true }).eq("is_active", true).ilike("manager_email", exact(email)),
    admin.from("hr_time_off_requests").select("id", { count: "exact", head: true }).ilike("approver_email", exact(email)),
  ]);
  return (reports ?? 0) + (routed ?? 0) > 0;
}

/** May `me` approve or deny this request? */
export function canDecide(me: Me, request: { approver_email: string | null; employee_id: string }): boolean {
  if (request.employee_id === me.id) return false;
  if (me.role === "admin") return true;
  return !!request.approver_email && norm(request.approver_email) === norm(me.email);
}

/** May `me` approve this employee's timesheet? */
export async function canApproveTimesheet(me: Me, employeeId: string): Promise<boolean> {
  if (employeeId === me.id) return false;
  if (me.role === "admin") return true;
  const { data } = await createAdminClient().from("employees").select("manager_email").eq("id", employeeId).single();
  return norm(data?.manager_email) === norm(me.email);
}

/** Pending approvals waiting on this manager (time off). */
export async function pendingTimeOffCount(me: Me): Promise<number> {
  const admin = createAdminClient();
  let q = admin.from("hr_time_off_requests").select("id", { count: "exact", head: true }).eq("status", "pending");
  q = me.role === "admin" ? q.or(`approver_email.ilike.${exact(norm(me.email))},approver_email.is.null`) : q.ilike("approver_email", exact(norm(me.email)));
  const { count } = await q.neq("employee_id", me.id);
  return count ?? 0;
}

// ---- Notifications (never throw) ----

type ReqForMail = {
  id: string;
  leave_type: LeaveType;
  start_date: string;
  end_date: string;
  hours: number;
  note: string | null;
};

function shell(body: string) {
  return `<div style="font-family:Segoe UI,Arial,sans-serif;font-size:14px;color:#16302B;line-height:1.5">${body}<p style="color:#5F6E68;font-size:12px;margin-top:24px">ICNA Relief Staff Portal</p></div>`;
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

export async function notifyApprover(approverEmail: string, requester: Me, r: ReqForMail) {
  const link = `${ORG_APP_BASE_URL}/time/team`;
  const what = `${LEAVE_LABEL[r.leave_type]}, ${formatRange(r.start_date, r.end_date)} (${formatHours(r.hours)} hours)`;
  try {
    await sendPortalEmail({
      to: [approverEmail],
      subject: `Time off request from ${fullName(requester)}`,
      html: shell(
        `<p><strong>${esc(fullName(requester))}</strong> asked for time off:</p><p>${esc(what)}</p>${
          r.note ? `<p style="color:#5F6E68">“${esc(r.note)}”</p>` : ""
        }<p><a href="${link}" style="color:#1F6F54;font-weight:600">Approve or deny in the portal</a></p>`
      ),
    });
  } catch (e) {
    console.error("[timeOff] approver email failed", e);
  }
  try {
    if (pushConfigured()) {
      const admin = createAdminClient();
      const { data } = await admin.from("employees").select("id").ilike("email", exact(norm(approverEmail))).maybeSingle();
      if (data?.id) {
        await sendToEmployees(admin, [data.id], {
          title: "Time off request",
          body: `${fullName(requester)} · ${what}`,
          url: "/time/team",
          tag: `time-off-${r.id}`,
        });
      }
    }
  } catch (e) {
    console.error("[timeOff] approver push failed", e);
  }
}

export async function notifyEmployee(
  employee: { id: string; email: string; first_name: string },
  decision: "approved" | "denied",
  decider: Me,
  r: ReqForMail,
  decisionNote: string | null
) {
  const what = `${LEAVE_LABEL[r.leave_type]}, ${formatRange(r.start_date, r.end_date)}`;
  const verb = decision === "approved" ? "approved" : "denied";
  try {
    await sendPortalEmail({
      to: [employee.email],
      subject: `Your time off was ${verb}`,
      html: shell(
        `<p>Hi ${esc(employee.first_name)},</p><p>${esc(fullName(decider))} ${verb} your time off: ${esc(what)}.</p>${
          decisionNote ? `<p style="color:#5F6E68">“${esc(decisionNote)}”</p>` : ""
        }<p><a href="${ORG_APP_BASE_URL}/time" style="color:#1F6F54;font-weight:600">See your requests</a></p>`
      ),
    });
  } catch (e) {
    console.error("[timeOff] employee email failed", e);
  }
  try {
    if (pushConfigured()) {
      await sendToEmployees(createAdminClient(), [employee.id], {
        title: `Time off ${verb}`,
        body: what,
        url: "/time",
        tag: `time-off-${r.id}`,
      });
    }
  } catch (e) {
    console.error("[timeOff] employee push failed", e);
  }
}
