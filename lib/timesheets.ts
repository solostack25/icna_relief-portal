import { createAdminClient } from "@/lib/supabase/server";
import { addDays, buildWeek, type LeaveType, type WeekRow } from "@/lib/timeOffShared";

// Server-only. Builds weekly timesheets from portal clock in/out
// (time_clock_entries) plus approved time off.

export type TimesheetApproval = {
  employee_id: string;
  total_hours: number;
  approved_at: string;
  adp_sync_status: string;
};

export async function loadWeeks(
  employeeIds: string[],
  weekStart: string
): Promise<{ rows: Map<string, WeekRow>; approvals: Map<string, TimesheetApproval> }> {
  const rows = new Map<string, WeekRow>();
  const approvals = new Map<string, TimesheetApproval>();
  if (employeeIds.length === 0) return { rows, approvals };

  const admin = createAdminClient();
  const weekEnd = addDays(weekStart, 6);
  // Pad a day each side so punches near midnight in other zones are caught;
  // buildWeek drops anything that isn't actually in the week.
  const from = `${addDays(weekStart, -1)}T00:00:00Z`;
  const to = `${addDays(weekEnd, 2)}T00:00:00Z`;

  const [{ data: punches }, { data: offs }, { data: apps }] = await Promise.all([
    admin
      .from("time_clock_entries")
      .select("employee_id, clock_in_at, clock_out_at")
      .in("employee_id", employeeIds)
      .gte("clock_in_at", from)
      .lt("clock_in_at", to),
    admin
      .from("hr_time_off_requests")
      .select("employee_id, leave_type, start_date, end_date, hours")
      .in("employee_id", employeeIds)
      .eq("status", "approved")
      .lte("start_date", weekEnd)
      .gte("end_date", weekStart),
    admin
      .from("hr_timesheet_approvals")
      .select("employee_id, total_hours, approved_at, adp_sync_status")
      .in("employee_id", employeeIds)
      .eq("week_start", weekStart),
  ]);

  type P = { employee_id: string; clock_in_at: string; clock_out_at: string | null };
  type O = { employee_id: string; leave_type: LeaveType; start_date: string; end_date: string; hours: number };
  for (const id of employeeIds) {
    rows.set(
      id,
      buildWeek(
        weekStart,
        ((punches ?? []) as P[]).filter((p) => p.employee_id === id),
        ((offs ?? []) as O[]).filter((o) => o.employee_id === id)
      )
    );
  }
  for (const a of (apps ?? []) as TimesheetApproval[]) approvals.set(a.employee_id, a);
  return { rows, approvals };
}
