import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";

// Runs daily (see vercel.json). Calls the existing process_pickup_statuses()
// Postgres function - ported over from Houston_Automation's own cron
// unchanged, since the function itself has no office-specific logic at
// all (just booked -> missed once the slot date passes, missed ->
// expired once the grace period ends), so it already works correctly
// across every office with zero changes needed.
//
// GET - called by Vercel Cron with `Authorization: Bearer $CRON_SECRET`.
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const { error } = await admin.rpc("process_pickup_statuses");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, ran_at: new Date().toISOString() });
}
