import crypto from "crypto";
import { createAdminClient } from "@/lib/supabase/server";
import { gGetAll } from "@/lib/devices/graph";

// Windows 11 Pro upgrade program - see supabase/windows_upgrade_migration.sql.
//
// Licensing ground rules baked in here (confirm with the reseller):
//  - Commercial VOLUME (MAK/KMS) Windows Pro licenses are upgrade licenses
//    and can't be used on Home PCs. Home -> Pro needs a full license
//    (retail/FPP, CSP perpetual, or OEM). So MAK keys are only offered for
//    PCs that already run Pro (e.g. re-activation), never for Home.
//  - Intune can't upgrade Home -> Pro, and Home can't join Entra ID, so the
//    upgrade happens on the PC (Settings or changepk) and is then followed
//    by an Entra join, which enrolls it in Intune. The nightly device sync
//    then sees a NEW Entra-joined Pro device for the same person and marks
//    the upgrade complete.

// Win32_OperatingSystem.OperatingSystemSKU values Intune reports as skuNumber.
const SKU_EDITION: Record<number, string> = {
  4: "Enterprise",
  27: "Enterprise",
  48: "Pro",
  49: "Pro",
  98: "Home",
  99: "Home",
  100: "Home",
  101: "Home",
  121: "Education",
  122: "Education",
  125: "Enterprise LTSC",
  126: "Enterprise LTSC",
  161: "Pro for Workstations",
  162: "Pro for Workstations",
  164: "Pro Education",
  165: "Pro Education",
  175: "Enterprise",
};

export function editionFromSku(skuNumber?: number | null, skuFamily?: string | null): string | null {
  if (skuNumber && SKU_EDITION[skuNumber]) return SKU_EDITION[skuNumber];
  const f = (skuFamily ?? "").toLowerCase();
  if (!f) return null;
  if (f.includes("core") || f.includes("home")) return "Home";
  if (f.includes("workstation")) return "Pro for Workstations";
  if (f.includes("education")) return f.includes("pro") ? "Pro Education" : "Education";
  if (f.includes("enterprise")) return "Enterprise";
  if (f.includes("pro")) return "Pro";
  return null;
}

// Editions that already meet the "Pro or better" bar.
export const PRO_OR_BETTER = new Set(["Pro", "Enterprise", "Education", "Pro Education", "Pro for Workstations", "Enterprise LTSC"]);

// Called from the nightly sync: Intune's beta API is the only place the
// SKU is exposed. Best-effort - failure just leaves editions as they were.
export async function syncWindowsEditions(): Promise<{ updated: number; error?: string }> {
  try {
    const rows = await gGetAll<{ id: string; skuFamily?: string | null; skuNumber?: number | null; operatingSystem?: string | null }>(
      `/beta/deviceManagement/managedDevices?$select=id,skuFamily,skuNumber,operatingSystem&$filter=${encodeURIComponent("operatingSystem eq 'Windows'")}`
    );
    const admin = createAdminClient();
    const now = new Date().toISOString();
    let updated = 0;
    for (const r of rows) {
      const ed = editionFromSku(r.skuNumber, r.skuFamily);
      if (!ed) continue;
      const { error } = await admin
        .from("it_devices")
        .update({ windows_edition: ed, windows_sku: r.skuNumber ?? null, edition_source: "intune", edition_checked_at: now })
        .eq("intune_id", r.id);
      if (!error) updated++;
    }
    await completeFinishedUpgrades().catch(() => null);
    return { updated };
  } catch (e) {
    return { updated: 0, error: e instanceof Error ? e.message : "Edition sync failed" };
  }
}

// ---------- key encryption ----------

function encKey(): Buffer {
  const secret = process.env.WIN_KEY_ENC_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  if (!secret) throw new Error("No encryption key configured for license keys.");
  return crypto.createHash("sha256").update(`win-license-key:${secret}`).digest();
}
export function normalizeProductKey(k: string) {
  return k.toUpperCase().replace(/[^A-Z0-9]/g, "");
}
export function formatProductKey(k: string) {
  const n = normalizeProductKey(k);
  return n.match(/.{1,5}/g)?.join("-") ?? n;
}
export function isValidProductKey(k: string) {
  return /^[A-Z0-9]{25}$/.test(normalizeProductKey(k));
}
function encrypt(plain: string) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv("aes-256-gcm", encKey(), iv);
  const enc = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return [iv, c.getAuthTag(), enc].map((b) => b.toString("base64")).join(".");
}
function decrypt(blob: string) {
  const [iv, tag, enc] = blob.split(".").map((p) => Buffer.from(p, "base64"));
  const d = crypto.createDecipheriv("aes-256-gcm", encKey(), iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(enc), d.final()]).toString("utf8");
}
function keyHash(k: string) {
  return crypto.createHash("sha256").update(normalizeProductKey(k)).digest("hex");
}

export async function audit(e: { upgradeId?: string | null; keyId?: string | null; actorId: string | null; action: string; detail?: Record<string, unknown> }) {
  await createAdminClient()
    .from("win_upgrade_audit")
    .insert({ upgrade_id: e.upgradeId ?? null, key_id: e.keyId ?? null, actor_id: e.actorId, action: e.action, detail: e.detail ?? null })
    .then(() => null, () => null);
}

export type LicenseType = "retail" | "csp_perpetual" | "oem" | "mak";

// Bulk import: one key per line, optionally "KEY, PO-123". Duplicates and
// malformed lines are reported back, never silently dropped.
export async function importKeys(opts: { text: string; licenseType: LicenseType; product?: string; purchaseRef?: string; makActivations?: number; actorId: string }) {
  const admin = createAdminClient();
  const added: string[] = [];
  const invalid: string[] = [];
  const duplicates: string[] = [];
  const lines = opts.text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  for (const line of lines) {
    const [rawKey, ref] = line.split(/[,\t;]/).map((x) => x?.trim());
    if (!rawKey || !isValidProductKey(rawKey)) {
      invalid.push(line.slice(0, 40));
      continue;
    }
    const norm = normalizeProductKey(rawKey);
    const { error } = await admin.from("win_license_keys").insert({
      product: opts.product?.trim() || "Windows 11 Pro",
      license_type: opts.licenseType,
      key_enc: encrypt(formatProductKey(norm)),
      key_last5: norm.slice(-5),
      key_hash: keyHash(norm),
      activations_total: opts.licenseType === "mak" ? Math.max(1, opts.makActivations ?? 1) : 1,
      purchase_ref: ref || opts.purchaseRef || null,
      added_by: opts.actorId,
    });
    if (error) {
      if (/duplicate|unique/i.test(error.message)) duplicates.push(`…${norm.slice(-5)}`);
      else invalid.push(`…${norm.slice(-5)} (${error.message})`);
    } else added.push(`…${norm.slice(-5)}`);
  }
  await audit({ actorId: opts.actorId, action: "keys_imported", detail: { added: added.length, invalid: invalid.length, duplicates: duplicates.length, licenseType: opts.licenseType } });
  return { added, invalid, duplicates };
}

// ---------- planning ----------

// Windows PCs that need attention: confirmed Home, or unknown edition on a
// computer that's only "registered" (can't take ICNA sign-ins - usually a
// Home PC or a Pro PC set up with a local account).
export async function candidateDevices() {
  const admin = createAdminClient();
  const { data } = await admin
    .from("it_devices")
    .select("device_key, display_name, serial_number, manufacturer, model, operating_system, os_version, trust_type, coverage, intune_id, employee_id, owner_name, owner_upn, windows_edition, edition_source, approx_last_sign_in")
    .is("removed_at", null)
    .ilike("operating_system", "%windows%");
  return (data ?? []) as any[];
}

export async function planUpgrades(deviceKeys: string[], actorId: string) {
  const admin = createAdminClient();
  const { data: devs } = await admin.from("it_devices").select("device_key, display_name, serial_number, employee_id, owner_upn, windows_edition").in("device_key", deviceKeys);
  const offices = await officeLookup();
  let created = 0;
  const skipped: string[] = [];
  for (const d of devs ?? []) {
    if (d.windows_edition && PRO_OR_BETTER.has(d.windows_edition)) {
      skipped.push(`${d.display_name} (already ${d.windows_edition})`);
      continue;
    }
    const { error } = await admin.from("win_upgrades").insert({
      device_key: d.device_key,
      device_name: d.display_name,
      serial_number: d.serial_number,
      employee_id: d.employee_id,
      owner_upn: d.owner_upn ?? null,
      office_id: d.owner_upn ? offices.get(String(d.owner_upn).toLowerCase())?.officeId ?? null : null,
      reported_edition: d.windows_edition,
      created_by: actorId,
    });
    if (error) skipped.push(`${d.display_name} (${/unique|duplicate/i.test(error.message) ? "already planned" : error.message})`);
    else created++;
  }
  await audit({ actorId, action: "upgrades_planned", detail: { created, skipped: skipped.length } });
  return { created, skipped };
}

// Picks a key for an upgrade. Home PCs get a full single-use license
// (retail / CSP perpetual / OEM); MAK is only for PCs already on Pro.
export async function assignKey(upgradeId: string, actorId: string, opts: { allowMak?: boolean } = {}) {
  const admin = createAdminClient();
  const { data: up } = await admin.from("win_upgrades").select("id, key_id, status, reported_edition, device_name").eq("id", upgradeId).maybeSingle();
  if (!up) throw new Error("Upgrade not found.");
  if (up.key_id) return up.key_id as string;
  if (["complete", "cancelled"].includes(up.status)) throw new Error("This upgrade is already closed.");
  const isHome = up.reported_edition === "Home";
  const types = isHome || !opts.allowMak ? ["retail", "csp_perpetual", "oem"] : ["mak", "retail", "csp_perpetual", "oem"];
  for (const t of types) {
    const { data: keys } = await admin
      .from("win_license_keys")
      .select("id, activations_total, activations_used")
      .eq("status", "available")
      .eq("license_type", t)
      .order("created_at")
      .limit(25);
    const k = (keys ?? []).find((x: any) => x.activations_used < x.activations_total);
    if (!k) continue;
    const used = k.activations_used + 1;
    // Optimistic claim: only succeeds if nobody else took the last slot.
    const { data: claimed } = await admin
      .from("win_license_keys")
      .update({ activations_used: used, status: used >= k.activations_total ? "exhausted" : "available" })
      .eq("id", k.id)
      .eq("activations_used", k.activations_used)
      .select("id")
      .maybeSingle();
    if (!claimed) continue;
    await admin.from("win_upgrades").update({ key_id: k.id, status: up.status === "planned" ? "key_assigned" : up.status, updated_at: new Date().toISOString() }).eq("id", upgradeId);
    await audit({ upgradeId, keyId: k.id, actorId, action: "key_assigned", detail: { licenseType: t, device: up.device_name } });
    return k.id as string;
  }
  throw new Error(isHome ? "No full Windows 11 Pro licenses (retail / CSP perpetual / OEM) are left. Volume (MAK) keys can't be used on Home PCs." : "No license keys are available.");
}

// Returns the key in clear text and logs who saw it. Callers enforce who
// may reveal (the PC's owner for single-use keys; IT for anything).
export async function revealKey(upgradeId: string, actorId: string, opts: { isIt: boolean }) {
  const admin = createAdminClient();
  const { data: up } = await admin.from("win_upgrades").select("id, key_id, steps, status").eq("id", upgradeId).maybeSingle();
  if (!up?.key_id) throw new Error("No key assigned yet.");
  const { data: k } = await admin.from("win_license_keys").select("id, key_enc, license_type, status").eq("id", up.key_id).maybeSingle();
  if (!k) throw new Error("Key not found.");
  if (k.status === "revoked") throw new Error("That key was revoked - ask IT for a new one.");
  if (k.license_type === "mak" && !opts.isIt) throw new Error("This PC uses a volume key that only IT can enter. Open a ticket and IT will finish the upgrade.");
  const key = decrypt(k.key_enc);
  const steps = { ...(up.steps ?? {}), key_revealed_at: (up.steps as any)?.key_revealed_at ?? new Date().toISOString() };
  await admin.from("win_upgrades").update({ steps, updated_at: new Date().toISOString() }).eq("id", upgradeId);
  await audit({ upgradeId, keyId: k.id, actorId, action: "key_revealed", detail: { byIt: opts.isIt } });
  return { key, licenseType: k.license_type as LicenseType };
}

export async function setStep(upgradeId: string, actorId: string, step: "upgraded" | "joined" | "blocked" | "cancelled" | "reported_edition", value?: string) {
  const admin = createAdminClient();
  const { data: up } = await admin.from("win_upgrades").select("id, status, steps, key_id, device_key").eq("id", upgradeId).maybeSingle();
  if (!up) throw new Error("Upgrade not found.");
  const now = new Date().toISOString();
  // What someone saw on the PC also feeds the edition report (Intune data
  // still wins on the next sync for managed PCs).
  if (step === "reported_edition" && value) {
    await admin.from("it_devices").update({ windows_edition: value, edition_source: "reported", edition_checked_at: now }).eq("device_key", up.device_key).neq("edition_source", "intune");
    await admin.from("it_devices").update({ windows_edition: value, edition_source: "reported", edition_checked_at: now }).eq("device_key", up.device_key).is("edition_source", null);
  }
  const steps = { ...(up.steps ?? {}) } as Record<string, string>;
  const patch: Record<string, unknown> = { updated_at: now };
  if (step === "reported_edition") {
    patch.reported_edition = value ?? null;
    steps.edition_reported_at = now;
    // A PC that's actually Pro doesn't need a key - free it for someone else.
    if (value && PRO_OR_BETTER.has(value) && up.key_id && up.status === "key_assigned") {
      await releaseKey(up.id, up.key_id, actorId);
      patch.key_id = null;
      patch.status = "upgraded";
      steps.upgraded_at = now;
    }
  } else if (step === "upgraded") {
    patch.status = up.status === "joined" ? "joined" : "upgraded";
    steps.upgraded_at = now;
  } else if (step === "joined") {
    patch.status = "joined";
    steps.joined_at = now;
  } else if (step === "blocked") {
    patch.status = "blocked";
    patch.blocked_reason = value ?? null;
  } else if (step === "cancelled") {
    patch.status = "cancelled";
    if (up.key_id) await releaseKey(up.id, up.key_id, actorId);
    patch.key_id = null;
  }
  patch.steps = steps;
  await admin.from("win_upgrades").update(patch).eq("id", upgradeId);
  await audit({ upgradeId, keyId: up.key_id, actorId, action: `step_${step}`, detail: value ? { value } : undefined });
}

// Gives a never-entered key back to the pool (only before the PC was
// upgraded - after that, the activation is spent).
async function releaseKey(upgradeId: string, keyId: string, actorId: string) {
  const admin = createAdminClient();
  const { data: up } = await admin.from("win_upgrades").select("steps").eq("id", upgradeId).maybeSingle();
  if ((up?.steps as any)?.upgraded_at) return;
  const { data: k } = await admin.from("win_license_keys").select("activations_used, status").eq("id", keyId).maybeSingle();
  if (!k || k.status === "revoked") return;
  await admin.from("win_license_keys").update({ activations_used: Math.max(0, k.activations_used - 1), status: "available" }).eq("id", keyId);
  await audit({ upgradeId, keyId, actorId, action: "key_released" });
}

// After a sync: an open upgrade is complete when the same person now has
// an Entra-joined, Intune-managed Windows device on Pro-or-better that
// matches the original PC (same serial number, or same device name).
export async function completeFinishedUpgrades() {
  const admin = createAdminClient();
  const { data: open } = await admin.from("win_upgrades").select("id, device_key, device_name, serial_number, employee_id, owner_upn, key_id").in("status", ["planned", "key_assigned", "upgraded", "joined"]);
  let completed = 0;
  for (const u of open ?? []) {
    if (!u.employee_id && !u.serial_number && !u.owner_upn) continue;
    let q = admin
      .from("it_devices")
      .select("device_key, display_name, serial_number, windows_edition, trust_type, intune_id")
      .is("removed_at", null)
      .eq("trust_type", "AzureAd")
      .not("intune_id", "is", null);
    if (u.serial_number) q = q.eq("serial_number", u.serial_number);
    else if (u.owner_upn) q = q.ilike("owner_upn", u.owner_upn).ilike("display_name", u.device_name ?? "");
    else q = q.eq("employee_id", u.employee_id).ilike("display_name", u.device_name ?? "");
    const { data: matches } = await q.limit(3);
    const hit = (matches ?? []).find((m: any) => m.windows_edition && PRO_OR_BETTER.has(m.windows_edition));
    if (!hit) continue;
    const now = new Date().toISOString();
    await admin.from("win_upgrades").update({ status: "complete", joined_device_key: hit.device_key, completed_at: now, updated_at: now }).eq("id", u.id);
    await audit({ upgradeId: u.id, keyId: u.key_id, actorId: null, action: "auto_completed", detail: { device: hit.display_name, edition: hit.windows_edition } });
    completed++;
  }
  return completed;
}

// Load the key-pool summary for dashboards.
export async function keyPoolSummary() {
  const admin = createAdminClient();
  const { data } = await admin.from("win_license_keys").select("license_type, activations_total, activations_used, status");
  const out: Record<string, { total: number; used: number; available: number }> = {};
  for (const k of data ?? []) {
    const t = (out[k.license_type] ??= { total: 0, used: 0, available: 0 });
    if (k.status === "revoked") continue;
    t.total += k.activations_total;
    t.used += k.activations_used;
    t.available += Math.max(0, k.activations_total - k.activations_used);
  }
  return out;
}

// Targeted refresh for ONE employee's devices (Entra + Intune), so a person
// who just finished their upgrade sees it confirmed now instead of after
// the nightly sync. Then re-runs completion.
export async function refreshEmployeeDevices(employeeId: string) {
  const admin = createAdminClient();
  const { data: emp } = await admin.from("employees").select("id, email, ad_object_id").eq("id", employeeId).maybeSingle();
  if (!emp) throw new Error("No employee record.");
  const upn = emp.email;
  const now = new Date().toISOString();
  const { gGet } = await import("@/lib/devices/graph");

  const owned = await gGetAll<any>(
    `/v1.0/users/${encodeURIComponent(emp.ad_object_id || upn)}/ownedDevices?$select=id,deviceId,displayName,operatingSystem,operatingSystemVersion,trustType,accountEnabled,isManaged,isCompliant,approximateLastSignInDateTime,registrationDateTime`
  ).catch(() => [] as any[]);
  const managed = await gGetAll<any>(
    `/beta/deviceManagement/managedDevices?$filter=${encodeURIComponent(`userPrincipalName eq '${upn.replace(/'/g, "''")}'`)}&$select=id,deviceName,azureADDeviceId,serialNumber,manufacturer,model,operatingSystem,osVersion,complianceState,isEncrypted,lastSyncDateTime,enrolledDateTime,skuNumber,skuFamily,totalStorageSpaceInBytes,freeStorageSpaceInBytes`
  ).catch(() => [] as any[]);
  void gGet;

  const rows = new Map<string, Record<string, unknown>>();
  for (const d of owned) {
    if (!d.deviceId) continue;
    rows.set(d.deviceId, {
      device_key: d.deviceId,
      entra_object_id: d.id,
      entra_device_id: d.deviceId,
      display_name: d.displayName ?? null,
      operating_system: d.operatingSystem ?? null,
      os_version: d.operatingSystemVersion ?? null,
      trust_type: d.trustType ?? null,
      account_enabled: d.accountEnabled ?? null,
      entra_is_managed: d.isManaged ?? null,
      entra_is_compliant: d.isCompliant ?? null,
      approx_last_sign_in: d.approximateLastSignInDateTime ?? null,
      registered_at: d.registrationDateTime ?? null,
      owner_upn: upn,
      employee_id: emp.id,
    });
  }
  for (const m of managed) {
    const key = m.azureADDeviceId && m.azureADDeviceId !== "00000000-0000-0000-0000-000000000000" ? m.azureADDeviceId : `intune:${m.id}`;
    const r: Record<string, unknown> = rows.get(key) ?? { device_key: key, display_name: m.deviceName ?? null, owner_upn: upn, employee_id: emp.id };
    const ed = editionFromSku(m.skuNumber, m.skuFamily);
    Object.assign(r, {
      intune_id: m.id,
      serial_number: m.serialNumber || null,
      manufacturer: m.manufacturer || null,
      model: m.model || null,
      compliance_state: m.complianceState ?? null,
      is_encrypted: m.isEncrypted ?? null,
      intune_last_sync: m.lastSyncDateTime ?? null,
      enrolled_at: m.enrolledDateTime ?? null,
      primary_user_upn: upn,
      total_storage_bytes: m.totalStorageSpaceInBytes ?? null,
      free_storage_bytes: m.freeStorageSpaceInBytes ?? null,
      ...(ed ? { windows_edition: ed, windows_sku: m.skuNumber ?? null, edition_source: "intune", edition_checked_at: now } : {}),
    });
    if (!r.operating_system) r.operating_system = m.operatingSystem ?? null;
    if (!r.os_version) r.os_version = m.osVersion ?? null;
    rows.set(key, r);
  }
  for (const r of rows.values()) {
    const os = String(r.operating_system ?? "").toLowerCase();
    r.coverage = r.intune_id ? "intune" : r.trust_type === "Workplace" ? (os.includes("windows") || os.includes("mac") ? "registered" : "personal") : "licensed_not_enrolled";
    r.last_seen_at = now;
    r.synced_at = now;
    r.removed_at = null;
    if (r.intune_id) await admin.from("it_devices").update({ intune_id: null }).eq("intune_id", r.intune_id as string).neq("device_key", r.device_key as string);
    await admin.from("it_devices").upsert(r);
  }
  const completed = await completeFinishedUpgrades();
  return { devices: rows.size, completed };
}

// Device owner -> office. Most staff haven't signed into the portal yet
// (no employees row), so the office comes from their Entra "Office" field,
// matched to b2s_offices.entra_office_names (the same mapping
// provisioning uses), with the portal's assigned office winning if set.
export async function officeLookup() {
  const admin = createAdminClient();
  const [{ data: offices }, { data: emps }] = await Promise.all([
    admin.from("b2s_offices").select("id, field_office, state, entra_office_names"),
    admin.from("employees").select("email, assigned_office_id"),
  ]);
  const officeName = new Map<string, string>();
  const byEntraName = new Map<string, string>();
  for (const o of offices ?? []) {
    officeName.set(o.id, `${o.field_office}${o.state ? `, ${o.state}` : ""}`);
    for (const n of (o.entra_office_names ?? []) as string[]) byEntraName.set(n.trim().toLowerCase(), o.id);
    if (o.field_office) byEntraName.set(String(o.field_office).trim().toLowerCase(), o.id);
  }
  const byUpn = new Map<string, { officeId: string | null; officeName: string | null }>();
  try {
    const users = await gGetAll<{ userPrincipalName: string; mail: string | null; officeLocation: string | null }>(
      `/v1.0/users?$select=userPrincipalName,mail,officeLocation&$filter=${encodeURIComponent("accountEnabled eq true")}&$top=999`
    );
    for (const u of users) {
      const loc = (u.officeLocation ?? "").trim();
      const id = loc ? byEntraName.get(loc.toLowerCase()) ?? null : null;
      const v = { officeId: id, officeName: id ? officeName.get(id) ?? loc : loc || null };
      byUpn.set(u.userPrincipalName.toLowerCase(), v);
      if (u.mail) byUpn.set(u.mail.toLowerCase(), v);
    }
  } catch {
    // Directory unavailable - fall back to portal-assigned offices only.
  }
  for (const e of emps ?? []) {
    if (e.assigned_office_id && e.email) byUpn.set(e.email.toLowerCase(), { officeId: e.assigned_office_id, officeName: officeName.get(e.assigned_office_id) ?? null });
  }
  return byUpn;
}
