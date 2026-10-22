import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/grantManagement/server";
import { requireViewer, fail, readJson } from "@/lib/grantManagement/api";
import { audit, ensureAppAccess, grantAccess } from "@/lib/grantManagement/server";

// Replace the people assigned to a grant (and any per-person category limits).
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireViewer();
  if ("res" in auth) return auth.res;
  const { viewer } = auth;
  const admin = createAdminClient();
  if (!(await grantAccess(viewer, id, admin)).canManage) return fail("Only Grant Management can change who's on this grant.", 403);

  const body = await readJson(req);
  if (!Array.isArray(body.members)) return fail("No members sent.");
  const { data: lines } = await admin.from("gm_budget_lines").select("id").eq("grant_id", id);
  const lineIds = new Set((lines ?? []).map((l: { id: string }) => l.id));

  const members = (body.members as Record<string, unknown>[])
    .filter((m) => typeof m.employee_id === "string" && ["grant_manager", "approver", "office_user", "viewer"].includes(String(m.role)))
    .map((m) => {
      const allowed = Array.isArray(m.allowed_line_ids) ? (m.allowed_line_ids as string[]).filter((x) => lineIds.has(x)) : [];
      return { grant_id: id, employee_id: String(m.employee_id), role: String(m.role), allowed_line_ids: allowed.length ? allowed : null, added_by: viewer.employeeId };
    });
  const uniq = [...new Map(members.map((m) => [m.employee_id, m])).values()];

  const { data: before } = await admin.from("gm_grant_members").select("employee_id, role, allowed_line_ids").eq("grant_id", id);
  await admin.from("gm_grant_members").delete().eq("grant_id", id);
  if (uniq.length) {
    const { error } = await admin.from("gm_grant_members").insert(uniq);
    if (error) {
      if (before?.length) await admin.from("gm_grant_members").insert(before.map((b) => ({ ...b, grant_id: id })));
      return fail(error.message, 500);
    }
  }
  await ensureAppAccess(admin, uniq.map((m) => m.employee_id));
  await audit(admin, {
    entity: "member",
    grantId: id,
    action: "members_updated",
    actorId: viewer.employeeId,
    changes: { from: before ?? [], to: uniq.map(({ employee_id, role, allowed_line_ids }) => ({ employee_id, role, allowed_line_ids })) },
  });
  return NextResponse.json({ ok: true });
}
