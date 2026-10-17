import webpush from "web-push";
import type { SupabaseClient } from "@supabase/supabase-js";

// Server-only. Sends push notifications to staff phones that turned them on
// (see components/PwaSetup.tsx and app/api/push/subscribe). Uses the
// service-role client: subscription rows are never readable from browsers.

export type PushAudience =
  | { type: "everyone" }
  | { type: "office"; officeId: string }
  | { type: "region"; region: string }
  | { type: "role"; role: string }
  | { type: "people"; employeeIds: string[] };

export type PushPayload = { title: string; body: string; url?: string | null; tag?: string };

let configured = false;
export function pushConfigured() {
  return Boolean(
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY
  );
}
function configure() {
  if (configured) return;
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || "mailto:it@icnarelief.org",
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!
  );
  configured = true;
}

/** Active staff in the audience (ids). */
export async function resolveAudience(admin: SupabaseClient, audience: PushAudience): Promise<string[]> {
  let q = admin.from("employees").select("id, assigned_office_id").eq("is_active", true);
  if (audience.type === "office") q = q.eq("assigned_office_id", audience.officeId);
  if (audience.type === "role") q = q.eq("role", audience.role);
  if (audience.type === "people") q = q.in("id", audience.employeeIds.length ? audience.employeeIds : ["00000000-0000-0000-0000-000000000000"]);
  const { data: emps, error } = await q;
  if (error) throw error;
  let rows = (emps ?? []) as { id: string; assigned_office_id: string | null }[];

  if (audience.type === "region") {
    const { data: offices } = await admin.from("b2s_offices").select("id").eq("region", audience.region);
    const ids = new Set((offices ?? []).map((o: { id: string }) => o.id));
    rows = rows.filter((r) => r.assigned_office_id && ids.has(r.assigned_office_id));
  }
  return rows.map((r) => r.id);
}

/** People and phones an audience would reach (for the preview line). */
export async function countAudience(admin: SupabaseClient, audience: PushAudience) {
  const people = await resolveAudience(admin, audience);
  if (people.length === 0) return { people: 0, peopleWithDevices: 0, devices: 0 };
  const subs = await subscriptionsFor(admin, people);
  return {
    people: people.length,
    peopleWithDevices: new Set(subs.map((s) => s.employee_id)).size,
    devices: subs.length,
  };
}

type SubRow = { id: string; employee_id: string; endpoint: string; p256dh: string; auth: string; failure_count: number };

async function subscriptionsFor(admin: SupabaseClient, employeeIds: string[]): Promise<SubRow[]> {
  const out: SubRow[] = [];
  // Chunk to keep the IN (...) list reasonable.
  for (let i = 0; i < employeeIds.length; i += 200) {
    const { data, error } = await admin
      .from("portal_push_subscriptions")
      .select("id, employee_id, endpoint, p256dh, auth, failure_count")
      .in("employee_id", employeeIds.slice(i, i + 200));
    if (error) throw error;
    out.push(...((data ?? []) as SubRow[]));
  }
  return out;
}

/**
 * Send to every phone of the given staff. Phones that have uninstalled
 * the app or turned notifications off (404/410) are removed; other
 * failures are counted and the phone is dropped after 5 in a row.
 */
export async function sendToEmployees(admin: SupabaseClient, employeeIds: string[], payload: PushPayload) {
  configure();
  const subs = await subscriptionsFor(admin, employeeIds);
  const body = JSON.stringify({
    title: payload.title,
    body: payload.body,
    url: payload.url || "/select-app",
    tag: payload.tag,
  });

  let delivered = 0;
  let failed = 0;
  const gone: string[] = [];
  const succeeded: string[] = [];
  const bumped: SubRow[] = [];

  // A few at a time so a big send doesn't open hundreds of connections.
  const CONCURRENCY = 20;
  for (let i = 0; i < subs.length; i += CONCURRENCY) {
    await Promise.all(
      subs.slice(i, i + CONCURRENCY).map(async (s) => {
        try {
          await webpush.sendNotification(
            { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
            body,
            { TTL: 60 * 60 * 24, urgency: "normal" }
          );
          delivered++;
          succeeded.push(s.id);
        } catch (err: unknown) {
          failed++;
          const status = (err as { statusCode?: number })?.statusCode;
          if (status === 404 || status === 410) gone.push(s.id);
          else bumped.push(s);
        }
      })
    );
  }

  if (gone.length) await admin.from("portal_push_subscriptions").delete().in("id", gone);
  if (succeeded.length) {
    await admin
      .from("portal_push_subscriptions")
      .update({ last_success_at: new Date().toISOString(), failure_count: 0 })
      .in("id", succeeded);
  }
  for (const s of bumped) {
    if (s.failure_count + 1 >= 5) await admin.from("portal_push_subscriptions").delete().eq("id", s.id);
    else await admin.from("portal_push_subscriptions").update({ failure_count: s.failure_count + 1 }).eq("id", s.id);
  }

  return { devices: subs.length, delivered, failed, removed: gone.length };
}
