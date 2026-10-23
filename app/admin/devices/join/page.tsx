import { createAdminClient } from "@/lib/supabase/server";
import { dim } from "../style";
import JoinClient, { type JoinPerson } from "./JoinClient";

export const dynamic = "force-dynamic";

const ACTIVE_DAYS = 90;

type Dev = { device_key: string; display_name: string | null; operating_system: string | null; trust_type: string | null; owner_upn: string | null; owner_name: string | null; approx_last_sign_in: string | null; intune_last_sync: string | null; intune_id: string | null };

// Registered-only → Entra-joined conversion, person by person. A person
// counts as done as soon as the sync sees them on an active joined PC.
export default async function JoinTrackerPage() {
  const admin = createAdminClient();
  const devices: Dev[] = [];
  for (let from = 0; ; from += 1000) {
    const { data } = await admin
      .from("it_devices")
      .select("device_key, display_name, operating_system, trust_type, owner_upn, owner_name, approx_last_sign_in, intune_last_sync, intune_id")
      .is("removed_at", null)
      .neq("account_enabled", false)
      .not("owner_upn", "is", null)
      .range(from, from + 999);
    devices.push(...((data ?? []) as Dev[]));
    if (!data || data.length < 1000) break;
  }

  const cutoff = Date.now() - ACTIVE_DAYS * 86_400_000;
  const people = new Map<string, JoinPerson>();
  for (const d of devices) {
    const os = (d.operating_system ?? "").toLowerCase();
    if (!os.includes("windows") && !os.includes("mac")) continue;
    const last = [d.approx_last_sign_in, d.intune_last_sync].filter(Boolean).sort().pop() ?? null;
    if (!last || new Date(last).getTime() < cutoff) continue;
    const joined = d.trust_type === "AzureAd" || d.trust_type === "ServerAd";
    if (!joined && d.trust_type !== "Workplace") continue;
    const upn = (d.owner_upn as string).toLowerCase();
    const p =
      people.get(upn) ??
      ({ upn, name: d.owner_name ?? upn, office: null, department: null, hasIntune: false, registered: [], joined: [], lastSeen: null, tracking: null } as JoinPerson);
    (joined ? p.joined : p.registered).push({ key: d.device_key, name: d.display_name ?? "PC", lastSeen: last, inIntune: !!d.intune_id });
    if (!p.lastSeen || last > p.lastSeen) p.lastSeen = last;
    people.set(upn, p);
  }

  // ~1.5k directory users: load them all and match case-insensitively
  // (Entra UPN case doesn't always match the device owner's).
  type U = { upn: string; display_name: string | null; office_location: string | null; department: string | null; has_intune: boolean };
  const users: U[] = [];
  for (let from = 0; ; from += 1000) {
    const { data } = await admin.from("it_directory_users").select("upn, display_name, office_location, department, has_intune").range(from, from + 999);
    users.push(...((data ?? []) as U[]));
    if (!data || data.length < 1000) break;
  }
  for (const u of users) {
    const p = people.get(u.upn.toLowerCase());
    if (p) Object.assign(p, { name: u.display_name ?? p.name, office: u.office_location, department: u.department, hasIntune: u.has_intune });
  }
  const { data: tracking } = await admin.from("it_join_tracking").select("upn, status, method, scheduled_for, note, updated_at");
  for (const t of (tracking ?? []) as NonNullable<JoinPerson["tracking"]>[]) {
    const p = people.get(t.upn.toLowerCase());
    if (p) p.tracking = t;
  }

  return (
    <div className="max-w-6xl">
      <h1 style={{ fontFamily: "'Fraunces', serif", fontStyle: "italic", fontWeight: 500, fontSize: 30, margin: 0 }}>Entra join tracker</h1>
      <p className="text-sm mt-1 mb-5 max-w-3xl" style={{ color: dim }}>
        Everyone who used a Windows or Mac computer in the last {ACTIVE_DAYS} days, and whether it&apos;s properly joined to Entra. Registered-only computers can&apos;t take ICNA sign-ins
        or Intune policies. People turn <b>Joined</b> automatically once the nightly sync sees them on a joined computer.
      </p>
      <JoinClient people={Array.from(people.values())} />
    </div>
  );
}
