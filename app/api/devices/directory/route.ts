import { NextResponse } from "next/server";
import { getDeviceViewer } from "@/lib/devices/access";
import { gBatch } from "@/lib/devices/graph";
import { logSecurityAction } from "@/lib/security/log";
import { createAdminClient } from "@/lib/supabase/server";
import { diagnoseUserWrite } from "@/lib/directory/diagnoseWrite";

export const maxDuration = 300;

const ID = /^[0-9a-f-]{36}$/i;

// POST { action: "assign", ids, officeId }       → sets Entra Office Location to the office's name
// POST { action: "disable" | "enable", ids, reason } → guest accounts only; reversible
export async function POST(req: Request) {
  const viewer = await getDeviceViewer();
  if (!viewer) return NextResponse.json({ error: "IT access required" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const action = body.action as "assign" | "disable" | "enable";
  const ids: string[] = Array.isArray(body.ids) ? body.ids.filter((x: unknown) => typeof x === "string" && ID.test(x)) : [];
  if (!ids.length) return NextResponse.json({ error: "Nothing selected" }, { status: 400 });
  if (ids.length > 1000) return NextResponse.json({ error: "Select 1,000 or fewer at a time" }, { status: 400 });

  const admin = createAdminClient();
  const { data: users } = await admin
    .from("it_directory_users")
    .select("entra_user_id, upn, display_name, user_type, employee_id")
    .in("entra_user_id", ids);
  type U = { entra_user_id: string; upn: string; display_name: string | null; user_type: string | null; employee_id: string | null };
  const byId = new Map<string, U>(((users ?? []) as U[]).map((u) => [u.entra_user_id, u]));

  if (action === "assign") {
    const officeId = typeof body.officeId === "string" ? body.officeId : "";
    const { data: office } = await admin.from("b2s_offices").select("id, field_office, entra_office_names").eq("id", officeId).maybeSingle();
    if (!office) return NextResponse.json({ error: "Pick an office" }, { status: 400 });
    // Write the name the office Employees pages match on.
    const locName = ((office.entra_office_names ?? [])[0] as string | undefined)?.trim() || office.field_office;

    const targets = ids.filter((id) => byId.get(id)?.user_type !== "Guest");
    const res = await gBatch(targets.map((id) => ({ id, method: "PATCH", url: `/users/${id}`, body: { officeLocation: locName } })));
    const ok = targets.filter((id) => (res.get(id)?.status ?? 500) < 300);
    const failed = targets.filter((id) => !ok.includes(id)).map((id) => ({ name: byId.get(id)?.display_name ?? id, error: res.get(id)?.error ?? "Failed" }));

    if (ok.length) {
      await admin.from("it_directory_users").update({ office_location: locName }).in("entra_user_id", ok);
      // Linked portal employees with no office yet get this one too. Existing
      // assignments are left alone, since they also control dashboard access.
      const empIds = ok.map((id) => byId.get(id)?.employee_id).filter(Boolean) as string[];
      if (empIds.length) await admin.from("employees").update({ assigned_office_id: office.id }).in("id", empIds).is("assigned_office_id", null);
    }
    await logSecurityAction({
      targetType: "user",
      targetId: office.id,
      targetName: `${ok.length} user(s) → ${office.field_office}`,
      action: "assign_office",
      actorId: viewer.employeeId,
      ok: failed.length === 0,
      detail: { office: office.field_office, officeLocation: locName, ok, failed },
    }).catch(() => {});
    const denied = targets.find((id) => /insufficient privileges|authorization_requestdenied/i.test(res.get(id)?.error ?? ""));
    const diagnosis = denied ? await diagnoseUserWrite(denied).catch(() => []) : undefined;
    return NextResponse.json({ done: ok.length, failed, skipped: ids.length - targets.length, diagnosis });
  }

  if (action === "disable" || action === "enable") {
    const reason = typeof body.reason === "string" ? body.reason.trim() : "";
    if (reason.length < 5) return NextResponse.json({ error: "Add a short reason." }, { status: 400 });
    // Safety: this page only ever toggles guest accounts.
    const targets = ids.filter((id) => byId.get(id)?.user_type === "Guest");
    const res = await gBatch(targets.map((id) => ({ id, method: "PATCH", url: `/users/${id}`, body: { accountEnabled: action === "enable" } })));
    const ok = targets.filter((id) => (res.get(id)?.status ?? 500) < 300);
    const failed = targets.filter((id) => !ok.includes(id)).map((id) => ({ name: byId.get(id)?.display_name ?? id, error: res.get(id)?.error ?? "Failed" }));
    if (ok.length) await admin.from("it_directory_users").update({ account_enabled: action === "enable" }).in("entra_user_id", ok);
    await logSecurityAction({
      targetType: "user",
      targetId: "guests",
      targetName: `${ok.length} guest account(s)`,
      action: action === "disable" ? "disable_guests" : "enable_guests",
      actorId: viewer.employeeId,
      reason,
      ok: failed.length === 0,
      detail: { ok, failed },
    }).catch(() => {});
    return NextResponse.json({ done: ok.length, failed, skipped: ids.length - targets.length });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
