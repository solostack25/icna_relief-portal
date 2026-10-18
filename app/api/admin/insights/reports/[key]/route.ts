import { NextRequest, NextResponse } from "next/server";
import { getInsightsAccess } from "@/lib/insightsAccess";
import { buildReport } from "@/lib/reportsSuite/build";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// GET /api/admin/insights/reports/back2school?year=2026&month=&region=&state=&office=&program=
// Regional directors are locked to their region, area managers to their office.
export async function GET(req: NextRequest, { params }: { params: Promise<{ key: string }> }) {
  const access = await getInsightsAccess();
  if (!access.ok) return NextResponse.json({ error: "Not allowed" }, { status: access.status });
  const { key } = await params;
  const sp = req.nextUrl.searchParams;
  const year = Number(sp.get("year")) || new Date().getFullYear();
  const month = Number(sp.get("month")) || null;
  const uuid = (s: string | null) => (s && /^[0-9a-f-]{36}$/i.test(s) ? s : null);
  try {
    const payload = await buildReport(key, {
      year: year >= 2000 && year <= 2100 ? year : new Date().getFullYear(),
      month: month && month >= 1 && month <= 12 ? month : null,
      region: sp.get("region") || null,
      state: (sp.get("state") || "").toUpperCase().slice(0, 2) || null,
      office: uuid(sp.get("office")),
      program: sp.get("program") || null,
      lockedRegion: access.lockedRegion,
      lockedOffice: access.lockedOffice,
    });
    return NextResponse.json(payload);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: msg === "Unknown report" ? 404 : 500 });
  }
}
