import { createAdminClient } from "@/lib/supabase/server";

// Which device platforms ICNA actually has (active in the last 90 days),
// so Secure Score recommendations for missing platforms (e.g. macOS or
// Linux Defender controls) can be set aside instead of topping the list.

export type Platform = "windows" | "macos" | "linux" | "ios" | "android";

const PATTERNS: [Platform, RegExp][] = [
  ["macos", /\bmac ?os\b|\bmacos\b/i],
  ["linux", /\blinux\b/i],
  ["ios", /\bios\b|\bipad ?os\b/i],
  ["android", /\bandroid\b/i],
];

export function controlPlatform(title: string): Platform | null {
  for (const [p, re] of PATTERNS) if (re.test(title)) return p;
  return null;
}

export async function activePlatforms(): Promise<Set<Platform>> {
  const since = new Date(Date.now() - 90 * 86_400_000).toISOString();
  const { data } = await createAdminClient()
    .from("it_devices")
    .select("operating_system")
    .is("removed_at", null)
    .or(`approx_last_sign_in.gte.${since},intune_last_sync.gte.${since},mde_last_seen.gte.${since}`)
    .limit(5000);
  const out = new Set<Platform>();
  for (const { operating_system: os } of (data ?? []) as { operating_system: string | null }[]) {
    const o = (os ?? "").toLowerCase();
    if (o.includes("windows")) out.add("windows");
    else if (o.includes("mac")) out.add("macos");
    else if (o.includes("ios") || o.includes("ipad")) out.add("ios");
    else if (o.includes("android")) out.add("android");
    else if (o.includes("linux") || o.includes("ubuntu")) out.add("linux");
  }
  return out;
}

export function isIrrelevant(title: string, have: Set<Platform>) {
  const p = controlPlatform(title);
  return !!p && !have.has(p);
}
