// Client-safe types and labels for Device Management.

export type Coverage = "intune" | "licensed_not_enrolled" | "unlicensed" | "registered" | "personal" | "no_owner";

export const COVERAGE_LABELS: Record<Coverage, string> = {
  intune: "Managed by Intune",
  licensed_not_enrolled: "Licensed, not enrolled",
  unlicensed: "No Intune license",
  registered: "Registered, not joined",
  personal: "Phone / tablet (BYOD)",
  no_owner: "No owner",
};

export const COVERAGE_HELP: Record<Coverage, string> = {
  intune: "Enrolled in Intune: policies apply and remote actions work.",
  licensed_not_enrolled: "The owner has an Intune license (E3/E5) but this device isn't enrolled. Enroll it so policies apply.",
  unlicensed: "The owner's license (e.g. Business Basic/Standard) doesn't include Intune, so this device can't be managed yet.",
  registered: "Only registered in Entra: someone signs in to Windows with a local account and added their ICNA account under Access work or school. ICNA accounts can't sign in to Windows here and Intune can't manage it. If it's an ICNA computer, join it to Entra (Settings → Accounts → Access work or school → Disconnect, then Connect → Join this device to Microsoft Entra ID), or reset it with Autopilot.",
  personal: "A phone or tablet with a work account added. Protect it with app protection policies for Outlook/Teams, not full management.",
  no_owner: "No owner recorded in Entra. Assign it or check whether it's still in use.",
};

export const COVERAGE_COLORS: Record<Coverage, string> = {
  intune: "#1F6F54",
  licensed_not_enrolled: "#A57420",
  unlicensed: "#B5566B",
  registered: "#C2410C",
  personal: "#2B6CB0",
  no_owner: "#7A7A7A",
};

export const TRUST_LABELS: Record<string, string> = {
  AzureAd: "Entra joined",
  ServerAd: "Hybrid joined",
  Workplace: "Registered (not joined)",
};

export const STALE_DAYS = 90;

export type DeviceAction = "sync" | "restart" | "lock" | "disable" | "enable" | "retire" | "wipe";

export const ACTION_LABELS: Record<DeviceAction, string> = {
  sync: "Sync now",
  restart: "Restart",
  lock: "Lock",
  disable: "Disable in Entra",
  enable: "Re-enable in Entra",
  retire: "Retire (remove company data)",
  wipe: "Wipe (factory reset)",
};

// Actions that need a second IT person to approve.
export const APPROVAL_ACTIONS: DeviceAction[] = ["retire", "wipe"];

export function isStale(lastSignIn: string | null | undefined, now = Date.now()) {
  if (!lastSignIn) return true;
  return now - new Date(lastSignIn).getTime() > STALE_DAYS * 86_400_000;
}

export function formatBytes(n: number | null | undefined) {
  if (!n) return "—";
  const gb = n / 1024 ** 3;
  return gb >= 100 ? `${Math.round(gb)} GB` : `${gb.toFixed(1)} GB`;
}
