import { NextResponse } from "next/server";
import { requirePowerBiAdmin } from "@/lib/powerbiAdminAuth";
import { getPowerBiConfig, listDatasets } from "@/lib/powerbi";

export const dynamic = "force-dynamic";

// GET: is Power BI connected, and which semantic models can the app see?
export async function GET() {
  if (!(await requirePowerBiAdmin())) return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  const cfg = await getPowerBiConfig();
  if (!cfg) return NextResponse.json({ connected: false, reason: "not-configured", datasets: [] });
  try {
    const datasets = await listDatasets(cfg);
    return NextResponse.json({ connected: true, datasets });
  } catch (e) {
    return NextResponse.json({ connected: false, reason: "error", error: e instanceof Error ? e.message : String(e), datasets: [] });
  }
}
