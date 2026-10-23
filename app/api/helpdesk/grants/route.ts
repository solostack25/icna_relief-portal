import { NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";

// Active grants from Grant Management, for the "grant-related purchase?"
// picker on IT Hardware Requests. gm_grants is only readable by Grant
// Management users under RLS, so this exposes just what a requester
// needs to pick one (code, name, funder, period) - no budget figures.
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const today = new Date().toISOString().slice(0, 10);
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("gm_grants")
    .select("id, code, name, funder, office_id, start_date, end_date")
    .eq("status", "active")
    .gte("end_date", today)
    .order("code");
  // Grant Management not set up yet: an empty list just hides the picker.
  if (error) return NextResponse.json({ grants: [] });
  return NextResponse.json({ grants: data ?? [] });
}
