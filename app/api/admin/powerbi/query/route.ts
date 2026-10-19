import { NextResponse } from "next/server";
import { parsePeriod, requirePowerBiAdmin } from "@/lib/powerbiAdminAuth";
import { executeDax, firstNumber, getPowerBiConfig } from "@/lib/powerbi";
import { fillDax } from "@/lib/powerbiCompare";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// POST { datasetId, dax, year?, month? } -> first 50 rows. Used by the
// explorer and the metric editor's Test button. Read-only by nature:
// Execute Queries only accepts DAX EVALUATE queries.
export async function POST(req: Request) {
  if (!(await requirePowerBiAdmin())) return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const datasetId = String(body.datasetId ?? "").trim();
  const dax = String(body.dax ?? "").trim();
  if (!datasetId || !dax) return NextResponse.json({ error: "Pick a model and enter a DAX query" }, { status: 400 });
  const cfg = await getPowerBiConfig();
  if (!cfg) return NextResponse.json({ error: "Power BI isn't connected yet" }, { status: 400 });
  const filled = fillDax(dax, parsePeriod(body.year, body.month));
  try {
    const rows = await executeDax(cfg, datasetId, filled);
    return NextResponse.json({ query: filled, rowCount: rows.length, rows: rows.slice(0, 50), value: firstNumber(rows) });
  } catch (e) {
    return NextResponse.json({ query: filled, error: e instanceof Error ? e.message : String(e) }, { status: 400 });
  }
}
