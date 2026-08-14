import { createAdminClient } from "@/lib/supabase/server";

// DB-first, env-var fallback. Lets an admin rotate a credential through
// the UI (see app/admin/dropbox) without needing a code deploy - but
// still works if nothing's been set in the DB yet, using whatever's in
// Vercel's env vars, so this is a strict upgrade, not a breaking change
// for any integration that hasn't been migrated to DB-managed settings.
export async function getIntegrationSetting(key: string, envFallback?: string): Promise<string | null> {
  const admin = createAdminClient();
  const { data } = await admin.from("integration_settings").select("value").eq("key", key).maybeSingle();
  if (data?.value) return data.value;
  return envFallback ?? null;
}

export async function setIntegrationSetting(key: string, value: string, updatedBy: string): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin
    .from("integration_settings")
    .upsert({ key, value, updated_by: updatedBy, updated_at: new Date().toISOString() });
  if (error) throw new Error(error.message);
}
