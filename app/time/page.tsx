import { redirect } from "next/navigation";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { fullName, getMe, managesTime, pendingTimeOffCount } from "@/lib/timeOff";
import { addDays, buildWeek, mondayOf, todayIn } from "@/lib/timeOffShared";
import { adpConfigured } from "@/lib/adp";
import TimeClient, { type MyRequest } from "./TimeClient";

export const dynamic = "force-dynamic";

// Time off for the signed-in employee: balances, a new request, their
// requests, and this week's clocked hours. Managers get a link to /time/team.
export default async function TimePage() {
  const me = await getMe();
  if (!me) redirect("/");

  const supabase = await createClient();
  const today = todayIn();
  const weekStart = mondayOf(today);

  const [{ data: requests }, { data: balances }, { data: punches }, isManager, adpOn] = await Promise.all([
    supabase
      .from("hr_time_off_requests")
      .select("id, leave_type, start_date, end_date, hours, note, status, approver_email, adp_sync_status, created_at, decision_note")
      .eq("employee_id", me.id)
      .gte("end_date", addDays(today, -365))
      .order("start_date", { ascending: false }),
    supabase.from("hr_time_off_balances").select("leave_type, hours_available, as_of, source").eq("employee_id", me.id),
    supabase
      .from("time_clock_entries")
      .select("clock_in_at, clock_out_at")
      .eq("employee_id", me.id)
      .gte("clock_in_at", `${addDays(weekStart, -1)}T00:00:00Z`),
    managesTime(me).catch(() => false),
    adpConfigured().catch(() => false),
  ]);

  const teamWaiting = isManager ? await pendingTimeOffCount(me).catch(() => 0) : 0;

  // Who new requests go to, by name when we know them.
  let approverName: string | null = null;
  if (me.manager_email) {
    const { data } = await createAdminClient()
      .from("employees")
      .select("first_name, last_name")
      .ilike("email", me.manager_email.replace(/[\\%_]/g, (m: string) => `\\${m}`))
      .maybeSingle();
    approverName = data ? fullName(data) : me.manager_email;
  }

  const myApprovedThisWeek = (requests ?? []).filter(
    (r) => r.status === "approved" && r.start_date <= addDays(weekStart, 6) && r.end_date >= weekStart
  );
  const week = buildWeek(weekStart, punches ?? [], myApprovedThisWeek);

  return (
    <TimeClient
      firstName={me.first_name}
      requests={(requests ?? []) as MyRequest[]}
      balances={(balances ?? []).map((b) => ({ leave_type: b.leave_type, hours: Number(b.hours_available), as_of: b.as_of, source: b.source }))}
      week={week}
      today={today}
      approverName={approverName}
      isManager={isManager}
      teamWaiting={teamWaiting}
      adpConnected={adpOn}
      isAdmin={me.role === "admin"}
    />
  );
}
