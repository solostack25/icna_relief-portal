import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { updateAdUser, setAdUserManager } from "@/lib/msgraph";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: me } = await supabase.from("employees").select("role").eq("auth_user_id", user.id).single();
  if (me?.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json().catch(() => null);
  const userId: string | undefined = body?.userId;
  if (!userId) return NextResponse.json({ error: "userId is required" }, { status: 400 });

  const { jobTitle, department, officeLocation, managerId } = body as {
    jobTitle?: string | null;
    department?: string | null;
    officeLocation?: string | null;
    managerId?: string;
  };

  try {
    if (jobTitle !== undefined || department !== undefined || officeLocation !== undefined) {
      await updateAdUser(userId, { jobTitle, department, officeLocation });
    }
    if (managerId) {
      await setAdUserManager(userId, managerId);
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to update Entra user";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
