import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { syncSquarePayments } from "@/lib/squareSync";

export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { data: me } = await supabase.from("employees").select("role").eq("auth_user_id", user.id).single();
  if (me?.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const result = await syncSquarePayments();
  if (result.error) return NextResponse.json({ error: result.error }, { status: 502 });
  return NextResponse.json({ synced: result.synced });
}
