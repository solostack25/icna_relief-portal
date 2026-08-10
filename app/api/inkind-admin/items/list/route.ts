import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { getInkindAccess } from "@/lib/inkind/access";

// Must be signed in — same "any logged-in user is a trusted admin"
// pattern as the rest of this app. Uses the service role client so it
// can see inactive (soft-deleted) items too, which the public RLS
// policy on `items` hides from the anon key.
export async function GET() {
  const access = await getInkindAccess();
  if (!access.ok) {
    return NextResponse.json({ error: "Not authorized" }, { status: access.status });
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("items")
    .select("*")
    .order("program")
    .order("name");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ items: data });
}
