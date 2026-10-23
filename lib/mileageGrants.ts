import { createAdminClient } from "@/lib/supabase/server";

// Server-only. Which Grant Management grants a tracked trip can be
// charged to, and turning a submitted grant-funded trip into a
// gm_expenses row.
//
// The list is the grants curated in Grant Management: status "active",
// with a Travel budget line to put mileage on. If the driver is set up
// in Grant Management with limits (a member restricted to certain
// budget lines), those limits are honored; everyone else sees every
// active grant, and their trips go to the grant team's approvals
// queue as "submitted" for review.

export type MileageGrant = {
  id: string;
  code: string;
  name: string;
  funder: string;
  program: string;
  office_id: string | null;
  start_date: string;
  end_date: string;
  line_id: string;
  line_label: string;
};

type LineRow = { id: string; grant_id: string; category: string; subcategory: string | null; sort_order: number };

// Best budget line for mileage on one grant: Travel > Mileage, then a
// plain Travel line, then any other Travel line (Gas, Rental Car...).
function pickMileageLine(lines: LineRow[], allowed: string[] | null): LineRow | null {
  const usable = lines.filter((l) => l.category.trim().toLowerCase() === "travel" && (!allowed || allowed.includes(l.id)));
  const sub = (l: LineRow) => (l.subcategory ?? "").trim().toLowerCase();
  return (
    usable.find((l) => sub(l) === "mileage") ??
    usable.find((l) => sub(l) === "") ??
    usable.find((l) => sub(l).includes("mile")) ??
    usable.sort((a, b) => a.sort_order - b.sort_order)[0] ??
    null
  );
}

export async function loadMileageGrants(employeeId: string): Promise<MileageGrant[]> {
  const admin = createAdminClient();
  const { data: grants, error } = await admin
    .from("gm_grants")
    .select("id, code, name, funder, program, office_id, start_date, end_date")
    .eq("status", "active")
    .order("code");
  // Grant Management not installed yet: no picker, nothing breaks.
  if (error || !grants?.length) return [];

  const ids = grants.map((g: { id: string }) => g.id);
  const [{ data: lines }, { data: members }] = await Promise.all([
    admin.from("gm_budget_lines").select("id, grant_id, category, subcategory, sort_order").in("grant_id", ids).eq("is_active", true),
    admin.from("gm_grant_members").select("grant_id, role, allowed_line_ids").eq("employee_id", employeeId),
  ]);
  const mem = new Map(((members ?? []) as { grant_id: string; role: string; allowed_line_ids: string[] | null }[]).map((m) => [m.grant_id, m]));

  const out: MileageGrant[] = [];
  for (const g of grants as Omit<MileageGrant, "line_id" | "line_label">[]) {
    const m = mem.get(g.id);
    // A "viewer" on a grant was deliberately given read-only access.
    if (m?.role === "viewer") continue;
    const allowed = m?.allowed_line_ids?.length ? m.allowed_line_ids : null;
    const line = pickMileageLine(((lines ?? []) as LineRow[]).filter((l) => l.grant_id === g.id), allowed);
    if (!line) continue;
    out.push({ ...g, line_id: line.id, line_label: [line.category, line.subcategory].filter(Boolean).join(" › ") });
  }
  return out;
}

// Validates a pick from the trip sheet. Returns the grant + line to
// store, or an error to show the driver.
export async function checkMileageGrant(employeeId: string, grantId: string, tripDate: string): Promise<{ grant?: MileageGrant; error?: string }> {
  const grant = (await loadMileageGrants(employeeId)).find((g) => g.id === grantId);
  if (!grant) return { error: "That grant isn't open for mileage. Pick another grant or choose Not grant-funded." };
  if (tripDate < grant.start_date || tripDate > grant.end_date) {
    return { error: `This trip is outside ${grant.code}'s grant period (${grant.start_date} to ${grant.end_date}).` };
  }
  return { grant };
}

export async function createMileageGrantExpense(opts: {
  employeeId: string;
  driveId: string;
  grantId: string;
  lineId: string;
  tripDate: string;
  amount: number;
  miles: number;
  rate: number;
  purpose: string;
  route: string;
  officeId: string | null;
  program: string | null;
  ticketNumber: string;
}): Promise<{ expenseId?: string; error?: string }> {
  if (opts.amount <= 0) return { error: "Zero-dollar trip, no grant expense needed." };
  const admin = createAdminClient();
  const { data: grant } = await admin.from("gm_grants").select("id, status, office_id, program, approval_required").eq("id", opts.grantId).maybeSingle();
  if (!grant || grant.status !== "active") return { error: "Grant is no longer active." };

  // Only a named grant member gets the grant's "no approval needed"
  // shortcut; anyone else's mileage is always reviewed by the grant team.
  const { data: member } = await admin.from("gm_grant_members").select("role").eq("grant_id", opts.grantId).eq("employee_id", opts.employeeId).maybeSingle();
  const autoApprove = !grant.approval_required && !!member && member.role !== "viewer";
  const now = new Date().toISOString();

  const { data: row, error } = await admin
    .from("gm_expenses")
    .insert({
      grant_id: opts.grantId,
      line_id: opts.lineId,
      expense_date: opts.tripDate,
      vendor: "Mileage reimbursement",
      amount: opts.amount,
      description: `Mileage: ${opts.purpose} (${opts.miles} mi @ $${opts.rate}/mi; ${opts.route})`.slice(0, 500),
      office_id: opts.officeId ?? grant.office_id,
      program: opts.program ?? grant.program,
      kind: "purchase",
      payment_method: "reimbursement",
      doc_required: false,
      status: autoApprove ? "approved" : "submitted",
      source: "manual",
      external_ref: `${opts.ticketNumber} / mileage trip ${opts.driveId}`,
      created_by: opts.employeeId,
      submitted_by: opts.employeeId,
      submitted_at: now,
      reviewed_at: autoApprove ? now : null,
      review_note: autoApprove ? "Auto-approved: this grant doesn't require approval." : null,
    })
    .select("id")
    .single();
  if (error || !row) return { error: error?.message ?? "Couldn't create the grant expense." };

  await admin.from("gm_audit_log").insert({
    entity: "expense",
    entity_id: row.id,
    grant_id: opts.grantId,
    action: autoApprove ? "submitted_auto_approved" : "submitted",
    actor_id: opts.employeeId,
    changes: { source: "mileage_tracker", finance_ticket: opts.ticketNumber, miles: opts.miles, rate: opts.rate, amount: opts.amount },
    note: "Created from the Mileage Tracker",
  });
  return { expenseId: row.id };
}
