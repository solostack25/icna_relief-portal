import { NextRequest, NextResponse } from "next/server";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { getOrlandoAutomationAccess } from "@/lib/orlandoAutomation/access";
import { ORLANDO_OFFICE_ID } from "@/lib/orlandoAutomation/config";
import { mapRowToSalesforceFields, pushRecordToSalesforce, type SalesforceSyncTarget } from "@/lib/salesforce";

export const dynamic = "force-dynamic";

// Pushes Live Distribution rows (one, or "push all") into the food bank's
// Salesforce through the portal's existing sync framework: whichever active
// salesforce_sync_targets row is set up for Orlando with source_module
// 'live-distribution' decides the org, object and field mapping (Admin ->
// Salesforce Sync). No food-bank-specific code lives here.
//
// Only rows answered "Yes, food distributed" are pushed, and a row that
// already went through successfully is never sent twice.

type EntryRow = {
  id: string;
  distribution_id: string;
  client_id: string;
  food_distributed: boolean | null;
  poultry_lbs: number | null;
  meat_lbs: number | null;
  grocery_lbs: number | null;
  scanned_at: string;
  salesforce_status: string;
};

export async function POST(req: NextRequest) {
  const access = await getOrlandoAutomationAccess();
  if (!access.ok) return NextResponse.json({ error: "Forbidden" }, { status: access.status });

  const body = await req.json().catch(() => null);
  const entryIds: string[] = Array.isArray(body?.entryIds) ? body.entryIds.filter((x: unknown) => typeof x === "string") : [];
  if (entryIds.length === 0) return NextResponse.json({ error: "entryIds is required" }, { status: 400 });
  if (entryIds.length > 500) return NextResponse.json({ error: "Push at most 500 rows at a time" }, { status: 400 });

  const admin = createAdminClient();
  const { data: target } = await admin
    .from("salesforce_sync_targets")
    .select("*")
    .eq("office_id", ORLANDO_OFFICE_ID)
    .eq("source_module", "live-distribution")
    .eq("is_active", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!target) {
    return NextResponse.json(
      {
        error:
          "Salesforce isn't set up for Orlando's live distributions yet. An admin needs to add an active target in Admin → Salesforce Sync (office: Orlando Office, source: Live Distribution — Clients Served).",
      },
      { status: 409 }
    );
  }

  // Entries through the signed-in user's client, so RLS confirms they can
  // actually see these rows; then pinned to Orlando.
  const supabase = await createClient();
  const { data: entries } = await supabase
    .from("live_distribution_entries")
    .select("id, distribution_id, client_id, food_distributed, poultry_lbs, meat_lbs, grocery_lbs, scanned_at, salesforce_status")
    .in("id", entryIds)
    .eq("office_id", ORLANDO_OFFICE_ID);

  const rows = (entries ?? []) as EntryRow[];
  const clientIds = Array.from(new Set(rows.map((r) => r.client_id)));
  const distIds = Array.from(new Set(rows.map((r) => r.distribution_id)));

  const [{ data: clients }, { data: dists }] = await Promise.all([
    clientIds.length
      ? admin
          .from("clients")
          .select("id, first_name, last_name, client_number, dob, phone, zip, household_key, dietary_preference, food_bank_client_id")
          .in("id", clientIds)
      : Promise.resolve({ data: [] }),
    distIds.length
      ? admin.from("live_distributions").select("id, name, distribution_date").in("id", distIds)
      : Promise.resolve({ data: [] }),
  ]);
  const clientById = new Map<string, Record<string, unknown>>(
    ((clients ?? []) as Record<string, unknown>[]).map((c) => [String(c.id), c])
  );
  const distById = new Map<string, Record<string, unknown>>(
    ((dists ?? []) as Record<string, unknown>[]).map((d) => [String(d.id), d])
  );

  // Household size for unified-intake households (members share household_key).
  const householdKeys = Array.from(
    new Set(((clients ?? []) as { household_key: string | null }[]).map((c) => c.household_key).filter(Boolean))
  ) as string[];
  const householdSize = new Map<string, number>();
  if (householdKeys.length) {
    const { data: members } = await admin.from("clients").select("household_key").in("household_key", householdKeys);
    for (const m of members ?? []) householdSize.set(m.household_key, (householdSize.get(m.household_key) ?? 0) + 1);
  }

  const results: { id: string; status: "success" | "error" | "skipped"; message?: string; salesforce_record_id?: string }[] = [];

  for (const entry of rows) {
    if (entry.food_distributed !== true) {
      results.push({ id: entry.id, status: "skipped", message: "Food wasn't marked as distributed" });
      continue;
    }
    if (entry.salesforce_status === "success") {
      results.push({ id: entry.id, status: "skipped", message: "Already pushed" });
      continue;
    }

    const client: Record<string, unknown> = clientById.get(entry.client_id) ?? {};
    const dist: Record<string, unknown> = distById.get(entry.distribution_id) ?? {};
    const poultry = Number(entry.poultry_lbs ?? 0);
    const meat = Number(entry.meat_lbs ?? 0);
    const grocery = Number(entry.grocery_lbs ?? 0);

    // Flat row the target's field_mapping picks from (sourceColumn names).
    const source: Record<string, unknown> = {
      ...entry,
      total_lbs: poultry + meat + grocery,
      distribution_name: dist.name ?? null,
      distribution_date: dist.distribution_date ?? null,
      food_bank_name: target.food_bank_name,
      client_first_name: client.first_name ?? null,
      client_last_name: client.last_name ?? null,
      client_number: client.client_number ?? null,
      client_dob: client.dob ?? null,
      client_phone: client.phone ?? null,
      client_zip: client.zip ?? null,
      client_dietary_preference: client.dietary_preference ?? null,
      food_bank_client_id: client.food_bank_client_id ?? null,
      household_size: client.household_key ? householdSize.get(client.household_key as string) ?? 1 : 1,
    };

    const fields = mapRowToSalesforceFields(source, target.field_mapping ?? []);
    const now = new Date().toISOString();

    try {
      const pushed = await pushRecordToSalesforce(target as SalesforceSyncTarget, fields);
      await supabase
        .from("live_distribution_entries")
        .update({ salesforce_status: "success", salesforce_record_id: pushed.id, salesforce_error: null, salesforce_pushed_at: now })
        .eq("id", entry.id);
      await admin.from("salesforce_sync_log").insert({
        target_id: target.id,
        source_record_id: entry.id,
        status: "success",
        salesforce_record_id: pushed.id,
      });
      results.push({ id: entry.id, status: "success", salesforce_record_id: pushed.id });
    } catch (err) {
      const message = err instanceof Error ? err.message.slice(0, 500) : "Unknown error";
      await supabase
        .from("live_distribution_entries")
        .update({ salesforce_status: "error", salesforce_error: message, salesforce_pushed_at: now })
        .eq("id", entry.id);
      await admin.from("salesforce_sync_log").insert({
        target_id: target.id,
        source_record_id: entry.id,
        status: "error",
        error_message: message,
      });
      results.push({ id: entry.id, status: "error", message });
    }
  }

  return NextResponse.json({
    pushed: results.filter((r) => r.status === "success").length,
    failed: results.filter((r) => r.status === "error").length,
    skipped: results.filter((r) => r.status === "skipped").length,
    results,
  });
}
