import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getReportsAccess } from "@/lib/reportsAccess";
import { runReport, reportResultToCsv, type RunReportParams } from "@/lib/reports/runReport";

export async function POST(req: Request) {
  const access = await getReportsAccess();
  if (!access.ok) return NextResponse.json({ error: "Unauthorized" }, { status: access.status });

  const body = (await req.json()) as RunReportParams & { column_labels?: Record<string, string> };
  const supabase = await createClient();
  const result = await runReport(supabase, access, body);

  if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.status });

  const csv = reportResultToCsv(result, body.column_labels);
  const filename = `${result.module.label.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-report.csv`;

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
