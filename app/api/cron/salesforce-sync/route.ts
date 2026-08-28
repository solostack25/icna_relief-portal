import { NextRequest, NextResponse } from "next/server";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { getReportModule } from "@/lib/reports/registry";
import { mapRowToSalesforceFields, pushRecordToSalesforce, type SalesforceSyncTarget } from "@/lib/salesforce";

// Runs daily (see vercel.json), same isDueToday cadence logic as
// app/api/cron/report-schedule - a target's own `schedule` field
// decides whether today is actually a sync day.
function isDueToday(schedule: string): boolean {
  const chicagoNow = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Chicago" }));
  if (schedule === "daily") return true;
  if (schedule === "weekly") return chicagoNow.getDay() === 1;
  if (schedule === "monthly") return chicagoNow.getDate() === 1;
  return false;
}

async function runSalesforceSync() {
  const admin = createAdminClient();

  const { data: targets } = await admin.from("salesforce_sync_targets").select("*").eq("is_active", true);

  const results: { target_id: string; food_bank_name: string; status: string; pushed?: number; failed?: number }[] = [];

  for (const target of targets ?? []) {
    if (!isDueToday(target.schedule)) continue;

    const mod = getReportModule(target.source_module);
    if (!mod) {
      results.push({ target_id: target.id, food_bank_name: target.food_bank_name, status: "skipped: unknown source_module" });
      continue;
    }

    // Source rows for this target's office, scoped the same way a
    // report would be (direct office_id or via the module's scope
    // chain) - reusing the module's own table/scope keeps this in
    // sync with however that module is defined, rather than
    // duplicating office-resolution logic here.
    let officeFilterColumn: string | null = null;
    let officeFilterIds: string[] = [target.office_id];
    if (mod.scope.type === "direct") {
      officeFilterColumn = mod.scope.officeColumn;
    } else if (mod.scope.type === "chain") {
      let currentIds = officeFilterIds;
      for (const hop of mod.scope.hops) {
        const filterCol = "officeColumn" in hop ? hop.officeColumn : hop.filterColumn;
        const { data: rows } = await admin.from(hop.table).select(hop.idColumn).in(filterCol, currentIds);
        currentIds = ((rows ?? []) as unknown as Record<string, unknown>[]).map((r) => String(r[hop.idColumn]));
        if (currentIds.length === 0) break;
      }
      officeFilterColumn = mod.scope.finalRefColumn;
      officeFilterIds = currentIds;
    }

    if (!officeFilterColumn || officeFilterIds.length === 0) {
      results.push({ target_id: target.id, food_bank_name: target.food_bank_name, status: "skipped: source module isn't office-scoped, or no matching rows" });
      continue;
    }

    // Already-synced ids for this target, so re-running doesn't
    // double-push - checked against salesforce_sync_log rather than a
    // "synced" flag on the source table, since a source row may be
    // synced to more than one target in principle.
    const { data: alreadySynced } = await admin
      .from("salesforce_sync_log")
      .select("source_record_id")
      .eq("target_id", target.id)
      .eq("status", "success");
    const syncedIds = new Set((alreadySynced ?? []).map((r: { source_record_id: string }) => r.source_record_id));

    const { data: sourceRows } = await admin.from(mod.table).select("*").in(officeFilterColumn, officeFilterIds).limit(500);

    const pending = (sourceRows ?? []).filter((r: { id: string }) => !syncedIds.has(r.id));

    let pushed = 0;
    let failed = 0;
    for (const row of pending) {
      const fields = mapRowToSalesforceFields(row, target.field_mapping);
      try {
        const pushResult = await pushRecordToSalesforce(target as SalesforceSyncTarget, fields);
        await admin.from("salesforce_sync_log").insert({
          target_id: target.id,
          source_record_id: row.id,
          status: "success",
          salesforce_record_id: pushResult.id,
        });
        pushed++;
      } catch (err) {
        await admin.from("salesforce_sync_log").insert({
          target_id: target.id,
          source_record_id: row.id,
          status: "error",
          error_message: err instanceof Error ? err.message.slice(0, 500) : "Unknown error",
        });
        failed++;
      }
    }

    results.push({ target_id: target.id, food_bank_name: target.food_bank_name, status: "checked", pushed, failed });
  }

  return { checked_targets: (targets ?? []).length, results };
}

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const expected = `Bearer ${process.env.CRON_SECRET}`;
  if (!process.env.CRON_SECRET || authHeader !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const result = await runSalesforceSync();
  return NextResponse.json(result);
}

export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: me } = await supabase.from("employees").select("role").eq("auth_user_id", user.id).single();
  if (me?.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const result = await runSalesforceSync();
  return NextResponse.json(result);
}
