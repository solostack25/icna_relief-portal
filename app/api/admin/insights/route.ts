import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { getInsightsAccess } from "@/lib/insightsAccess";

export const dynamic = "force-dynamic";

const isDate = (s: string | null) => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);
const isUuid = (s: string | null) => !!s && /^[0-9a-f-]{36}$/i.test(s);

// GET /api/admin/insights?from=2026-01-01&to=2026-12-31&region=&office=&program=
//
// Everything the Insights dashboard draws for one filter state: totals and
// the previous period of equal length, monthly trend, and breakdowns by
// office and program (see insights_query in supabase/insights_migration.sql).
// Admins and program directors see every office; regional directors are
// locked to their region; area managers to their own office.
export async function GET(req: NextRequest) {
  const access = await getInsightsAccess();
  if (!access.ok) return NextResponse.json({ error: "Not allowed" }, { status: access.status });

  const region = access.lockedRegion ?? (req.nextUrl.searchParams.get("region") || null);
  const officeParam = req.nextUrl.searchParams.get("office");
  const office = access.lockedOffice ?? (isUuid(officeParam) ? officeParam : null);

  const from = req.nextUrl.searchParams.get("from");
  const to = req.nextUrl.searchParams.get("to");
  if (!isDate(from) || !isDate(to) || from! > to!) return NextResponse.json({ error: "Bad date range" }, { status: 400 });
  const program = req.nextUrl.searchParams.get("program") || null;

  const { data, error } = await createAdminClient().rpc("insights_query", {
    p_from: from,
    p_to: to,
    p_region: region,
    p_office: office,
    p_program: program,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
