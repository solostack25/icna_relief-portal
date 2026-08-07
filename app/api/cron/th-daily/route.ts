import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";

// Runs daily (see vercel.json). Two jobs on the same clock:
//
// 1. Milestone generation — for every active stay, check whether today has
//    crossed the 3/4/5-month calendar mark (Jan 15 move-in -> Apr 15 is the
//    3-month mark, not a flat 90 days) and hasn't had that milestone row
//    created yet. Idempotent: the unique(stay_id, milestone_type) constraint
//    means re-running this safely no-ops for marks already recorded.
// 2. Auto-vacate — any active stay whose expected_exit_date has arrived gets
//    vacated automatically, no human step, per Travis. The bed becomes
//    available the moment status flips (bed availability is derived from
//    "no active stay references this bed", not a separate stored flag).
//
// GET — called by Vercel Cron with `Authorization: Bearer $CRON_SECRET`.
// POST — manual trigger from an admin screen, requires an authenticated admin.

function addMonths(dateStr: string, months: number): string {
  const d = new Date(dateStr + "T00:00:00Z");
  d.setUTCMonth(d.getUTCMonth() + months);
  return d.toISOString().slice(0, 10);
}

async function runDailyJob() {
  const admin = createAdminClient();
  const today = new Date().toISOString().slice(0, 10);

  const { data: activeStays, error: staysError } = await admin
    .from("th_stays")
    .select("id, move_in_date, expected_exit_date")
    .eq("status", "active");

  if (staysError) {
    return { status: 500, body: { error: staysError.message } };
  }

  const milestonesCreated: string[] = [];
  const vacated: string[] = [];

  for (const stay of activeStays ?? []) {
    const marks: { type: string; date: string }[] = [
      { type: "3_month_notice", date: addMonths(stay.move_in_date, 3) },
      { type: "4_month_notice", date: addMonths(stay.move_in_date, 4) },
      { type: "5_month_final_notice", date: addMonths(stay.move_in_date, 5) },
    ];

    for (const mark of marks) {
      if (mark.date > today) continue;

      const { data: existing } = await admin
        .from("th_stay_milestones")
        .select("id")
        .eq("stay_id", stay.id)
        .eq("milestone_type", mark.type)
        .maybeSingle();

      if (!existing) {
        const { error: insertError } = await admin.from("th_stay_milestones").insert({
          stay_id: stay.id,
          milestone_type: mark.type,
          milestone_date: mark.date,
        });
        if (!insertError) milestonesCreated.push(`${stay.id}:${mark.type}`);
      }
    }

    if (stay.expected_exit_date <= today) {
      const { error: vacateError } = await admin
        .from("th_stays")
        .update({
          status: "vacated",
          vacated_at: new Date().toISOString(),
          vacated_reason: "completed_6_months",
        })
        .eq("id", stay.id)
        .eq("status", "active"); // guard against a race with a manual update

      if (!vacateError) vacated.push(stay.id);
    }
  }

  return {
    status: 200,
    body: { milestonesCreated, vacated, checkedStays: (activeStays ?? []).length },
  };
}

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const expected = `Bearer ${process.env.CRON_SECRET}`;

  if (!process.env.CRON_SECRET || authHeader !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await runDailyJob();
  return NextResponse.json(result.body, { status: result.status });
}

export async function POST() {
  const { createClient } = await import("@/lib/supabase/server");
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: me } = await supabase
    .from("employees")
    .select("role")
    .eq("auth_user_id", user.id)
    .single();
  if (me?.role !== "admin") {
    return NextResponse.json({ error: "Admins only" }, { status: 403 });
  }

  const result = await runDailyJob();
  return NextResponse.json(result.body, { status: result.status });
}
