import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";

async function requireAdmin(supabase: Awaited<ReturnType<typeof createClient>>) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  const { data: me } = await supabase.from("employees").select("role").eq("auth_user_id", user.id).single();
  if (me?.role !== "admin") return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  return {};
}

export async function GET() {
  const supabase = await createClient();
  const result = await requireAdmin(supabase);
  if ("error" in result) return result.error;

  const { data } = await supabase.from("employees").select("id, full_name, email").eq("is_zakat_finance", true).order("full_name");
  return NextResponse.json({ approvers: data ?? [] });
}

// body: { email: string, is_zakat_finance: boolean } - only grants
// access to employees who already have a portal account, unlike the
// approver list which can include anyone.
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const result = await requireAdmin(supabase);
  if ("error" in result) return result.error;

  const { email, is_zakat_finance } = await request.json();
  if (!email) return NextResponse.json({ error: "email is required" }, { status: 400 });

  const admin = createAdminClient();
  const { data: employee } = await admin.from("employees").select("id").ilike("email", email).maybeSingle();
  if (!employee) return NextResponse.json({ error: `No employee found with email ${email}` }, { status: 404 });

  const { error } = await admin.from("employees").update({ is_zakat_finance: !!is_zakat_finance }).eq("id", employee.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
