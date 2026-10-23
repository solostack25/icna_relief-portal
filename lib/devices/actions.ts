import { createAdminClient } from "@/lib/supabase/server";
import { gGet, gGetAll, gPatch, gPost, explainGraphError } from "./graph";
import type { DeviceAction } from "./shared";

// Live Graph operations on one device. Server-only; callers check IT
// access and write the audit row.

export type DeviceRow = {
  device_key: string;
  entra_object_id: string | null;
  entra_device_id: string | null;
  intune_id: string | null;
  display_name: string | null;
  account_enabled: boolean | null;
};

export async function loadDevice(key: string): Promise<DeviceRow | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("it_devices")
    .select("device_key, entra_object_id, entra_device_id, intune_id, display_name, account_enabled")
    .eq("device_key", key)
    .maybeSingle();
  return (data as DeviceRow) ?? null;
}

// ---------- secrets (never stored) ----------

export async function getBitLockerKeys(d: DeviceRow): Promise<{ keys?: { id: string; key: string; createdAt: string | null; volumeType: string | null }[]; error?: string }> {
  if (!d.entra_device_id) return { error: "This device has no Entra device ID, so there are no BitLocker keys to look up." };
  try {
    const list = await gGetAll<{ id: string; createdDateTime?: string; volumeType?: string }>(
      `/v1.0/informationProtection/bitlocker/recoveryKeys?$filter=deviceId eq '${d.entra_device_id}'`
    );
    if (!list.length) return { keys: [] };
    const keys = [];
    for (const k of list) {
      const full = await gGet(`/v1.0/informationProtection/bitlocker/recoveryKeys/${k.id}?$select=key`);
      keys.push({ id: k.id, key: full?.key ?? "", createdAt: k.createdDateTime ?? null, volumeType: k.volumeType ?? null });
    }
    keys.sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));
    return { keys };
  } catch (e) {
    return { error: explainGraphError(e, "BitLockerKey.Read.All") };
  }
}

export async function getLapsPassword(d: DeviceRow): Promise<{ account?: string; password?: string; backedUpAt?: string | null; error?: string }> {
  if (!d.entra_device_id) return { error: "This device has no Entra device ID." };
  try {
    const data = await gGet(`/v1.0/directory/deviceLocalCredentials/${d.entra_device_id}?$select=credentials,deviceName,lastBackupDateTime`);
    const creds = (data?.credentials ?? []) as { accountName?: string; passwordBase64?: string; backupDateTime?: string }[];
    const latest = creds.sort((a, b) => (b.backupDateTime ?? "").localeCompare(a.backupDateTime ?? ""))[0];
    if (!latest?.passwordBase64) return { error: "No LAPS password is backed up for this device. Turn on Windows LAPS for it in Intune/Entra." };
    return {
      account: latest.accountName ?? "Administrator",
      password: Buffer.from(latest.passwordBase64, "base64").toString("utf8"),
      backedUpAt: latest.backupDateTime ?? data?.lastBackupDateTime ?? null,
    };
  } catch (e) {
    const msg = explainGraphError(e, "DeviceLocalCredential.Read.All");
    return { error: msg.startsWith("Not found") ? "No LAPS password is backed up for this device. Turn on Windows LAPS for it in Intune/Entra." : msg };
  }
}

// ---------- actions ----------

const INTUNE_ENDPOINT: Partial<Record<DeviceAction, string>> = {
  sync: "syncDevice",
  restart: "rebootNow",
  lock: "remoteLock",
  retire: "retire",
  wipe: "wipe",
};

export async function runDeviceAction(d: DeviceRow, action: DeviceAction): Promise<{ ok: boolean; error?: string }> {
  try {
    if (action === "disable" || action === "enable") {
      if (!d.entra_object_id) return { ok: false, error: "This device isn't in Entra ID." };
      await gPatch(`/v1.0/devices/${d.entra_object_id}`, { accountEnabled: action === "enable" });
      await createAdminClient().from("it_devices").update({ account_enabled: action === "enable" }).eq("device_key", d.device_key);
      return { ok: true };
    }
    const ep = INTUNE_ENDPOINT[action];
    if (!ep) return { ok: false, error: "Unknown action." };
    if (!d.intune_id) return { ok: false, error: "This device isn't enrolled in Intune, so remote actions aren't available." };
    const body = action === "wipe" ? { keepEnrollmentData: false, keepUserData: false } : {};
    await gPost(`/v1.0/deviceManagement/managedDevices/${d.intune_id}/${ep}`, body);
    return { ok: true };
  } catch (e) {
    const perm = action === "disable" || action === "enable" ? "Device.ReadWrite.All" : "DeviceManagementManagedDevices.PrivilegedOperations.All";
    return { ok: false, error: explainGraphError(e, perm) };
  }
}
