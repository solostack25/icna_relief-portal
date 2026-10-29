import { createAdminClient } from "@/lib/supabase/server";
import { getIntegrationSetting } from "@/lib/integrationSettings";

// ADP Workforce Now connection - built ahead of access.
//
// Time off requests and timesheets work entirely inside the portal today.
// Each approved item is marked adp_sync_status = 'queued'. Once ICNA Relief
// has ADP API access (a partner/API Central project with a client ID,
// secret, and the mutual-TLS certificate ADP issues), an admin pastes them
// under Admin > Connectors > ADP and queued items can be sent.
//
// What still needs doing when credentials arrive (deliberately not guessed
// at here, because it depends on ICNA's ADP setup):
//   1. Map each employee to their ADP associate OID (AOID). The plan is a
//      one-time match by work email via /hr/v2/workers, stored on employees.
//   2. Confirm which time-off policy codes ICNA uses (vacation/sick/personal
//      names differ per company) and the time/timecard endpoints enabled
//      on the account.
// Until both exist, sendQueuedToAdp() leaves everything queued with a
// clear reason instead of failing approvals.

export const ADP_SETTING_KEYS = {
  clientId: "adp_client_id",
  clientSecret: "adp_client_secret",
  certB64: "adp_ssl_cert_b64",
  keyB64: "adp_ssl_key_b64",
} as const;

export async function adpConfigured(): Promise<boolean> {
  const [id, secret, cert, key] = await Promise.all([
    getIntegrationSetting(ADP_SETTING_KEYS.clientId, process.env.ADP_CLIENT_ID),
    getIntegrationSetting(ADP_SETTING_KEYS.clientSecret, process.env.ADP_CLIENT_SECRET),
    getIntegrationSetting(ADP_SETTING_KEYS.certB64, process.env.ADP_SSL_CERT_B64),
    getIntegrationSetting(ADP_SETTING_KEYS.keyB64, process.env.ADP_SSL_KEY_B64),
  ]);
  return !!(id && secret && cert && key);
}

export type AdpSyncResult = { sent: number; stillQueued: number; reason: string | null };

/**
 * Tries to send queued time off and timesheets to ADP. Never throws -
 * an ADP problem must not undo or block an approval in the portal.
 */
export async function sendQueuedToAdp(): Promise<AdpSyncResult> {
  const admin = createAdminClient();
  const [{ count: offCount }, { count: tsCount }] = await Promise.all([
    admin.from("hr_time_off_requests").select("id", { count: "exact", head: true }).eq("adp_sync_status", "queued"),
    admin.from("hr_timesheet_approvals").select("id", { count: "exact", head: true }).eq("adp_sync_status", "queued"),
  ]);
  const stillQueued = (offCount ?? 0) + (tsCount ?? 0);

  if (!(await adpConfigured())) {
    return { sent: 0, stillQueued, reason: "ADP isn't connected yet. Approved items stay queued until it is." };
  }
  return {
    sent: 0,
    stillQueued,
    reason: "ADP credentials are saved, but employee-to-ADP ID matching and time-off policy codes aren't set up yet.",
  };
}
