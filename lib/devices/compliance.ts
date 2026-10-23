import { gGet, gGetAll, explainGraphError } from "./graph";

// Why an Intune device is out of compliance: reads each compliance
// policy's per-setting results for the device from Graph and turns the
// failing settings into plain-English reasons with a fix.
//
// Uses DeviceManagementManagedDevices.Read.All; some tenants also need
// DeviceManagementConfiguration.Read.All for policy names.

export type ComplianceReason = {
  policy: string;
  setting: string; // raw Intune setting id, e.g. Windows10CompliancePolicy.BitLockerEnabled
  title: string;
  fix: string;
  state: string; // nonCompliant | error | conflict | unknown
  currentValue: string | null;
  detail: string | null;
};

export type ComplianceReport = { reasons: ComplianceReason[]; checkedAt: string; error?: string };

const BAD = new Set(["noncompliant", "error", "conflict"]);

// Keyed by the part after the last "." in the setting id, lower-cased.
const EXPLAIN: Record<string, { title: string; fix: string }> = {
  requiredevicecompliancepolicyassigned: {
    title: "No compliance policy is assigned to this device",
    fix: "Assign a Windows compliance policy to a group this device or its user is in. Your tenant marks devices with no policy as non-compliant (Intune → Devices → Compliance → Compliance settings).",
  },
  requireremaincontact: {
    title: "Hasn't checked in with Intune recently",
    fix: "The device has been off or offline longer than the allowed window (30 days by default). Turn it on, connect it to the internet and sign in, then press Sync.",
  },
  requireuserexistence: {
    title: "The enrolled user no longer exists",
    fix: "The account that enrolled the device was deleted or disabled. Retire the device and re-enroll it under the current user.",
  },
  bitlockerenabled: {
    title: "BitLocker isn't turned on",
    fix: "Push an Intune disk encryption (BitLocker) policy, or turn BitLocker on locally. A restart is usually needed before it reports as encrypted.",
  },
  storagerequireencryption: {
    title: "Drive isn't encrypted",
    fix: "Turn on BitLocker (Windows) or FileVault (Mac) through an Intune encryption policy.",
  },
  securebootenabled: {
    title: "Secure Boot is off",
    fix: "Turn on Secure Boot in the PC's BIOS/UEFI settings. Older PCs set to Legacy/CSM boot need converting to UEFI first.",
  },
  codeintegrityenabled: {
    title: "Code integrity is off",
    fix: "Usually follows Secure Boot. Enable Secure Boot and run Windows Update.",
  },
  tpmrequired: {
    title: "No TPM chip, or it's turned off",
    fix: "Turn on the TPM (often called PTT or fTPM) in BIOS. PCs without one can't meet this rule.",
  },
  osminimumversion: {
    title: "Windows version is too old",
    fix: "Run Windows Update until it's on the minimum version in your policy. Very old builds may need a feature update.",
  },
  osmaximumversion: {
    title: "OS version is newer than the policy allows",
    fix: "Raise the maximum OS version in the compliance policy, or remove the limit.",
  },
  mobileosminimumversion: { title: "Phone OS is too old", fix: "Update iOS/Android to the minimum version in the policy." },
  passwordrequired: { title: "No password or PIN required to unlock", fix: "Set a password/PIN on the device, or push a device restrictions policy that requires one." },
  passwordminimumlength: { title: "Password is shorter than required", fix: "Have the user change their password/PIN to meet the minimum length." },
  passwordrequiredtype: { title: "Password type doesn't meet the rule", fix: "Use the required password type (e.g. alphanumeric)." },
  passwordminutesofinactivitybeforelock: { title: "Screen lock timeout is too long", fix: "Push a policy setting the screen lock to the allowed number of minutes." },
  passwordexpirationdays: { title: "Password is past its expiry", fix: "Have the user change their password." },
  defenderenabled: { title: "Microsoft Defender is off", fix: "Turn Defender Antivirus back on (another antivirus may have disabled it), or push an Intune antivirus policy." },
  antivirusrequired: { title: "No active antivirus reported", fix: "Make sure Defender (or your approved antivirus) is running and reporting to Windows Security." },
  antispywarerequired: { title: "No active antispyware reported", fix: "Make sure Defender is running and up to date." },
  rtpenabled: { title: "Real-time protection is off", fix: "Turn on real-time protection in Windows Security, or push an antivirus policy that locks it on." },
  signatureoutofdate: { title: "Antivirus definitions are out of date", fix: "Run Windows Update / Defender update, then sync." },
  defenderversion: { title: "Defender version is too old", fix: "Run Windows Update to update the Defender platform." },
  activefirewallrequired: { title: "Windows Firewall is off", fix: "Turn the firewall on, or push an Intune firewall policy that keeps it on." },
  firewallenabled: { title: "Firewall is off", fix: "Turn the firewall on, or push an Intune firewall policy." },
  devicethreatprotectionenabled: { title: "Defender for Endpoint risk too high", fix: "Open the device in Microsoft Defender and resolve the active alerts, then sync." },
  devicethreatprotectionrequiredsecuritylevel: { title: "Defender for Endpoint risk too high", fix: "Open the device in Microsoft Defender and resolve the active alerts, then sync." },
  configurationmanagercompliancerequired: { title: "Configuration Manager reports it non-compliant", fix: "Check the device in Configuration Manager." },
  earlylaunchantimalwaredriverenabled: { title: "Early-launch antimalware is off", fix: "Usually follows Secure Boot/BitLocker. Enable Secure Boot and run Windows Update." },
  securityblockjailbrokendevices: { title: "Device is jailbroken/rooted", fix: "Not allowed. Restore the phone to stock firmware or remove it from work use." },
};

export function explainSetting(setting: string, name: string | null): { title: string; fix: string } {
  const key = setting.split(".").pop()!.toLowerCase();
  return EXPLAIN[key] ?? { title: name || setting, fix: "Open the device in Intune → Device compliance to see what this setting needs." };
}

type SettingState = { setting?: string; settingName?: string; state?: string; currentValue?: string | null; errorDescription?: string | null; instanceDisplayName?: string | null };
type PolicyState = { id: string; displayName?: string; state?: string; settingStates?: SettingState[] };

export async function fetchComplianceReasons(intuneId: string): Promise<ComplianceReport> {
  const checkedAt = new Date().toISOString();
  let policies: PolicyState[];
  try {
    policies = await gGetAll<PolicyState>(`/v1.0/deviceManagement/managedDevices/${intuneId}/deviceCompliancePolicyStates`);
  } catch (e) {
    try {
      policies = await gGetAll<PolicyState>(`/beta/deviceManagement/managedDevices/${intuneId}/deviceCompliancePolicyStates`);
    } catch {
      return { reasons: [], checkedAt, error: explainGraphError(e, "DeviceManagementConfiguration.Read.All") };
    }
  }

  const reasons: ComplianceReason[] = [];
  for (const p of policies) {
    let settings = p.settingStates;
    if (!settings && BAD.has(String(p.state).toLowerCase())) {
      try {
        const full = await gGet(`/beta/deviceManagement/managedDevices/${intuneId}/deviceCompliancePolicyStates/${p.id}`);
        settings = full?.settingStates;
      } catch {}
    }
    for (const s of settings ?? []) {
      const state = String(s.state ?? "").toLowerCase();
      if (!BAD.has(state)) continue;
      const setting = s.setting ?? s.settingName ?? "Unknown setting";
      const { title, fix } = explainSetting(setting, s.settingName ?? null);
      reasons.push({
        policy: p.displayName ?? "Compliance policy",
        setting,
        title: state === "conflict" ? `${title} (two policies conflict)` : state === "error" ? `${title} (device reported an error)` : title,
        fix: state === "conflict" ? `Two assigned policies set this differently. Make them agree or narrow their assignments. ${fix}` : fix,
        state,
        currentValue: s.currentValue ?? null,
        detail: s.errorDescription || null,
      });
    }
    // Policy failed but reported no setting detail.
    if (BAD.has(String(p.state).toLowerCase()) && !(settings ?? []).some((s) => BAD.has(String(s.state ?? "").toLowerCase()))) {
      reasons.push({
        policy: p.displayName ?? "Compliance policy",
        setting: "policy",
        title: `Fails "${p.displayName ?? "a compliance policy"}"`,
        fix: "Intune didn't report which setting. Press Sync, wait 15 minutes, then recheck.",
        state: String(p.state),
        currentValue: null,
        detail: null,
      });
    }
  }
  // Same rule failing in several policies: show once.
  const seen = new Set<string>();
  return {
    reasons: reasons.filter((r) => {
      const k = `${r.setting.split(".").pop()!.toLowerCase()}|${r.state}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    }),
    checkedAt,
  };
}
