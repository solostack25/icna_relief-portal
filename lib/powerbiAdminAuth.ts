import { createClient } from "@/lib/supabase/server";

// Admin-only gate for the Power BI check API routes.
export async function requirePowerBiAdmin(): Promise<{ id: string } | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: me } = await supabase.from("employees").select("id, role").eq("auth_user_id", user.id).single();
  if (!me || me.role !== "admin") return null;
  return { id: me.id as string };
}

export function parsePeriod(year: unknown, month: unknown): { year: number; month: number | null } {
  const now = new Date().getFullYear();
  const y = Number(year);
  const m = Number(month);
  return {
    year: Number.isInteger(y) && y >= 2000 && y <= 2100 ? y : now,
    month: Number.isInteger(m) && m >= 1 && m <= 12 ? m : null,
  };
}

// Validates the metric editor's form body.
export function cleanMetric(body: Record<string, unknown>) {
  const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const out = {
    label: str(body.label),
    report_key: str(body.report_key),
    kpi_label: str(body.kpi_label),
    dataset_id: str(body.dataset_id),
    dataset_name: str(body.dataset_name) || null,
    dax: str(body.dax),
    tolerance_pct: Math.min(100, Math.max(0, Number(body.tolerance_pct ?? 1) || 0)),
    is_active: body.is_active !== false,
    sort: Number.isInteger(Number(body.sort)) ? Number(body.sort) : 0,
    notes: str(body.notes) || null,
  };
  const missing = (["label", "report_key", "kpi_label", "dataset_id", "dax"] as const).filter((k) => !out[k]);
  return { out, missing };
}
