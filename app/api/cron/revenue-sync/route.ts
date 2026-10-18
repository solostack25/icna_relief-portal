import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { syncSalesforceRevenue } from "@/lib/revenue/salesforceRevenueSync";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Nightly Salesforce → revenue_transactions sync (see vercel.json).
// GET — Vercel Cron with `Authorization: Bearer $CRON_SECRET`.
// POST — "Sync now" from the Revenue page, admins only.
export async function GET(req: NextRequest) {
  if (!process.env.CRON_SECRET || req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json(await syncSalesforceRevenue());
}

export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { data: me } = await supabase.from("employees").select("role").eq("auth_user_id", user.id).maybeSingle();
  if (me?.role !== "admin") return NextResponse.json({ error: "Admins only" }, { status: 403 });
  const result = await syncSalesforceRevenue();
  return NextResponse.json(result, { status: result.status === "error" ? 502 : 200 });
}
