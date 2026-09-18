import type { SupabaseClient } from "@supabase/supabase-js";
import { ORLANDO_OFFICE_ID } from "./config";

// Houston_Automation's lib/audit.ts, plus office_id so the Orlando audit
// page only shows Orlando's trail (distribution_audit_log is shared).
export async function logAudit(
  supabase: SupabaseClient,
  employeeId: string | null,
  action: string,
  entityType: string,
  entityId: string | null,
  detail?: Record<string, unknown>
) {
  // Best-effort — a failed audit write should never block the actual staff action.
  try {
    await supabase.from("distribution_audit_log").insert({
      employee_id: employeeId,
      action,
      entity_type: entityType,
      entity_id: entityId,
      detail: detail ?? null,
      office_id: ORLANDO_OFFICE_ID,
    });
  } catch {
    // swallow — logging failures shouldn't surface to staff mid-workflow
  }
}
