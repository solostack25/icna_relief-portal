import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";

async function requireAdmin(supabase: Awaited<ReturnType<typeof createClient>>) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  const { data: me } = await supabase.from("employees").select("role, id").eq("auth_user_id", user.id).single();
  if (me?.role !== "admin") return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  return { employeeId: me.id };
}

export async function GET() {
  const supabase = await createClient();
  const result = await requireAdmin(supabase);
  if ("error" in result) return result.error;

  const { data } = await supabase.from("zakat_approvers").select("id, full_name, email, is_active").eq("is_active", true).order("full_name");
  return NextResponse.json({ approvers: data ?? [] });
}

// body: { full_name, email } to add, or { email, remove: true } to deactivate
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const result = await requireAdmin(supabase);
  if ("error" in result) return result.error;

  const { full_name, email, remove } = await request.json();
  if (!email) return NextResponse.json({ error: "email is required" }, { status: 400 });

  const admin = createAdminClient();

  if (remove) {
    const { error } = await admin.from("zakat_approvers").update({ is_active: false }).eq("email", email);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (!full_name?.trim()) return NextResponse.json({ error: "full_name is required" }, { status: 400 });

  const { error } = await admin
    .from("zakat_approvers")
    .upsert({ email, full_name: full_name.trim(), is_active: true, added_by: result.employeeId }, { onConflict: "email" });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
