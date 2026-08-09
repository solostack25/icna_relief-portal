// Core helpdesk types + shared helpers. This is the one place that
// knows the tables are Supabase — pages and components call these
// functions rather than querying helpdesk_* tables directly, so
// swapping the backing store to Dataverse later means rewriting this
// file, not every page that touches a ticket.

import { SupabaseClient } from "@supabase/supabase-js";

export type Department = "it" | "hr" | "marketing" | "finance";
export type LegStatus = "open" | "in_progress" | "on_hold" | "handed_off" | "closed";
export type Priority = "low" | "normal" | "high" | "urgent";

export const ALL_DEPARTMENTS: Department[] = ["it", "hr", "marketing", "finance"];

// Shared IT mailbox emails send "from" (visible as "IT Support" in
// the SharePoint history this app imported from). Requires the
// Mail.Send Application permission on the Portal app registration --
// see lib/msgraph.ts sendMailAs.
export const IT_SUPPORT_MAILBOX = "it@icnarelief.org";

// Ticket age, formatted per how this was specced: hourly for the
// first 24 hours, then "N days and N hours" after that.
export function formatTicketAge(createdAt: string, now: Date = new Date()): string {
  const created = new Date(createdAt);
  const diffMs = Math.max(0, now.getTime() - created.getTime());
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));

  if (diffHours < 1) return "opened just now";
  if (diffHours < 24) return `open ${diffHours} hour${diffHours === 1 ? "" : "s"}`;

  const days = Math.floor(diffHours / 24);
  const hours = diffHours % 24;
  const dayPart = `${days} day${days === 1 ? "" : "s"}`;
  const hourPart = hours > 0 ? ` and ${hours} hour${hours === 1 ? "" : "s"}` : "";
  return `open ${dayPart}${hourPart}`;
}

// Hours remaining until a bonus window (5h email bonus, 24h close
// bonus) closes, for the countdown banners. Null once expired.
export function hoursRemainingInWindow(
  createdAt: string,
  windowHours: number,
  now: Date = new Date()
): { hours: number; minutes: number } | null {
  const created = new Date(createdAt);
  const deadline = created.getTime() + windowHours * 60 * 60 * 1000;
  const remainingMs = deadline - now.getTime();
  if (remainingMs <= 0) return null;
  const hours = Math.floor(remainingMs / (1000 * 60 * 60));
  const minutes = Math.floor((remainingMs % (1000 * 60 * 60)) / (1000 * 60));
  return { hours, minutes };
}

// The employee_program_access slug that grants management access to
// a department's queue -- see helpdesk_department_access_migration.sql.
export function departmentSlug(dept: Department): string {
  return `helpdesk-${dept}`;
}

// Which departments' queues this employee can manage (see tickets,
// change status, hand off, etc — not just submit and track their
// own). Admins manage everything, same bypass pattern used
// everywhere else in this app (see select-app's visibleApps filter).
export async function getManagedDepartments(
  supabase: SupabaseClient,
  employeeId: string,
  role: string
): Promise<Department[]> {
  if (role === "admin") return ALL_DEPARTMENTS;

  const { data } = await supabase
    .from("employee_program_access")
    .select("program_slug")
    .eq("employee_id", employeeId);

  const slugs = new Set((data ?? []).map((r) => r.program_slug));
  return ALL_DEPARTMENTS.filter((d) => slugs.has(departmentSlug(d)));
}

// Employees who manage a given department -- the pool a ticket can
// actually be assigned to. Two queries rather than a nested select,
// same pattern as elsewhere in this app (see select-app's comment on
// avoiding relational joins with the publishable client key).
export async function getDepartmentStaff(
  supabase: SupabaseClient,
  dept: Department
): Promise<{ id: string; first_name: string; last_name: string }[]> {
  const { data: access } = await supabase
    .from("employee_program_access")
    .select("employee_id")
    .eq("program_slug", departmentSlug(dept));

  const ids = (access ?? []).map((a) => a.employee_id);
  if (ids.length === 0) return [];

  const { data: staff } = await supabase
    .from("employees")
    .select("id, first_name, last_name")
    .in("id", ids)
    .order("last_name");

  return staff ?? [];
}


export const DEPARTMENT_LABELS: Record<Department, string> = {
  it: "IT",
  hr: "HR",
  marketing: "Marketing",
  finance: "Finance",
};

export const LEG_STATUS_LABELS: Record<LegStatus, string> = {
  open: "Open",
  in_progress: "In Progress",
  on_hold: "On Hold",
  handed_off: "Handed Off",
  closed: "Closed",
};

export type HelpdeskRequest = {
  id: string;
  title: string;
  description: string | null;
  submitted_by: string;
  submitted_by_email: string;
  created_at: string;
  overall_status: "open" | "closed";
};

export type HelpdeskLeg = {
  id: string;
  request_id: string;
  department: Department;
  status: LegStatus;
  priority: Priority;
  category: string | null;
  assigned_to_employee_id: string | null;
  assigned_to_raw_name: string | null;
  handed_off_from_leg_id: string | null;
  created_at: string;
  closed_at: string | null;
};

export type ItLegDetails = {
  leg_id: string;
  additional_notes: string | null;
  approval_required: boolean;
  supervisor_approved: boolean;
  coo_approved: boolean;
  supervisor_name: string | null;
  date_of_approval: string | null;
  office_id: string | null;
  grant_name: string | null;
  solution: string | null;
};

// A leg is "active" (counts toward open-ticket dashboards, shows in
// default queue views) unless it's closed or was handed off to a
// different leg.
const ACTIVE_LEG_STATUSES: LegStatus[] = ["open", "in_progress", "on_hold"];

export function isActiveLegStatus(status: LegStatus): boolean {
  return ACTIVE_LEG_STATUSES.includes(status);
}

// Creates a request plus its first leg in one call (not a DB
// transaction -- Supabase JS doesn't expose multi-statement
// transactions directly, so this does the two inserts sequentially
// and cleans up the request if the leg insert fails, rather than
// leaving an orphaned request with no leg).
export async function createRequestWithFirstLeg(
  supabase: SupabaseClient,
  params: {
    title: string;
    description: string | null;
    submitted_by: string;
    submitted_by_email: string;
    department: Department;
    category: string | null;
    priority: Priority;
  }
): Promise<{ requestId: string; legId: string }> {
  const { data: request, error: requestError } = await supabase
    .from("helpdesk_requests")
    .insert({
      title: params.title,
      description: params.description,
      submitted_by: params.submitted_by,
      submitted_by_email: params.submitted_by_email,
    })
    .select("id")
    .single();

  if (requestError || !request) {
    throw new Error(requestError?.message ?? "Failed to create request");
  }

  const { data: leg, error: legError } = await supabase
    .from("helpdesk_request_legs")
    .insert({
      request_id: request.id,
      department: params.department,
      category: params.category,
      priority: params.priority,
    })
    .select("id")
    .single();

  if (legError || !leg) {
    await supabase.from("helpdesk_requests").delete().eq("id", request.id);
    throw new Error(legError?.message ?? "Failed to create leg");
  }

  return { requestId: request.id, legId: leg.id };
}

// Hands a leg off to another department: closes the current leg
// (status "handed_off") and opens a new leg in the target department,
// linked back via handed_off_from_leg_id so the chain stays visible.
// Does NOT try to carry department-specific detail fields across --
// see the schema migration notes on why that's the right default.
export async function handoffLeg(
  supabase: SupabaseClient,
  params: { legId: string; requestId: string; toDepartment: Department; category?: string | null }
): Promise<{ newLegId: string }> {
  const { error: closeError } = await supabase
    .from("helpdesk_request_legs")
    .update({ status: "handed_off", closed_at: new Date().toISOString() })
    .eq("id", params.legId);

  if (closeError) throw new Error(closeError.message);

  const { data: newLeg, error: createError } = await supabase
    .from("helpdesk_request_legs")
    .insert({
      request_id: params.requestId,
      department: params.toDepartment,
      category: params.category ?? null,
      handed_off_from_leg_id: params.legId,
    })
    .select("id")
    .single();

  if (createError || !newLeg) {
    throw new Error(createError?.message ?? "Failed to create handoff leg");
  }

  return { newLegId: newLeg.id };
}

// Determines if a timestamp counts as "after hours" for the IT points
// bonus: any time on Sat/Sun, or after 6pm on a weekday. Evaluated in
// Houston's local time (America/Chicago), not server/UTC time --
// otherwise the 6pm cutoff would silently be wrong depending on
// where the serverless function happens to run.
function isAfterHours(date: Date): boolean {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    weekday: "short",
    hour: "numeric",
    hour12: false,
  }).formatToParts(date);

  const weekday = parts.find((p) => p.type === "weekday")?.value ?? "";
  const hour = parseInt(parts.find((p) => p.type === "hour")?.value ?? "0", 10);

  const isWeekend = weekday === "Sat" || weekday === "Sun";
  const isEvening = hour >= 18; // 6pm or later, 24hr format
  return isWeekend || isEvening;
}

// Awards points for closing an IT ticket (IT only, per how this was
// specced -- other departments don't get scored). Writes to the
// append-only ledger rather than a running total column, so standings
// are always re-derivable and auditable.
async function awardClosePoints(
  supabase: SupabaseClient,
  params: {
    legId: string;
    closedByEmployeeId: string;
    assignedToEmployeeId: string | null;
    legCreatedAt: string;
  }
): Promise<void> {
  const now = new Date();

  const baseReason = !params.assignedToEmployeeId || params.assignedToEmployeeId === params.closedByEmployeeId
    ? "own_ticket"
    : "took_ticket";
  const basePoints = baseReason === "own_ticket" ? 5 : 10;

  const entries = [
    { leg_id: params.legId, employee_id: params.closedByEmployeeId, points: basePoints, reason: baseReason, awarded_at: now.toISOString() },
  ];

  if (isAfterHours(now)) {
    entries.push({
      leg_id: params.legId,
      employee_id: params.closedByEmployeeId,
      points: 10,
      reason: "after_hours_bonus",
      awarded_at: now.toISOString(),
    });
  }

  // Fast-close bonus: closed within 24h of when this specific ticket
  // (leg) opened, not the original request -- a leg received via
  // handoff gets its own fresh 24h clock starting when IT actually
  // received it, since IT isn't responsible for time that elapsed in
  // another department first.
  const hoursOpen = (now.getTime() - new Date(params.legCreatedAt).getTime()) / (1000 * 60 * 60);
  if (hoursOpen <= 24) {
    entries.push({
      leg_id: params.legId,
      employee_id: params.closedByEmployeeId,
      points: 5,
      reason: "fast_close_bonus",
      awarded_at: now.toISOString(),
    });
  }

  await supabase.from("helpdesk_points_ledger").insert(entries);
}

// Closes a leg, and closes the parent request too if this was the
// last active leg -- so overall_status stays accurate without a DB
// trigger (see schema comment on helpdesk_requests.overall_status).
export async function closeLeg(
  supabase: SupabaseClient,
  params: {
    legId: string;
    requestId: string;
    department: Department;
    closedByEmployeeId: string;
    assignedToEmployeeId: string | null;
    legCreatedAt: string;
  }
): Promise<void> {
  const { error } = await supabase
    .from("helpdesk_request_legs")
    .update({
      status: "closed",
      closed_at: new Date().toISOString(),
      closed_by_employee_id: params.closedByEmployeeId,
    })
    .eq("id", params.legId);
  if (error) throw new Error(error.message);

  if (params.department === "it") {
    await awardClosePoints(supabase, {
      legId: params.legId,
      closedByEmployeeId: params.closedByEmployeeId,
      assignedToEmployeeId: params.assignedToEmployeeId,
      legCreatedAt: params.legCreatedAt,
    });
  }

  const { data: remainingLegs } = await supabase
    .from("helpdesk_request_legs")
    .select("status")
    .eq("request_id", params.requestId);

  const stillActive = (remainingLegs ?? []).some((l) => isActiveLegStatus(l.status as LegStatus));

  if (!stillActive) {
    await supabase
      .from("helpdesk_requests")
      .update({ overall_status: "closed" })
      .eq("id", params.requestId);
  }
}

// This week's (Mon-Sun, America/Chicago) live IT leaderboard, summed
// directly from the ledger -- always accurate, not dependent on the
// Friday snapshot having run.
export async function getWeeklyItLeaderboard(
  supabase: SupabaseClient
): Promise<{ employeeId: string; points: number }[]> {
  const now = new Date();
  const chicagoNow = new Date(now.toLocaleString("en-US", { timeZone: "America/Chicago" }));
  const dayOfWeek = chicagoNow.getDay(); // 0 = Sunday
  const daysSinceMonday = (dayOfWeek + 6) % 7;
  const weekStart = new Date(chicagoNow);
  weekStart.setDate(chicagoNow.getDate() - daysSinceMonday);
  weekStart.setHours(0, 0, 0, 0);

  const { data } = await supabase
    .from("helpdesk_points_ledger")
    .select("employee_id, points")
    .gte("awarded_at", weekStart.toISOString());

  const totals = new Map<string, number>();
  for (const row of data ?? []) {
    totals.set(row.employee_id, (totals.get(row.employee_id) ?? 0) + row.points);
  }

  return [...totals.entries()]
    .map(([employeeId, points]) => ({ employeeId, points }))
    .sort((a, b) => b.points - a.points);
}
