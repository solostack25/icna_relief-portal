import { NextRequest, NextResponse } from "next/server";
import { parsePeriod, requirePowerBiAdmin } from "@/lib/powerbiAdminAuth";
import { buildPowerBiReport } from "@/lib/powerbiReports/engine";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// GET /api/admin/powerbi/reports/national-revenue?year=&month=&region=&state=&office=&program=
// Same shape as /api/admin/insights/reports/[key], but every number comes
// from the Power BI model. Admin only: the app reads Power BI as itself, so
// Power BI's own row-level security doesn't apply.
export async function GET(req: NextRequest, { params }: { params: Promise<{ key: string }> }) {
  if (!(await requirePowerBiAdmin())) return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  const { key } = await params;
  const sp = req.nextUrl.searchParams;
  const { year, month } = parsePeriod(sp.get("year"), sp.get("month"));
  const uuid = (s: string | null) => (s && /^[0-9a-f-]{36}$/i.test(s) ? s : null);
  try {
    const payload = await buildPowerBiReport(key, {
      year,
      month,
      region: sp.get("region") || null,
      state: (sp.get("state") || "").toUpperCase().slice(0, 2) || null,
      officeId: uuid(sp.get("office")),
      program: sp.get("program") || null,
    });
    return NextResponse.json(payload);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: msg === "Unknown report" ? 404 : 500 });
  }
}
