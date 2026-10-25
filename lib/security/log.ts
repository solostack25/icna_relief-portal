import { createAdminClient } from "@/lib/supabase/server";

export async function logSecurityAction(e: {
  targetType: "user" | "incident" | "device" | "indicator";
  targetId: string;
  targetName?: string | null;
  action: string;
  actorId: string;
  reason?: string | null;
  ok: boolean;
  detail?: unknown;
}) {
  await createAdminClient()
    .from("sec_action_log")
    .insert({
      target_type: e.targetType,
      target_id: e.targetId,
      target_name: e.targetName ?? null,
      action: e.action,
      actor_id: e.actorId,
      reason: e.reason ?? null,
      ok: e.ok,
      detail: e.detail ?? null,
    });
}

export { SEC_ACTION_LABELS } from "./labels";
