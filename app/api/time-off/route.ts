import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { getMe, notifyApprover, resolveApproverEmail } from "@/lib/timeOff";
import { workdaysBetween, type LeaveType } from "@/lib/timeOffShared";

const TYPES: LeaveType[] = ["vacation", "sick", "personal"];
const DATE = /^\d{4}-\d{2}-\d{2}$/;

// New time off request from the signed-in employee. Goes to their direct
// supervisor (see lib/timeOff.ts resolveApproverEmail).
export async function POST(req: Request) {
  const me = await getMe();
  if (!me) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const body = await req.json().catch(() => null);
  const leave_type = body?.leave_type as LeaveType;
  const start_date = String(body?.start_date ?? "");
  const end_date = String(body?.end_date ?? "");
  const hours = Number(body?.hours);
  const note = typeof body?.note === "string" ? body.note.trim().slice(0, 500) : "";

  if (!TYPES.includes(leave_type)) return NextResponse.json({ error: "Pick vacation, sick, or personal." }, { status: 400 });
  if (!DATE.test(start_date) || !DATE.test(end_date)) return NextResponse.json({ error: "Pick a start and end date." }, { status: 400 });
  if (end_date < start_date) return NextResponse.json({ error: "The end date is before the start date." }, { status: 400 });
  if (workdaysBetween(start_date, end_date) > 60) return NextResponse.json({ error: "That's more than 60 workdays. Talk to HR about extended leave." }, { status: 400 });
  if (!Number.isFinite(hours) || hours <= 0 || hours > 480) return NextResponse.json({ error: "Enter the number of hours." }, { status: 400 });

  const admin = createAdminClient();
  const { data: clash } = await admin
    .from("hr_time_off_requests")
    .select("id")
    .eq("employee_id", me.id)
    .in("status", ["pending", "approved"])
    .lte("start_date", end_date)
    .gte("end_date", start_date)
    .limit(1);
  if (clash && clash.length) {
    return NextResponse.json({ error: "You already have a request covering some of those days." }, { status: 409 });
  }

  const approver_email = await resolveApproverEmail(me);

  const { data, error } = await admin
    .from("hr_time_off_requests")
    .insert({ employee_id: me.id, leave_type, start_date, end_date, hours, note: note || null, approver_email })
    .select("id, leave_type, start_date, end_date, hours, note, status, approver_email, adp_sync_status, created_at, decision_note")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (approver_email) await notifyApprover(approver_email, me, data);

  return NextResponse.json({ request: data, routedTo: approver_email });
}
