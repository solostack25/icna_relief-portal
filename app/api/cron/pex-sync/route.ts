import { NextRequest, NextResponse } from "next/server";
import { runFullSync } from "@/lib/pex/sync";

export const maxDuration = 300;

// Nightly PEX sync: cards + the last 45 days of transactions. This is
// the safety net behind the webhooks.
export async function GET(req: NextRequest) {
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const r = await runFullSync("cron");
  // Not connected yet isn't a cron failure.
  if (!r.ok) return NextResponse.json({ ok: false, error: r.error }, { status: /isn't connected/.test(r.error ?? "") ? 200 : 500 });
  return NextResponse.json({ ok: true, stats: r.stats, ran_at: new Date().toISOString() });
}
