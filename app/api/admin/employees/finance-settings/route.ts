import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function PATCH(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: me } = await supabase.from("employees").select("role").eq("auth_user_id", user.id).single();
  if (me?.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { employeeId, monetary_limit, is_csuite } = await request.json();
  if (!employeeId) return NextResponse.json({ error: "employeeId is required" }, { status: 400 });

  const updates: Record<string, unknown> = {};
  if (monetary_limit !== undefined) updates.monetary_limit = monetary_limit === "" ? null : Number(monetary_limit);
  if (is_csuite !== undefined) updates.is_csuite = !!is_csuite;

  const { error } = await supabase.from("employees").update(updates).eq("id", employeeId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
