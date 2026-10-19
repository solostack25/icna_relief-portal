import { NextRequest, NextResponse } from "next/server";
import { parsePeriod, requirePowerBiAdmin } from "@/lib/powerbiAdminAuth";
import { latestResults, runComparison } from "@/lib/powerbiCompare";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// GET ?year=&month= -> latest stored result per metric for that period.
export async function GET(req: NextRequest) {
  if (!(await requirePowerBiAdmin())) return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  const sp = req.nextUrl.searchParams;
  return NextResponse.json(await latestResults(parsePeriod(sp.get("year"), sp.get("month"))));
}

// POST { year, month, metricId? } -> run now (all active metrics, or one).
export async function POST(req: Request) {
  if (!(await requirePowerBiAdmin())) return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const period = parsePeriod(body.year, body.month);
  try {
    await runComparison(period, "manual", typeof body.metricId === "string" ? body.metricId : undefined);
    return NextResponse.json(await latestResults(period));
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
