import { createAdminClient } from "@/lib/supabase/server";
import { dim } from "../style";
import CleanupClient, { type CleanupRow } from "./CleanupClient";

export const dynamic = "force-dynamic";

// Stale devices: enabled in Entra but not seen for a long time, plus
// what's already been disabled (to undo, or to delete later in Entra).
export default async function CleanupPage() {
  const admin = createAdminClient();
  const rows: CleanupRow[] = [];
  for (let from = 0; ; from += 1000) {
    const { data } = await admin
      .from("it_devices")
      .select("device_key, display_name, operating_system, trust_type, coverage, owner_name, owner_upn, approx_last_sign_in, intune_last_sync, registered_at, account_enabled, intune_id, entra_object_id")
      .is("removed_at", null)
      .not("entra_object_id", "is", null)
      .range(from, from + 999);
    rows.push(...((data ?? []) as CleanupRow[]));
    if (!data || data.length < 1000) break;
  }

  const { data: disabledLog } = await admin
    .from("it_device_audit")
    .select("device_key, created_at")
    .eq("action", "disable")
    .eq("ok", true)
    .order("created_at", { ascending: false })
    .limit(2000);
  const disabledAt: Record<string, string> = {};
  for (const r of (disabledLog ?? []) as { device_key: string; created_at: string }[]) if (!disabledAt[r.device_key]) disabledAt[r.device_key] = r.created_at;

  return (
    <div className="max-w-6xl">
      <h1 style={{ fontFamily: "'Fraunces', serif", fontStyle: "italic", fontWeight: 500, fontSize: 30, margin: 0 }}>Stale device cleanup</h1>
      <p className="text-sm mt-1 mb-5 max-w-3xl" style={{ color: dim }}>
        Devices still enabled in Entra that nobody has used in a long time: old, reimaged, lost or duplicate. Disabling stops them signing in and is fully reversible. Microsoft recommends
        waiting about 30 days after disabling before deleting them in Entra; deleting also deletes their BitLocker keys.
      </p>
      <CleanupClient rows={rows} disabledAt={disabledAt} />
    </div>
  );
}
