import { NextRequest, NextResponse } from "next/server";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { getResendClient } from "@/lib/resendClient";
import { runReport, reportResultToCsv, type ReportScopeContext } from "@/lib/reports/runReport";

// Runs daily (see vercel.json). A report's `schedule` field decides
// whether TODAY is actually a delivery day - this single daily cron
// covers all three cadences rather than needing separate cron entries
// per cadence:
//   daily   -> every run
//   weekly  -> Mondays only (America/Chicago, matching the rest of
//              this codebase's day-boundary convention - see
//              helpdesk-weekly-tally's mondayOfCurrentWeek)
//   monthly -> the 1st of the month only
//
// Uses the service-role client to read across all employees' saved
// reports (report_definitions RLS otherwise only shows an employee
// their own + shared-to-them reports), but re-derives the OWNER's
// own scoping context before calling runReport, so a scheduled report
// still only ever surfaces what its owner could see running it by hand.
function isDueToday(schedule: string): boolean {
  const chicagoNow = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Chicago" }));
  if (schedule === "daily") return true;
  if (schedule === "weekly") return chicagoNow.getDay() === 1; // Monday
  if (schedule === "monthly") return chicagoNow.getDate() === 1;
  return false;
}

async function runScheduledReports() {
  const admin = createAdminClient();
  const resend = await getResendClient();

  const { data: dueReports } = await admin
    .from("report_definitions")
    .select("id, owner_id, module_slug, name, dimensions, metrics, filters, column_labels, schedule, schedule_recipients")
    .not("schedule", "is", null);

  const results: { report_id: string; name: string; status: string }[] = [];

  for (const report of dueReports ?? []) {
    if (!report.schedule || !isDueToday(report.schedule)) continue;
    if (!report.schedule_recipients?.length) {
      results.push({ report_id: report.id, name: report.name, status: "skipped: no recipients" });
      continue;
    }

    const { data: owner } = await admin
      .from("employees")
      .select("role, assigned_office_id, assigned_region")
      .eq("id", report.owner_id)
      .single();
    if (!owner) {
      results.push({ report_id: report.id, name: report.name, status: "skipped: owner not found" });
      continue;
    }

    const scope: ReportScopeContext = {
      isAdmin: owner.role === "admin",
      role: owner.role,
      assignedOfficeId: owner.assigned_office_id,
      assignedRegion: owner.assigned_region,
    };

    const result = await runReport(admin, scope, {
      module_slug: report.module_slug,
      dimensions: report.dimensions,
      metrics: report.metrics,
      filters: report.filters ?? {},
    });

    if ("error" in result) {
      results.push({ report_id: report.id, name: report.name, status: `error: ${result.error}` });
      continue;
    }

    await admin.from("report_runs").insert({
      definition_id: report.id,
      run_by: report.owner_id,
      params: report.filters ?? {},
      row_count: result.row_count,
    });

    if (resend) {
      const csv = reportResultToCsv(result, report.column_labels ?? {});
      await resend.client.emails.send({
        from: resend.fromAddress,
        to: report.schedule_recipients,
        subject: `${report.name} — ${new Date().toLocaleDateString("en-US", { timeZone: "America/Chicago" })}`,
        html: `<p>Your scheduled report "<strong>${report.name}</strong>" is attached (${result.row_count} records).</p>`,
        attachments: [{ filename: "report.csv", content: Buffer.from(csv).toString("base64") }],
      });
      results.push({ report_id: report.id, name: report.name, status: "sent" });
    } else {
      results.push({ report_id: report.id, name: report.name, status: "skipped: email not configured" });
    }
  }

  return { checked: dueReports?.length ?? 0, results };
}

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const expected = `Bearer ${process.env.CRON_SECRET}`;
  if (!process.env.CRON_SECRET || authHeader !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const result = await runScheduledReports();
  return NextResponse.json(result);
}

export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: me } = await supabase.from("employees").select("role").eq("auth_user_id", user.id).single();
  if (me?.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const result = await runScheduledReports();
  return NextResponse.json(result);
}
