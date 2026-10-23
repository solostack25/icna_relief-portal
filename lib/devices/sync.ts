import { createAdminClient } from "@/lib/supabase/server";
import { SKU_FRIENDLY_NAMES } from "@/lib/msgraph";
import { gGetAll, explainGraphError } from "./graph";
import type { Coverage } from "./shared";

// Pulls devices, licenses and users from Microsoft Graph into the it_*
// tables. Each source is fetched independently, so a missing permission
// on one (say Intune) doesn't stop the others; the run records which
// sources failed and why, and the Devices page shows it.
//
// Graph application permissions used (all read-only):
//   Device.Read.All                         Entra devices + owners
//   User.Read.All / Directory.Read.All      users + assigned licenses (already granted for AD sync)
//   Organization.Read.All                   license catalog (/subscribedSkus)
//   DeviceManagementManagedDevices.Read.All Intune devices (serial, compliance, encryption)
//   AuditLog.Read.All                       last sign-in per user (optional)

// Real Intune plans only. INTUNE_O365 ("Mobile Device Management for
// Office 365", in Business Basic/Standard) is basic mobility, not Intune.
const INTUNE_PLAN = /^INTUNE_(A|SMBIZ|EDU)(_|$)/i;
const ENTRA_P1_PLAN = /^AAD_PREMIUM/i;
const NIL_GUID = "00000000-0000-0000-0000-000000000000";

type Sku = {
  skuId: string;
  skuPartNumber: string;
  prepaidUnits?: { enabled?: number };
  consumedUnits?: number;
  servicePlans?: { servicePlanId: string; servicePlanName: string; provisioningStatus?: string }[];
};
type GUser = {
  id: string;
  userPrincipalName: string;
  displayName?: string;
  accountEnabled?: boolean;
  officeLocation?: string | null;
  department?: string | null;
  jobTitle?: string | null;
  assignedLicenses?: { skuId: string; disabledPlans?: string[] }[];
  signInActivity?: { lastSignInDateTime?: string | null; lastNonInteractiveSignInDateTime?: string | null };
};
type GDevice = {
  id: string;
  deviceId: string;
  displayName?: string;
  operatingSystem?: string;
  operatingSystemVersion?: string;
  trustType?: string | null;
  profileType?: string | null;
  accountEnabled?: boolean;
  isManaged?: boolean | null;
  isCompliant?: boolean | null;
  approximateLastSignInDateTime?: string | null;
  registrationDateTime?: string | null;
  registeredOwners?: { id: string; userPrincipalName?: string; displayName?: string }[];
};
type GManaged = {
  id: string;
  deviceName?: string;
  azureADDeviceId?: string | null;
  serialNumber?: string | null;
  manufacturer?: string | null;
  model?: string | null;
  operatingSystem?: string | null;
  osVersion?: string | null;
  complianceState?: string | null;
  isEncrypted?: boolean | null;
  lastSyncDateTime?: string | null;
  enrolledDateTime?: string | null;
  userPrincipalName?: string | null;
  userDisplayName?: string | null;
  userId?: string | null;
  managementAgent?: string | null;
  managedDeviceOwnerType?: string | null;
  totalStorageSpaceInBytes?: number | null;
  freeStorageSpaceInBytes?: number | null;
};

const lower = (s: string | null | undefined) => (s ?? "").trim().toLowerCase();

function chunk<T>(xs: T[], n: number) {
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += n) out.push(xs.slice(i, i + n));
  return out;
}

export async function runDeviceSync(opts: { trigger: "cron" | "manual"; triggeredBy?: string | null }) {
  const admin = createAdminClient();
  const { data: run } = await admin
    .from("it_device_sync_runs")
    .insert({ trigger: opts.trigger, triggered_by: opts.triggeredBy ?? null })
    .select("id")
    .single();
  const errors: Record<string, string> = {};
  const counts: Record<string, number> = {};
  const now = new Date().toISOString();

  // ---------- license catalog ----------
  const intunePlansBySku = new Map<string, string[]>(); // skuId -> Intune servicePlanIds
  let skus: Sku[] = [];
  try {
    skus = await gGetAll<Sku>("/v1.0/subscribedSkus");
    for (const s of skus) {
      intunePlansBySku.set(
        s.skuId,
        (s.servicePlans ?? []).filter((p) => INTUNE_PLAN.test(p.servicePlanName)).map((p) => p.servicePlanId)
      );
    }
    const rows = skus.map((s) => ({
      sku_id: s.skuId,
      sku_part_number: s.skuPartNumber,
      friendly_name: SKU_FRIENDLY_NAMES[s.skuPartNumber] ?? s.skuPartNumber.replace(/_/g, " "),
      enabled_units: s.prepaidUnits?.enabled ?? 0,
      consumed_units: s.consumedUnits ?? 0,
      includes_intune: (intunePlansBySku.get(s.skuId) ?? []).length > 0,
      includes_entra_p1: (s.servicePlans ?? []).some((p) => ENTRA_P1_PLAN.test(p.servicePlanName)),
      synced_at: now,
    }));
    if (rows.length) await admin.from("it_license_skus").upsert(rows);
    const ids = rows.map((r) => r.sku_id);
    if (ids.length) await admin.from("it_license_skus").delete().not("sku_id", "in", `(${ids.map((i) => `"${i}"`).join(",")})`);
    counts.skus = rows.length;
  } catch (e) {
    errors.licenses = explainGraphError(e, "Organization.Read.All");
  }

  // ---------- employees (for linking) ----------
  const { data: emps } = await admin.from("employees").select("id, email, ad_object_id");
  const empByUpn = new Map<string, string>();
  const empByObj = new Map<string, string>();
  for (const e of (emps ?? []) as { id: string; email: string | null; ad_object_id: string | null }[]) {
    if (e.email) empByUpn.set(lower(e.email), e.id);
    if (e.ad_object_id) empByObj.set(e.ad_object_id, e.id);
  }

  // ---------- users + licenses ----------
  const hasIntuneByUser = new Map<string, boolean>(); // entra user id -> has Intune
  const hasIntuneByUpn = new Map<string, boolean>();
  let usersOk = false;
  try {
    const base = "/v1.0/users?$top=999&$select=id,userPrincipalName,displayName,accountEnabled,assignedLicenses,officeLocation,department,jobTitle";
    let users: GUser[];
    try {
      // signInActivity caps the page size well below the usual 999.
      users = await gGetAll<GUser>(`${base.replace("$top=999", "$top=120")},signInActivity`);
    } catch {
      // signInActivity needs AuditLog.Read.All; carry on without it.
      users = await gGetAll<GUser>(base);
      errors.signins = "Last sign-in dates unavailable. Grant AuditLog.Read.All to see inactive licensed users.";
    }
    const rows = users.map((u) => {
      const lic = u.assignedLicenses ?? [];
      const hasIntune = lic.some((l) => {
        const plans = intunePlansBySku.get(l.skuId) ?? [];
        return plans.some((p) => !(l.disabledPlans ?? []).includes(p));
      });
      hasIntuneByUser.set(u.id, hasIntune);
      hasIntuneByUpn.set(lower(u.userPrincipalName), hasIntune);
      const si = u.signInActivity;
      const last = [si?.lastSignInDateTime, si?.lastNonInteractiveSignInDateTime].filter(Boolean).sort().pop() ?? null;
      return {
        entra_user_id: u.id,
        upn: u.userPrincipalName,
        display_name: u.displayName ?? null,
        account_enabled: u.accountEnabled ?? null,
        sku_ids: lic.map((l) => l.skuId),
        has_intune: hasIntune,
        last_sign_in: last,
        office_location: u.officeLocation?.trim() || null,
        department: u.department?.trim() || null,
        job_title: u.jobTitle?.trim() || null,
        employee_id: empByObj.get(u.id) ?? empByUpn.get(lower(u.userPrincipalName)) ?? null,
        synced_at: now,
      };
    });
    for (const c of chunk(rows, 500)) await admin.from("it_directory_users").upsert(c);
    await admin.from("it_directory_users").delete().lt("synced_at", now);
    counts.users = rows.length;
    usersOk = true;
  } catch (e) {
    errors.users = explainGraphError(e, "User.Read.All");
  }

  // ---------- Entra devices ----------
  const byKey = new Map<string, Record<string, unknown>>();
  let entraOk = false;
  try {
    const sel =
      "id,deviceId,displayName,operatingSystem,operatingSystemVersion,trustType,profileType,accountEnabled,isManaged,isCompliant,approximateLastSignInDateTime,registrationDateTime";
    // Owners come back via $expand (smaller pages). If the tenant rejects
    // the nested $select, try a plain expand, then no owners at all
    // (Intune's primary user still fills in for enrolled devices).
    let devices: GDevice[];
    try {
      devices = await gGetAll<GDevice>(`/v1.0/devices?$top=100&$select=${sel}&$expand=registeredOwners($select=id,userPrincipalName,displayName)`);
    } catch {
      try {
        devices = await gGetAll<GDevice>(`/v1.0/devices?$top=100&$select=${sel}&$expand=registeredOwners`);
      } catch {
        devices = await gGetAll<GDevice>(`/v1.0/devices?$top=999&$select=${sel}`);
        errors.owners = "Couldn't read device owners from Entra; coverage uses Intune's primary user only.";
      }
    }
    for (const d of devices) {
      const owner = d.registeredOwners?.[0];
      const key = d.deviceId && d.deviceId !== NIL_GUID ? d.deviceId : `entra:${d.id}`;
      byKey.set(key, {
        device_key: key,
        entra_object_id: d.id,
        entra_device_id: d.deviceId ?? null,
        display_name: d.displayName ?? null,
        operating_system: d.operatingSystem ?? null,
        os_version: d.operatingSystemVersion ?? null,
        trust_type: d.trustType ?? null,
        profile_type: d.profileType ?? null,
        account_enabled: d.accountEnabled ?? null,
        entra_is_managed: d.isManaged ?? null,
        entra_is_compliant: d.isCompliant ?? null,
        approx_last_sign_in: d.approximateLastSignInDateTime ?? null,
        registered_at: d.registrationDateTime ?? null,
        owner_entra_user_id: owner?.id ?? null,
        owner_upn: owner?.userPrincipalName ?? null,
        owner_name: owner?.displayName ?? null,
      });
    }
    counts.entra_devices = devices.length;
    entraOk = true;
  } catch (e) {
    errors.entra = explainGraphError(e, "Device.Read.All");
  }

  // ---------- Intune managed devices ----------
  let intuneOk = false;
  try {
    const sel =
      "id,deviceName,azureADDeviceId,serialNumber,manufacturer,model,operatingSystem,osVersion,complianceState,isEncrypted,lastSyncDateTime,enrolledDateTime,userPrincipalName,userDisplayName,userId,managementAgent,managedDeviceOwnerType,totalStorageSpaceInBytes,freeStorageSpaceInBytes";
    const managed = await gGetAll<GManaged>(`/v1.0/deviceManagement/managedDevices?$select=${sel}`);
    for (const m of managed) {
      const key = m.azureADDeviceId && m.azureADDeviceId !== NIL_GUID ? m.azureADDeviceId : `intune:${m.id}`;
      const row = byKey.get(key) ?? { device_key: key, display_name: m.deviceName ?? null };
      Object.assign(row, {
        intune_id: m.id,
        serial_number: m.serialNumber || null,
        manufacturer: m.manufacturer || null,
        model: m.model || null,
        compliance_state: m.complianceState ?? null,
        is_encrypted: m.isEncrypted ?? null,
        intune_last_sync: m.lastSyncDateTime ?? null,
        enrolled_at: m.enrolledDateTime ?? null,
        management_agent: m.managementAgent ?? null,
        ownership: m.managedDeviceOwnerType ?? null,
        primary_user_upn: m.userPrincipalName || null,
        total_storage_bytes: m.totalStorageSpaceInBytes ?? null,
        free_storage_bytes: m.freeStorageSpaceInBytes ?? null,
      });
      if (!row.operating_system) row.operating_system = m.operatingSystem ?? null;
      if (!row.os_version) row.os_version = m.osVersion ?? null;
      // Intune's primary user fills in when Entra has no registered owner.
      if (!row.owner_upn && m.userPrincipalName) {
        row.owner_upn = m.userPrincipalName;
        row.owner_name = m.userDisplayName ?? null;
        row.owner_entra_user_id = m.userId ?? null;
      }
      byKey.set(key, row);
    }
    counts.intune_devices = managed.length;
    intuneOk = true;
  } catch (e) {
    errors.intune = explainGraphError(e, "DeviceManagementManagedDevices.Read.All");
  }

  // ---------- coverage + save ----------
  if (byKey.size) {
    const rows: Record<string, unknown>[] = Array.from(byKey.values()).map((r) => {
      const ownerId = r.owner_entra_user_id as string | null;
      const ownerUpn = r.owner_upn as string | null;
      const ownerHasIntune = (ownerId && hasIntuneByUser.get(ownerId)) || (ownerUpn && hasIntuneByUpn.get(lower(ownerUpn))) || false;
      let coverage: Coverage;
      if (r.intune_id) coverage = "intune";
      else if (r.trust_type === "Workplace") {
        // Registered, not joined. On Windows/macOS that's almost always a
        // computer where someone signed in with a local account and added
        // their ICNA account - it can't take ICNA Windows sign-ins. Phones
        // and tablets registered this way are normal (personal/BYOD).
        const os = String(r.operating_system ?? "").toLowerCase();
        coverage = os.includes("windows") || os.includes("mac") ? "registered" : "personal";
      }
      else if (!ownerId && !ownerUpn) coverage = "no_owner";
      else if (!usersOk) coverage = "no_owner";
      else coverage = ownerHasIntune ? "licensed_not_enrolled" : "unlicensed";
      return {
        ...r,
        employee_id: (ownerId && empByObj.get(ownerId)) || (ownerUpn && empByUpn.get(lower(ownerUpn))) || null,
        coverage,
        last_seen_at: now,
        removed_at: null,
        synced_at: now,
      };
    });
    // Intune-only rows can collide with an older Entra-keyed row for the
    // same intune_id; clear stale intune_ids first so the unique index holds.
    const intuneIds = rows.map((r) => r.intune_id).filter(Boolean) as string[];
    for (const c of chunk(intuneIds, 200)) {
      await admin
        .from("it_devices")
        .update({ intune_id: null })
        .in("intune_id", c)
        .not("device_key", "in", `(${rows.filter((r) => r.intune_id && c.includes(r.intune_id as string)).map((r) => `"${r.device_key}"`).join(",")})`);
    }
    for (const c of chunk(rows, 400)) {
      const { error } = await admin.from("it_devices").upsert(c);
      if (error) errors.save = error.message;
    }
    counts.devices = rows.length;
  }

  // Devices Graph no longer returns: mark removed, but only when the
  // sources that could have returned them both succeeded.
  if (entraOk && intuneOk) {
    await admin.from("it_devices").update({ removed_at: now }).lt("last_seen_at", now).is("removed_at", null);
  } else if (entraOk) {
    await admin.from("it_devices").update({ removed_at: now }).lt("last_seen_at", now).is("removed_at", null).is("intune_id", null);
  }

  const failedAll = !entraOk && !intuneOk && !usersOk;
  const status = failedAll ? "failed" : Object.keys(errors).filter((k) => k !== "signins").length ? "partial" : "ok";
  if (run) {
    await admin
      .from("it_device_sync_runs")
      .update({ finished_at: new Date().toISOString(), status, counts, errors: Object.keys(errors).length ? errors : null })
      .eq("id", run.id);
  }
  return { status, counts, errors };
}
