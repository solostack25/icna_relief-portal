import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: me } = await supabase.from("employees").select("id, role, is_cio").eq("auth_user_id", user.id).single();
  if (!me || !(me.role === "admin" || me.is_cio)) {
    return NextResponse.json({ error: "Only a designated approver can reject fundraisers" }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const reason: string = (body.reason || "").trim();
  if (!reason) return NextResponse.json({ error: "A reason is required so the requester knows what to fix" }, { status: 400 });

  const admin = createAdminClient();
  const { data: updated, error } = await admin
    .from("fundraisers")
    .update({
      approval_status: "rejected",
      reviewed_by: me.id,
      reviewed_at: new Date().toISOString(),
      rejection_reason: reason,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ fundraiser: updated });
}
