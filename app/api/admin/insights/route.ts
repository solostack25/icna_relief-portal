import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { getReportsAccess } from "@/lib/reportsAccess";

export const dynamic = "force-dynamic";

const isDate = (s: string | null) => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);
const isUuid = (s: string | null) => !!s && /^[0-9a-f-]{36}$/i.test(s);

// GET /api/admin/insights?from=2026-01-01&to=2026-12-31&region=&office=&program=
//
// Everything the Insights dashboard draws for one filter state: totals and
// the previous period of equal length, monthly trend, and breakdowns by
// office and program (see insights_query in supabase/insights_migration.sql).
// Admins and program directors see every office; regional directors are
// locked to their region.
export async function GET(req: NextRequest) {
  const access = await getReportsAccess();
  if (!access.ok) return NextResponse.json({ error: "Unauthorized" }, { status: access.status });

  let region: string | null = req.nextUrl.searchParams.get("region") || null;
  if (access.role === "regional_director") {
    if (!access.assignedRegion) return NextResponse.json({ error: "No region assigned" }, { status: 403 });
    region = access.assignedRegion;
  } else if (!access.isAdmin && access.role !== "program_director") {
    return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  }

  const from = req.nextUrl.searchParams.get("from");
  const to = req.nextUrl.searchParams.get("to");
  if (!isDate(from) || !isDate(to) || from! > to!) return NextResponse.json({ error: "Bad date range" }, { status: 400 });
  const office = req.nextUrl.searchParams.get("office");
  const program = req.nextUrl.searchParams.get("program") || null;

  const { data, error } = await createAdminClient().rpc("insights_query", {
    p_from: from,
    p_to: to,
    p_region: region,
    p_office: isUuid(office) ? office : null,
    p_program: program,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
