import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function PATCH(request: NextRequest) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // confirm the caller is an admin
  const { data: me } = await supabase
    .from("employees")
    .select("role")
    .eq("auth_user_id", user.id)
    .single();

  if (me?.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { employeeId, programSlugs } = await request.json();

  if (!employeeId || !Array.isArray(programSlugs)) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  // replace access set: delete all, re-insert selected
  const { error: deleteError } = await supabase
    .from("employee_program_access")
    .delete()
    .eq("employee_id", employeeId);

  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 });
  }

  if (programSlugs.length > 0) {
    const { error: insertError } = await supabase
      .from("employee_program_access")
      .insert(
        programSlugs.map((slug: string) => ({
          employee_id: employeeId,
          program_slug: slug,
        }))
      );

    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true });
}
