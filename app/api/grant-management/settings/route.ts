import { NextResponse } from "next/server";
import { createHash, randomBytes } from "crypto";
import { createAdminClient } from "@/lib/grantManagement/server";
import { requireViewer, fail, readJson } from "@/lib/grantManagement/api";
import { audit, ensureAppAccess } from "@/lib/grantManagement/server";
import { setIntegrationSetting } from "@/lib/integrationSettings";

// Grant Management settings.
//   set_role      { employee_id, role, office_ids }  (Grant Management)
//   remove_role   { employee_id }
//   add_category  { name, parent_id? }               (Grant Management)
//   toggle_category { id, is_active }
//   rotate_api_key                                    (Administrator)
export async function POST(req: Request) {
  const auth = await requireViewer({ manager: true });
  if ("res" in auth) return auth.res;
  const { viewer } = auth;
  const admin = createAdminClient();
  const body = await readJson(req);
  const action = String(body.action ?? "");

  if (action === "set_role") {
    const employeeId = typeof body.employee_id === "string" ? body.employee_id : "";
    const role = String(body.role ?? "");
    if (!employeeId) return fail("Pick the person.");
    if (!["gm_admin", "grant_manager", "approver", "office_user"].includes(role)) return fail("Pick a role.");
    if (role === "gm_admin" && !viewer.isAdmin) return fail("Only an Administrator can make someone an Administrator.", 403);
    const { data: emp } = await admin.from("employees").select("id, assigned_office_id").eq("id", employeeId).maybeSingle();
    if (!emp) return fail("Employee not found.", 404);
    let officeIds = Array.isArray(body.office_ids) ? (body.office_ids as unknown[]).filter((x): x is string => typeof x === "string") : [];
    if (!officeIds.length && (role === "approver" || role === "office_user") && emp.assigned_office_id) officeIds = [emp.assigned_office_id];
    const { data: before } = await admin.from("gm_user_roles").select("role, office_ids, is_active").eq("employee_id", employeeId).maybeSingle();
    if (before?.role === "gm_admin" && !viewer.isAdmin) return fail("Only an Administrator can change an Administrator.", 403);
    const { error } = await admin
      .from("gm_user_roles")
      .upsert({ employee_id: employeeId, role, office_ids: officeIds, is_active: true, created_by: viewer.employeeId, updated_at: new Date().toISOString() });
    if (error) return fail(error.message, 500);
    await ensureAppAccess(admin, [employeeId]);
    await audit(admin, { entity: "role", entityId: employeeId, action: "role_set", actorId: viewer.employeeId, changes: { from: before ?? null, to: { role, office_ids: officeIds } } });
    return NextResponse.json({ ok: true });
  }

  if (action === "remove_role") {
    const employeeId = typeof body.employee_id === "string" ? body.employee_id : "";
    const { data: before } = await admin.from("gm_user_roles").select("role").eq("employee_id", employeeId).maybeSingle();
    if (!before) return NextResponse.json({ ok: true });
    if (before.role === "gm_admin" && !viewer.isAdmin) return fail("Only an Administrator can remove an Administrator.", 403);
    await admin.from("gm_user_roles").update({ is_active: false, updated_at: new Date().toISOString() }).eq("employee_id", employeeId);
    await audit(admin, { entity: "role", entityId: employeeId, action: "role_removed", actorId: viewer.employeeId, changes: before });
    return NextResponse.json({ ok: true });
  }

  if (action === "add_category") {
    const name = typeof body.name === "string" ? body.name.trim().slice(0, 120) : "";
    if (!name) return fail("Enter a name.");
    const parentId = typeof body.parent_id === "string" && body.parent_id ? body.parent_id : null;
    const { data: last } = await admin.from("gm_categories").select("sort_order").order("sort_order", { ascending: false }).limit(1).maybeSingle();
    const { error } = await admin.from("gm_categories").insert({ name, parent_id: parentId, sort_order: (last?.sort_order ?? 0) + 10 });
    if (error) return fail(error.message.includes("duplicate") ? "That category already exists." : error.message);
    await audit(admin, { entity: "category", action: "added", actorId: viewer.employeeId, changes: { name, parent_id: parentId } });
    return NextResponse.json({ ok: true });
  }

  if (action === "toggle_category") {
    if (typeof body.id !== "string") return fail("Missing category.");
    await admin.from("gm_categories").update({ is_active: body.is_active === true }).eq("id", body.id);
    await audit(admin, { entity: "category", entityId: body.id, action: body.is_active ? "enabled" : "disabled", actorId: viewer.employeeId });
    return NextResponse.json({ ok: true });
  }

  if (action === "rotate_api_key") {
    if (!viewer.isAdmin) return fail("Only an Administrator can create API keys.", 403);
    const key = `gm_${randomBytes(24).toString("base64url")}`;
    await setIntegrationSetting("grant_management_api_key_hash", createHash("sha256").update(key).digest("hex"), viewer.employeeId);
    await setIntegrationSetting("grant_management_api_key_created", new Date().toISOString(), viewer.employeeId);
    await audit(admin, { entity: "role", action: "api_key_rotated", actorId: viewer.employeeId });
    return NextResponse.json({ ok: true, key });
  }

  return fail("Unknown action.");
}
