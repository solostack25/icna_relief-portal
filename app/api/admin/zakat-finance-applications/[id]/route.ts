import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { data: me } = await supabase.from("employees").select("id, role, is_zakat_finance").eq("auth_user_id", user.id).single();
  if (!me || (me.role !== "admin" && !me.is_zakat_finance)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const body = await req.json();
  if (!body.check_number?.trim() && !body.amount_approved) {
    return NextResponse.json({ error: "Provide at least a check number or an approved amount" }, { status: 400 });
  }

  const updates: Record<string, unknown> = {};
  if (body.amount_approved !== undefined) updates.amount_approved = body.amount_approved;
  if (body.check_number !== undefined) {
    updates.check_number = body.check_number;
    updates.status = "paid";
    updates.paid_at = new Date().toISOString();
    updates.paid_by = me.id;
  }

  const { data, error } = await supabase.from("zakat_applications").update(updates).eq("id", id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ application: data });
}
