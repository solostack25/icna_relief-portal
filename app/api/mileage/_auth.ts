import { createClient } from "@/lib/supabase/server";

export async function requireEmployee() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, status: 401 as const };
  const { data: me } = await supabase.from("employees").select("id, assigned_office_id").eq("auth_user_id", user.id).single();
  if (!me) return { ok: false as const, status: 401 as const };
  return { ok: true as const, supabase, employeeId: me.id as string, assignedOfficeId: (me.assigned_office_id as string | null) ?? null };
}

export const DRIVE_COLUMNS =
  "id, employee_id, status, started_at, ended_at, start_lat, start_lng, start_address_line1, start_city, start_state, start_zip_code, end_lat, end_lng, end_address_line1, end_city, end_state, end_zip_code, route_miles, route_provider, gps_miles, gps_points, round_trip, miles, miles_adjusted, adjusted_reason, purpose, billing_office_id, billing_program, finance_ticket_id, submitted_at";

export function validCoord(lat: unknown, lng: unknown): lat is number {
  return typeof lat === "number" && typeof lng === "number" && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 && !(lat === 0 && lng === 0);
}
