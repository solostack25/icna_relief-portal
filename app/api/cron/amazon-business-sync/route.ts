import { NextRequest, NextResponse } from "next/server";
import { runAmazonSync } from "@/lib/amazonBusiness/sync";

export const maxDuration = 300;

// Nightly Amazon Business sync: last 10 days of purchases, their invoice
// PDFs, ticket matching, Finance tickets and payment status.
export async function GET(req: NextRequest) {
  // A missing CRON_SECRET must not turn "Bearer undefined" into a password.
  if (!process.env.CRON_SECRET || req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const r = await runAmazonSync({ trigger: "cron", days: 10, budgetMs: 180_000 });
  // Not connected yet isn't a cron failure.
  if (!r.ok) return NextResponse.json({ ok: false, error: r.error }, { status: /isn't connected/.test(r.error ?? "") ? 200 : 500 });
  return NextResponse.json({ ok: true, summary: r.summary, ran_at: new Date().toISOString() });
}
