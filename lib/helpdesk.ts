// Core helpdesk types + shared helpers. This is the one place that
// knows the tables are Supabase — pages and components call these
// functions rather than querying helpdesk_* tables directly, so
// swapping the backing store to Dataverse later means rewriting this
// file, not every page that touches a ticket.

import { SupabaseClient } from "@supabase/supabase-js";

export type Department = "it" | "hr" | "marketing" | "finance";
export type LegStatus = "open" | "in_progress" | "on_hold" | "handed_off" | "closed";
export type Priority = "low" | "normal" | "high" | "urgent";

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

// Closes a leg, and closes the parent request too if this was the
// last active leg -- so overall_status stays accurate without a DB
// trigger (see schema comment on helpdesk_requests.overall_status).
export async function closeLeg(
  supabase: SupabaseClient,
  params: { legId: string; requestId: string }
): Promise<void> {
  const { error } = await supabase
    .from("helpdesk_request_legs")
    .update({ status: "closed", closed_at: new Date().toISOString() })
    .eq("id", params.legId);
  if (error) throw new Error(error.message);

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
