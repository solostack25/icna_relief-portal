import { createAdminClient } from "@/lib/supabase/server";
import { getReportsAccess } from "@/lib/reportsAccess";

// Who can see Insights and how far:
//   admin / program director → everything
//   regional director        → their region only
//   area manager             → their own office only (its goals, budget, numbers)
export type InsightsAccess =
  | { ok: false; status: number }
  | { ok: true; employeeId: string; isAdmin: boolean; lockedRegion: string | null; lockedOffice: string | null };

export async function getInsightsAccess(): Promise<InsightsAccess> {
  const a = await getReportsAccess();
  if (!a.ok) return { ok: false, status: a.status };
  const role = a.role as string;
  if (a.isAdmin || role === "program_director") return { ok: true, employeeId: a.employeeId, isAdmin: a.isAdmin, lockedRegion: null, lockedOffice: null };
  if (role === "regional_director") {
    if (!a.assignedRegion) return { ok: false, status: 403 };
    return { ok: true, employeeId: a.employeeId, isAdmin: false, lockedRegion: a.assignedRegion, lockedOffice: null };
  }
  if (role === "area_manager" && a.assignedOfficeId) {
    const { data: o } = await createAdminClient().from("b2s_offices").select("region").eq("id", a.assignedOfficeId).maybeSingle();
    return { ok: true, employeeId: a.employeeId, isAdmin: false, lockedRegion: (o?.region as string) ?? null, lockedOffice: a.assignedOfficeId };
  }
  return { ok: false, status: 403 };
}
