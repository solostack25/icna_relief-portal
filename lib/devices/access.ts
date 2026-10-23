import { createClient, createAdminClient } from "@/lib/supabase/server";

// Device Management is IT-only: portal admins, or anyone with the
// "helpdesk-it" grant (the same people who run the IT helpdesk).

export type DeviceViewer = { employeeId: string; name: string; email: string; isAdmin: boolean };

export async function getDeviceViewer(): Promise<DeviceViewer | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const admin = createAdminClient();
  const { data: me } = await admin
    .from("employees")
    .select("id, role, first_name, last_name, email, is_active")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (!me || me.is_active === false) return null;
  const isAdmin = me.role === "admin";
  if (!isAdmin) {
    const { data: grant } = await admin
      .from("employee_program_access")
      .select("program_slug")
      .eq("employee_id", me.id)
      .eq("program_slug", "helpdesk-it")
      .maybeSingle();
    if (!grant) return null;
  }
  return { employeeId: me.id, name: `${me.first_name ?? ""} ${me.last_name ?? ""}`.trim(), email: me.email, isAdmin };
}

export async function audit(e: {
  deviceKey?: string | null;
  deviceName?: string | null;
  action: string;
  actorId: string;
  reason?: string | null;
  ticketRef?: string | null;
  ok?: boolean;
  detail?: unknown;
}) {
  const admin = createAdminClient();
  await admin.from("it_device_audit").insert({
    device_key: e.deviceKey ?? null,
    device_name: e.deviceName ?? null,
    action: e.action,
    actor_id: e.actorId,
    reason: e.reason ?? null,
    ticket_ref: e.ticketRef ?? null,
    ok: e.ok ?? true,
    detail: e.detail ?? null,
  });
}
