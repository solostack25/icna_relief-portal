import { NextRequest, NextResponse } from "next/server";
import { syncSquarePayments } from "@/lib/squareSync";

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await syncSquarePayments();
  if (result.error) return NextResponse.json({ error: result.error }, { status: 500 });
  return NextResponse.json({ success: true, synced: result.synced, ran_at: new Date().toISOString() });
}
