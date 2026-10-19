import { NextRequest, NextResponse } from "next/server";
import { runComparison } from "@/lib/powerbiCompare";
import { getPowerBiConfig } from "@/lib/powerbi";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Nightly (see vercel.json): compares this year and this month so the
// Power BI check page always has a fresh row and a history of the gap.
// Does nothing until Power BI is connected.
export async function GET(req: NextRequest) {
  if (!process.env.CRON_SECRET || req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!(await getPowerBiConfig())) return NextResponse.json({ skipped: "Power BI not connected" });
  const now = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Chicago" }));
  const year = now.getFullYear();
  const ytd = await runComparison({ year, month: null }, "cron");
  const month = await runComparison({ year, month: now.getMonth() + 1 }, "cron");
  return NextResponse.json({ year: ytd.length, month: month.length });
}
