import { NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { graphGetAll } from "@/lib/msgraph";
import { IT_TICKETS_SITE_ID, IT_TICKETS_LIST_ID } from "@/lib/sharepoint";

// One-time (but safely re-runnable) import of every ticket in the
// legacy "IT Tickets (HelpDesk v3)" SharePoint list into the new
// helpdesk_requests / helpdesk_request_legs / helpdesk_leg_details_it
// tables, so the rebuilt app launches with real history instead of a
// blank slate.
//
// Each SharePoint ticket becomes one request + one IT leg (the old
// system had no cross-department handoff concept, so there's nothing
// to chain). source_sharepoint_id makes this idempotent -- already-
// imported items are skipped, so it's safe to run again later to pick
// up anything created in SharePoint after the first run, right up
// until SharePoint is fully retired.
//
// Deliberately does NOT attempt to map "Office LookUp" to
// b2s_offices -- the two systems' office records were never
// cross-referenced, and a fuzzy name match risks silently assigning
// the wrong office. office_id is left null on import; can be
// backfilled by hand for tickets where it matters.

const STATUS_MAP: Record<string, string> = {
  Open: "open",
  "In Progress": "in_progress",
  "On Hold": "on_hold",
  Closed: "closed",
};

const PRIORITY_MAP: Record<string, string> = {
  Low: "low",
  Normal: "normal",
  Medium: "normal",
  High: "high",
  Urgent: "urgent",
};

async function runImport() {
  const admin = createAdminClient();

  const { data: employees } = await admin.from("employees").select("id, first_name, last_name");
  const employeeByName = new Map<string, string>(
    (employees ?? []).map((e: { id: string; first_name: string; last_name: string }) => [
      `${e.first_name} ${e.last_name}`.toLowerCase(),
      e.id,
    ])
  );

  const items = await graphGetAll(
    `/v1.0/sites/${IT_TICKETS_SITE_ID}/lists/${IT_TICKETS_LIST_ID}/items` +
      `?$expand=fields($select=Title,AdditionalNotes,RequestCategory,Status,Priority,` +
      `AssignedTechnician,SubmittedBy,SubmittedByEmail,Created,ApprovalRequired,` +
      `SupervisorApproved_x003f_,COOApproved,SupervisorName,DateOfApproval,GrantName,Solution)` +
      `&$top=200`
  );

  let imported = 0;
  let skipped = 0;
  let backfilled = 0;
  const unmatchedAssignees = new Set<string>();
  const unmappedStatuses = new Set<string>();
  const unmappedPriorities = new Set<string>();
  const errors: { sourceId: string; message: string }[] = [];

  for (const item of items) {
    const sourceId: string = item.id;
    const f = item.fields ?? {};

    const { data: existingRequest } = await admin
      .from("helpdesk_requests")
      .select("id")
      .eq("source_sharepoint_id", sourceId)
      .single();

    if (existingRequest) {
      // Already imported — but on a re-run, backfill the leg from the
      // current SharePoint data rather than doing nothing. This
      // covers two cases: tickets imported before assigned_to_raw_name
      // existed (so it's null and needs setting from f.AssignedTechnician
      // now), and tickets whose assignee has since logged into the
      // portal and can now resolve to a real employees.id.
      const { data: existingLeg } = await admin
        .from("helpdesk_request_legs")
        .select("id, assigned_to_employee_id, assigned_to_raw_name")
        .eq("request_id", existingRequest.id)
        .eq("department", "it")
        .single();

      if (existingLeg && f.AssignedTechnician) {
        const match = employeeByName.get(String(f.AssignedTechnician).toLowerCase());
        const needsRawName = !existingLeg.assigned_to_raw_name;
        const needsEmployeeMatch = !existingLeg.assigned_to_employee_id && match;

        if (needsRawName || needsEmployeeMatch) {
          await admin
            .from("helpdesk_request_legs")
            .update({
              assigned_to_raw_name: existingLeg.assigned_to_raw_name || f.AssignedTechnician,
              ...(needsEmployeeMatch ? { assigned_to_employee_id: match } : {}),
            })
            .eq("id", existingLeg.id);
          backfilled++;
        } else {
          skipped++;
        }
      } else {
        skipped++;
      }
      continue;
    }

    const rawStatus: string = f.Status ?? "Open";
    const status = STATUS_MAP[rawStatus];
    if (!status) unmappedStatuses.add(rawStatus);
    const legStatus = status ?? "open";

    const rawPriority: string = f.Priority ?? "Normal";
    const priority = PRIORITY_MAP[rawPriority];
    if (rawPriority && !priority) unmappedPriorities.add(rawPriority);

    let assignedToEmployeeId: string | null = null;
    if (f.AssignedTechnician) {
      const match = employeeByName.get(String(f.AssignedTechnician).toLowerCase());
      if (match) assignedToEmployeeId = match;
      else unmatchedAssignees.add(f.AssignedTechnician);
    }

    const createdAt = item.createdDateTime ?? new Date().toISOString();
    const closedAt = legStatus === "closed" ? item.lastModifiedDateTime ?? null : null;

    try {
      const { data: request, error: requestError } = await admin
        .from("helpdesk_requests")
        .insert({
          title: f.Title || "(Untitled)",
          description: f.AdditionalNotes || null,
          submitted_by: f.SubmittedBy || "Unknown",
          submitted_by_email: f.SubmittedByEmail || "unknown@icnarelief.org",
          created_at: createdAt,
          overall_status: legStatus === "closed" ? "closed" : "open",
          source_sharepoint_id: sourceId,
        })
        .select("id")
        .single();

      if (requestError || !request) throw new Error(requestError?.message ?? "insert failed");

      const { data: leg, error: legError } = await admin
        .from("helpdesk_request_legs")
        .insert({
          request_id: request.id,
          department: "it",
          status: legStatus,
          priority: priority ?? "normal",
          category: f.RequestCategory || null,
          assigned_to_employee_id: assignedToEmployeeId,
          assigned_to_raw_name: f.AssignedTechnician || null,
          created_at: createdAt,
          closed_at: closedAt,
        })
        .select("id")
        .single();

      if (legError || !leg) throw new Error(legError?.message ?? "leg insert failed");

      await admin.from("helpdesk_leg_details_it").insert({
        leg_id: leg.id,
        approval_required: f.ApprovalRequired ?? false,
        supervisor_approved: f.SupervisorApproved_x003f_ ?? false,
        coo_approved: f.COOApproved ?? false,
        supervisor_name: f.SupervisorName || null,
        date_of_approval: f.DateOfApproval || null,
        grant_name: f.GrantName || null,
        solution: f.Solution || null,
      });

      imported++;
    } catch (e: any) {
      errors.push({ sourceId, message: e.message ?? "unknown error" });
    }
  }

  return {
    totalInSharePoint: items.length,
    imported,
    skipped,
    backfilled,
    unmatchedAssignees: [...unmatchedAssignees],
    unmappedStatuses: [...unmappedStatuses],
    unmappedPriorities: [...unmappedPriorities],
    errors,
  };
}

export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: me } = await supabase
    .from("employees")
    .select("role")
    .eq("auth_user_id", user.id)
    .single();
  if (me?.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const result = await runImport();
  return NextResponse.json(result);
}
