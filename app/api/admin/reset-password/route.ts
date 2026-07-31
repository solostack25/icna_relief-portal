import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: me } = await supabase
    .from("employees")
    .select("role")
    .eq("auth_user_id", user.id)
    .single();

  if (me?.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { authUserId } = await request.json();
  if (!authUserId) {
    return NextResponse.json({ error: "Missing authUserId" }, { status: 400 });
  }

  const admin = createAdminClient();

  // look up the target user's email via admin API
  const { data: targetUser, error: getUserError } =
    await admin.auth.admin.getUserById(authUserId);

  if (getUserError || !targetUser?.user?.email) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const { error } = await admin.auth.resetPasswordForEmail(
    targetUser.user.email,
    {
      redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/reset-password`,
    }
  );

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
