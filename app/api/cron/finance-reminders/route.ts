import { NextResponse } from "next/server";
import { runFinanceApprovalReminders } from "@/lib/financeTickets";

export const maxDuration = 300;

// Daily (see vercel.json): re-sends the approval email to approvers who
// have had a finance ticket longer than the Workflows reminder setting.
export async function GET(request: Request) {
  if (request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const result = await runFinanceApprovalReminders();
  return NextResponse.json({ ok: true, ...result });
}
