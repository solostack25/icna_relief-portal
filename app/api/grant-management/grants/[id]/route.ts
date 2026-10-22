import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/grantManagement/server";
import { requireViewer, fail, readJson } from "@/lib/grantManagement/api";
import { cleanGrantInput, GRANT_FIELDS } from "@/lib/grantManagement/grantInput";
import { audit, diff, grantAccess } from "@/lib/grantManagement/server";

// Edit a grant's profile, rules or status. Closing a grant keeps every
// budget, expense, document and audit entry - it just stops new spending.
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireViewer();
  if ("res" in auth) return auth.res;
  const { viewer } = auth;
  const admin = createAdminClient();
  const access = await grantAccess(viewer, id, admin);
  if (!access.canManage) return fail("Only Grant Management can change this grant.", 403);

  const { data: before } = await admin.from("gm_grants").select("*").eq("id", id).maybeSingle();
  if (!before) return fail("Grant not found.", 404);
  const body = await readJson(req);

  // Status-only change (activate / hold / close / reopen)
  if (body.action === "status") {
    const status = String(body.status ?? "");
    if (!["draft", "active", "on_hold", "closed"].includes(status)) return fail("Unknown status.");
    if (status === before.status) return NextResponse.json({ ok: true });
    if (status === "active") {
      const { count } = await admin.from("gm_budget_versions").select("id", { count: "exact", head: true }).eq("grant_id", id).eq("status", "active");
      if (!count) return fail("Approve the grant's budget before opening it for spending.");
    }
    if (status === "closed") {
      const { count } = await admin.from("gm_expenses").select("id", { count: "exact", head: true }).eq("grant_id", id).in("status", ["draft", "submitted", "returned"]);
      if (count && body.force !== true) {
        return fail(`${count} expense(s) are still draft, submitted or returned. Approve, reject or delete them first, or close anyway.`, 409);
      }
    }
    if (before.status === "closed" && !viewer.isManager) return fail("Only Grant Management can reopen a closed grant.", 403);
    const patch: Record<string, unknown> = { status, updated_at: new Date().toISOString() };
    if (status === "closed") Object.assign(patch, { closed_at: new Date().toISOString(), closed_by: viewer.employeeId });
    if (before.status === "closed") Object.assign(patch, { closed_at: null, closed_by: null });
    const { error } = await admin.from("gm_grants").update(patch).eq("id", id);
    if (error) return fail(error.message, 500);
    await audit(admin, {
      entity: "grant",
      entityId: id,
      grantId: id,
      action: status === "closed" ? "closed" : before.status === "closed" ? "reopened" : "status_changed",
      actorId: viewer.employeeId,
      changes: { status: { from: before.status, to: status } },
      note: typeof body.note === "string" ? body.note : null,
    });
    return NextResponse.json({ ok: true });
  }

  const { input, errors } = cleanGrantInput({ ...before, ...body, status: before.status });
  if (!input) return fail("Please fix the highlighted fields.", 400, errors);
  if (input.code.toLowerCase() !== String(before.code).toLowerCase()) {
    const { data: dup } = await admin.from("gm_grants").select("id").ilike("code", input.code).neq("id", id).maybeSingle();
    if (dup) return fail("That grant code is already used.", 400, { code: "That grant code is already used." });
  }
  // Moving the period can't strand expenses that already exist.
  if (input.start_date !== before.start_date || input.end_date !== before.end_date) {
    const { count } = await admin
      .from("gm_expenses")
      .select("id", { count: "exact", head: true })
      .eq("grant_id", id)
      .neq("status", "rejected")
      .or(`expense_date.lt.${input.start_date},expense_date.gt.${input.end_date}`);
    if (count) return fail(`${count} expense(s) fall outside the new period. Fix them before changing the dates.`, 400, { start_date: "Expenses fall outside this period." });
  }
  if (input.office_id && input.office_id !== before.office_id) {
    const { data: office } = await admin.from("b2s_offices").select("region, state").eq("id", input.office_id).maybeSingle();
    input.region = office?.region ?? input.region;
    input.state = office?.state ?? input.state;
  }

  const update: Record<string, unknown> = {};
  for (const k of GRANT_FIELDS) if (k !== "status") update[k] = input[k];
  const changes = diff(before, update, Object.keys(update));
  if (!Object.keys(changes).length) return NextResponse.json({ ok: true });
  const { error } = await admin.from("gm_grants").update({ ...update, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) return fail(error.message, 500);
  await audit(admin, { entity: "grant", entityId: id, grantId: id, action: "updated", actorId: viewer.employeeId, changes });
  return NextResponse.json({ ok: true });
}
