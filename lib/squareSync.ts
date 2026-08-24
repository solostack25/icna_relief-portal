import { createAdminClient } from "@/lib/supabase/server";
import { getSquareAccessToken, isSquareConfigured, listSquarePayments } from "@/lib/square";

// Shared by the manual "Sync Payments Now" button (Connectors page) and
// the daily cron - pulls Square payments created since the last synced
// payment (falls back to 90 days back on a first-ever sync), resolves
// each to an office via square_location_map, and upserts. Only
// COMPLETED payments count as revenue; other statuses (e.g. FAILED,
// CANCELED) are still stored so refund/dispute history is visible, but
// excluded from the Revenue page's totals there.
export async function syncSquarePayments(): Promise<{ synced: number; error?: string }> {
  const token = await getSquareAccessToken();
  if (!isSquareConfigured(token)) return { synced: 0, error: "Square Access Token not set" };

  const admin = createAdminClient();

  const { data: lastSynced } = await admin
    .from("square_payments")
    .select("square_created_at")
    .order("square_created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const beginTime = lastSynced?.square_created_at
    ? new Date(lastSynced.square_created_at).toISOString()
    : new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();

  const { data: locationMap } = await admin.from("square_location_map").select("square_location_id, office_id");
  const officeByLocation = new Map((locationMap ?? []).map((m: { square_location_id: string; office_id: string | null }) => [m.square_location_id, m.office_id]));

  try {
    const payments = await listSquarePayments(token, beginTime);
    if (payments.length === 0) return { synced: 0 };

    const rows = payments.map((p) => ({
      square_payment_id: p.id,
      square_location_id: p.locationId,
      office_id: p.locationId ? officeByLocation.get(p.locationId) ?? null : null,
      amount: p.amount,
      currency: p.currency,
      status: p.status,
      note: p.note,
      square_created_at: p.createdAt,
      synced_at: new Date().toISOString(),
    }));

    const { error } = await admin.from("square_payments").upsert(rows, { onConflict: "square_payment_id" });
    if (error) return { synced: 0, error: error.message };

    return { synced: rows.length };
  } catch (e) {
    return { synced: 0, error: e instanceof Error ? e.message : "Square sync failed" };
  }
}
