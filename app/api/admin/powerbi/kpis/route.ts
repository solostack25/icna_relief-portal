import { NextRequest, NextResponse } from "next/server";
import { parsePeriod, requirePowerBiAdmin } from "@/lib/powerbiAdminAuth";
import { buildReport } from "@/lib/reportsSuite/build";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// GET ?report=back2school&year=2026 -> the report's KPI tiles, so the
// metric editor can offer them as a dropdown.
export async function GET(req: NextRequest) {
  if (!(await requirePowerBiAdmin())) return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  const sp = req.nextUrl.searchParams;
  const report = sp.get("report") ?? "";
  const { year } = parsePeriod(sp.get("year"), null);
  try {
    const payload = await buildReport(report, { year, month: null, region: null, state: null, office: null, program: null, lockedRegion: null, lockedOffice: null });
    return NextResponse.json({ kpis: payload.kpis.map((k) => ({ label: k.label, unit: k.unit, value: k.value })) });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 });
  }
}
