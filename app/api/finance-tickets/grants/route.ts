import { NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // grants itself is admin-only RLS - this exposes just enough (id +
  // name) for the allocation picker without granting broader read
  // access to grant financials.
  const admin = createAdminClient();
  const { data, error } = await admin.from("grants").select("id, title, funder_name").order("title");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ grants: data });
}
