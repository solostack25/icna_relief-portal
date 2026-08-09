import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { getWeeklyItLeaderboard } from "@/lib/helpdesk";

// Runs every Friday (see vercel.json). Snapshots the current week's
// IT points standings into helpdesk_weekly_tallies -- a point-in-time
// record for history/announcing, NOT a reset. Points keep accruing in
// helpdesk_points_ledger regardless (e.g. weekend closures after this
// runs still count toward the same week -- see getWeeklyItLeaderboard's
// Monday-Sunday week definition).
//
// Safe to re-run: unique(week_start, employee_id) means running this
// again the same week just updates each employee's snapshot to their
// current total rather than duplicating rows.
//
// GET  — called by Vercel Cron with `Authorization: Bearer $CRON_SECRET`.
// POST — manual trigger from an admin screen, requires an authenticated admin.

function mondayOfCurrentWeek(): string {
  const now = new Date();
  const chicagoNow = new Date(now.toLocaleString("en-US", { timeZone: "America/Chicago" }));
  const dayOfWeek = chicagoNow.getDay();
  const daysSinceMonday = (dayOfWeek + 6) % 7;
  const weekStart = new Date(chicagoNow);
  weekStart.setDate(chicagoNow.getDate() - daysSinceMonday);
  return weekStart.toISOString().slice(0, 10);
}

async function runWeeklyTally() {
  const admin = createAdminClient();
  const weekStart = mondayOfCurrentWeek();
  const leaderboard = await getWeeklyItLeaderboard(admin);

  for (const entry of leaderboard) {
    await admin.from("helpdesk_weekly_tallies").upsert(
      {
        week_start: weekStart,
        employee_id: entry.employeeId,
        total_points: entry.points,
        snapshotted_at: new Date().toISOString(),
      },
      { onConflict: "week_start,employee_id" }
    );
  }

  return { weekStart, tallied: leaderboard.length, leaderboard };
}

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const expected = `Bearer ${process.env.CRON_SECRET}`;
  if (!process.env.CRON_SECRET || authHeader !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const result = await runWeeklyTally();
  return NextResponse.json(result);
}

export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: me } = await supabase
    .from("employees")
    .select("role")
    .eq("auth_user_id", user.id)
    .single();
  if (me?.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const result = await runWeeklyTally();
  return NextResponse.json(result);
}
