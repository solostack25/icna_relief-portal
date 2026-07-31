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

  const {
    firstName,
    lastName,
    email,
    role,
    assignedOfficeId,
    programSlugs,
  } = await request.json();

  if (!firstName || !lastName || !email) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const admin = createAdminClient();

  const { data: invited, error: inviteError } =
    await admin.auth.admin.inviteUserByEmail(email, {
      redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/reset-password`,
    });

  if (inviteError || !invited?.user) {
    return NextResponse.json(
      { error: inviteError?.message ?? "Failed to invite user" },
      { status: 500 }
    );
  }

  const { data: employee, error: employeeError } = await supabase
    .from("employees")
    .insert({
      auth_user_id: invited.user.id,
      first_name: firstName,
      last_name: lastName,
      email,
      role: role ?? "staff",
      assigned_office_id: assignedOfficeId || null,
    })
    .select("id")
    .single();

  if (employeeError || !employee) {
    return NextResponse.json({ error: employeeError?.message }, { status: 500 });
  }

  if (Array.isArray(programSlugs) && programSlugs.length > 0) {
    await supabase.from("employee_program_access").insert(
      programSlugs.map((slug: string) => ({
        employee_id: employee.id,
        program_slug: slug,
      }))
    );
  }

  return NextResponse.json({ ok: true, employeeId: employee.id });
}
