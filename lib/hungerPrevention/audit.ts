import type { SupabaseClient } from "@supabase/supabase-js";

// Ported from Houston_Automation's lib/audit.ts unchanged - best-effort,
// a failed audit write should never block the actual staff action it's
// logging.
export async function logAudit(
  supabase: SupabaseClient,
  employeeId: string | null,
  action: string,
  entityType: string,
  entityId: string | null,
  detail?: Record<string, unknown>
) {
  try {
    await supabase.from("distribution_audit_log").insert({
      employee_id: employeeId,
      action,
      entity_type: entityType,
      entity_id: entityId,
      detail: detail ?? null,
    });
  } catch {
    // swallow — logging failures shouldn't surface to staff mid-workflow
  }
}
