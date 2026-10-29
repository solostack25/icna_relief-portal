import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/server";
import { fullName, getMe, getTeam, managesTime } from "@/lib/timeOff";
import { loadWeeks } from "@/lib/timesheets";
import { addDays, mondayOf, overlaps, todayIn, type LeaveType, type RequestStatus } from "@/lib/timeOffShared";
import { adpConfigured } from "@/lib/adp";
import TeamTimeClient, { type TeamRequest, type OutItem, type SheetRow } from "./TeamTimeClient";

export const dynamic = "force-dynamic";

type Row = {
  id: string;
  employee_id: string;
  leave_type: LeaveType;
  start_date: string;
  end_date: string;
  hours: number;
  note: string | null;
  status: RequestStatus;
  approver_email: string | null;
  decided_at: string | null;
  decided_by: string | null;
  adp_sync_status: string;
  created_at: string;
};

// Managers: approve time off and weekly timesheets for the people who
// report to them. Admins see everyone.
export default async function TeamTimePage({ searchParams }: { searchParams: { tab?: string; week?: string } }) {
  const me = await getMe();
  if (!me) redirect("/");
  if (!(await managesTime(me))) redirect("/time");

  const admin = createAdminClient();
  const today = todayIn();
  const tab = searchParams.tab === "timesheets" ? "timesheets" : "timeoff";
  const requestedWeek = /^\d{4}-\d{2}-\d{2}$/.test(searchParams.week ?? "") ? mondayOf(searchParams.week!) : null;
  // Default to last week - the one that's finished and ready to approve.
  const weekStart = requestedWeek ?? addDays(mondayOf(today), -7);

  const { members, allStaff } = await getTeam(me);
  const isAdmin = me.role === "admin";
  const emailLike = me.email.toLowerCase().replace(/[\\%_]/g, (m) => `\\${m}`);

  // Requests this person decides: routed to them, or (admins) anything.
  let reqQ = admin
    .from("hr_time_off_requests")
    .select("id, employee_id, leave_type, start_date, end_date, hours, note, status, approver_email, decided_at, decided_by, adp_sync_status, created_at")
    .neq("employee_id", me.id)
    .or(`status.eq.pending,and(decided_at.gte.${addDays(today, -30)},status.in.(approved,denied))`)
    .order("start_date");
  if (!isAdmin) reqQ = reqQ.ilike("approver_email", emailLike);
  const { data: reqRows } = await reqQ;
  const requests = (reqRows ?? []) as Row[];

  // Everyone involved: requesters plus the team.
  const peopleIds = Array.from(new Set([...requests.map((r) => r.employee_id), ...members.map((m) => m.id)]));
  type Person = { id: string; first_name: string; last_name: string; job_title: string | null };
  type Bal = { employee_id: string; leave_type: LeaveType; hours_available: number };
  type Off = { id: string; employee_id: string; leave_type: LeaveType; start_date: string; end_date: string; hours: number; status: RequestStatus };
  let people: Person[] = [];
  let balances: Bal[] = [];
  let upcomingOff: Off[] = [];
  if (peopleIds.length) {
    const [p, b, o] = await Promise.all([
      admin.from("employees").select("id, first_name, last_name, job_title").in("id", peopleIds),
      admin.from("hr_time_off_balances").select("employee_id, leave_type, hours_available").in("employee_id", peopleIds),
      admin
        .from("hr_time_off_requests")
        .select("id, employee_id, leave_type, start_date, end_date, hours, status")
        .in("employee_id", peopleIds)
        .in("status", ["pending", "approved"])
        .gte("end_date", addDays(today, -1)),
    ]);
    people = (p.data ?? []) as Person[];
    balances = (b.data ?? []) as Bal[];
    upcomingOff = (o.data ?? []) as Off[];
  }
  const personBy = new Map(people.map((p) => [p.id, p]));
  const nameOf = (id: string) => {
    const p = personBy.get(id);
    return p ? fullName(p) : "Someone";
  };
  const balanceOf = (id: string, t: LeaveType) => {
    const b = balances.find((x) => x.employee_id === id && x.leave_type === t);
    return b ? Number(b.hours_available) : null;
  };

  const teamRequests: TeamRequest[] = requests.map((r) => {
    const p = personBy.get(r.employee_id);
    const bal = balanceOf(r.employee_id, r.leave_type);
    // Other pending requests of the same type also draw on the balance.
    const otherPending = upcomingOff
      .filter((o) => o.employee_id === r.employee_id && o.id !== r.id && o.status === "pending" && o.leave_type === r.leave_type)
      .reduce((s, o) => s + Number(o.hours), 0);
    const left = bal === null ? null : bal - otherPending - (r.status === "pending" ? Number(r.hours) : 0);
    const clashes = upcomingOff
      .filter((o) => o.employee_id !== r.employee_id && overlaps(o.start_date, o.end_date, r.start_date, r.end_date))
      .map((o) => nameOf(o.employee_id));
    return {
      id: r.id,
      employeeName: nameOf(r.employee_id),
      jobTitle: p?.job_title ?? null,
      leave_type: r.leave_type,
      start_date: r.start_date,
      end_date: r.end_date,
      hours: Number(r.hours),
      note: r.note,
      status: r.status,
      adp_sync_status: r.adp_sync_status,
      balanceLeft: left,
      clashes: Array.from(new Set(clashes)),
      noApprover: !r.approver_email,
    };
  });

  const horizon = addDays(today, 42);
  const out: OutItem[] = upcomingOff
    .filter((o) => o.start_date <= horizon && o.end_date >= today && o.employee_id !== me.id)
    .sort((a, b) => (a.start_date < b.start_date ? -1 : 1))
    .slice(0, 12)
    .map((o) => ({ id: o.id, name: nameOf(o.employee_id), start_date: o.start_date, end_date: o.end_date, pending: o.status === "pending" }));

  // Timesheets
  const sheetPeople: Person[] = members.length ? members : people;
  const { rows, approvals } = await loadWeeks(
    sheetPeople.map((m) => m.id),
    weekStart
  );
  const sheetRows: SheetRow[] = sheetPeople.map((m) => {
    const a = approvals.get(m.id);
    return {
      employeeId: m.id,
      name: fullName(m),
      jobTitle: m.job_title ?? null,
      week: rows.get(m.id)!,
      approved: a ? { total: Number(a.total_hours), adp: a.adp_sync_status } : null,
    };
  });

  return (
    <TeamTimeClient
      tab={tab}
      requests={teamRequests}
      out={out}
      weekStart={weekStart}
      thisWeekStart={mondayOf(today)}
      today={today}
      sheetRows={sheetRows}
      teamSize={members.length}
      allStaff={allStaff}
      adpConnected={await adpConfigured().catch(() => false)}
      isAdmin={isAdmin}
    />
  );
}
