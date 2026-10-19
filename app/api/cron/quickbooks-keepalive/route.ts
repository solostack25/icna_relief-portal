import { NextRequest, NextResponse } from "next/server";
import { getIntegrationSetting } from "@/lib/integrationSettings";
import { qboCompanyName } from "@/lib/finance/qbOnline";

export const dynamic = "force-dynamic";

// Intuit refresh tokens lapse after ~100 days unused. A weekly call keeps
// the QuickBooks Online connection alive between month-end pulls.
export async function GET(req: NextRequest) {
  if (!process.env.CRON_SECRET || req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const realm = await getIntegrationSetting("qbo_realm_id");
  if (!realm) return NextResponse.json({ ok: true, skipped: "not connected" });
  const name = await qboCompanyName(realm);
  return NextResponse.json({ ok: !!name, company: name });
}
