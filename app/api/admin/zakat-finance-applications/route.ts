import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

async function requireFinanceAccess() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, status: 401 as const };
  const { data: me } = await supabase.from("employees").select("id, role, is_zakat_finance").eq("auth_user_id", user.id).single();
  if (!me || (me.role !== "admin" && !me.is_zakat_finance)) return { ok: false as const, status: 403 as const };
  return { ok: true as const, supabase, employeeId: me.id };
}

export async function GET() {
  const auth = await requireFinanceAccess();
  if (!auth.ok) return NextResponse.json({ error: "Forbidden" }, { status: auth.status });

  const { data, error } = await auth.supabase
    .from("zakat_applications")
    .select("id, applicant_name, category, amount_requested, amount_approved, payee_name, payee_address, status, decided_at, check_number, paid_at")
    .in("status", ["approved", "paid"])
    .order("decided_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ applications: data });
}
