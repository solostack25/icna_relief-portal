import { createAdminClient } from "@/lib/supabase/server";

// Server-side loaders shared by the Device Management pages.

export type DeviceListRow = {
  device_key: string;
  display_name: string | null;
  operating_system: string | null;
  os_version: string | null;
  trust_type: string | null;
  account_enabled: boolean | null;
  approx_last_sign_in: string | null;
  owner_upn: string | null;
  owner_name: string | null;
  employee_id: string | null;
  serial_number: string | null;
  manufacturer: string | null;
  model: string | null;
  compliance_state: string | null;
  compliance_reasons: { title: string }[] | null;
  is_encrypted: boolean | null;
  intune_id: string | null;
  intune_last_sync: string | null;
  coverage: string;
  office: string | null;
};

export type SyncRun = {
  id: string;
  started_at: string;
  finished_at: string | null;
  status: string;
  trigger: string;
  counts: Record<string, number> | null;
  errors: Record<string, string> | null;
};

export type PendingRequest = {
  id: string;
  device_key: string;
  device_name: string | null;
  action: "wipe" | "retire";
  reason: string;
  ticket_ref: string | null;
  requested_by: string;
  requested_by_name: string;
  requested_at: string;
};

export async function employeeNames(ids: (string | null | undefined)[]) {
  const uniq = Array.from(new Set(ids.filter(Boolean) as string[]));
  const map = new Map<string, { name: string; office_id: string | null }>();
  if (!uniq.length) return map;
  const admin = createAdminClient();
  for (let i = 0; i < uniq.length; i += 300) {
    const { data } = await admin.from("employees").select("id, first_name, last_name, assigned_office_id").in("id", uniq.slice(i, i + 300));
    for (const e of (data ?? []) as { id: string; first_name: string; last_name: string; assigned_office_id: string | null }[]) {
      map.set(e.id, { name: `${e.first_name ?? ""} ${e.last_name ?? ""}`.trim(), office_id: e.assigned_office_id });
    }
  }
  return map;
}

export async function loadDeviceList(): Promise<DeviceListRow[]> {
  const admin = createAdminClient();
  const rows: DeviceListRow[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await admin
      .from("it_devices")
      .select(
        "device_key, display_name, operating_system, os_version, trust_type, account_enabled, approx_last_sign_in, owner_upn, owner_name, employee_id, serial_number, manufacturer, model, compliance_state, compliance_reasons, is_encrypted, intune_id, intune_last_sync, coverage"
      )
      .is("removed_at", null)
      .order("display_name")
      .range(from, from + 999);
    if (error) break;
    rows.push(...((data ?? []) as Omit<DeviceListRow, "office">[]).map((r) => ({ ...r, office: null })));
    if (!data || data.length < 1000) break;
  }
  const emps = await employeeNames(rows.map((r) => r.employee_id));
  const { data: offices } = await admin.from("b2s_offices").select("id, field_office");
  const officeName = new Map(((offices ?? []) as { id: string; field_office: string }[]).map((o) => [o.id, o.field_office]));
  for (const r of rows) {
    const e = r.employee_id ? emps.get(r.employee_id) : null;
    r.office = e?.office_id ? officeName.get(e.office_id) ?? null : null;
  }
  return rows;
}

export async function loadLastSync(): Promise<SyncRun | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("it_device_sync_runs")
    .select("id, started_at, finished_at, status, trigger, counts, errors")
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as SyncRun) ?? null;
}

export async function loadPendingRequests(deviceKey?: string): Promise<PendingRequest[]> {
  const admin = createAdminClient();
  let q = admin
    .from("it_device_action_requests")
    .select("id, device_key, action, reason, ticket_ref, requested_by, requested_at")
    .eq("status", "pending")
    .order("requested_at");
  if (deviceKey) q = q.eq("device_key", deviceKey);
  const { data } = await q;
  const rows = (data ?? []) as Omit<PendingRequest, "device_name" | "requested_by_name">[];
  if (!rows.length) return [];
  const names = await employeeNames(rows.map((r) => r.requested_by));
  const { data: devs } = await admin.from("it_devices").select("device_key, display_name").in("device_key", rows.map((r) => r.device_key));
  const devName = new Map(((devs ?? []) as { device_key: string; display_name: string | null }[]).map((d) => [d.device_key, d.display_name]));
  return rows.map((r) => ({ ...r, device_name: devName.get(r.device_key) ?? null, requested_by_name: names.get(r.requested_by)?.name ?? "Someone" }));
}
