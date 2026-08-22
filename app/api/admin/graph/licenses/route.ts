import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { listAvailableLicenses } from "@/lib/msgraph";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: me } = await supabase.from("employees").select("role").eq("auth_user_id", user.id).single();
  if (me?.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const licenses = await listAvailableLicenses();
    return NextResponse.json({ licenses });
  } catch (e) {
    // Most likely cause: Organization.Read.All isn't granted yet on the
    // Graph app registration. Don't fail the whole onboarding page over
    // this - just report it so the license picker can hide itself.
    return NextResponse.json(
      { licenses: [], error: e instanceof Error ? e.message : "Could not load licenses" },
      { status: 200 }
    );
  }
}
