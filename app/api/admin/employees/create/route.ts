import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";

// Step 2 of onboarding: portal setup only. Entra account creation now
// lives entirely in /admin/entra-directory/new (step 1) - this route
// just creates the portal login + employee record + program access,
// and optionally links to an already-existing Entra account via
// adObjectId (passed through from step 1, or picked from the directory
// on this page for someone whose Entra account already existed).
export async function POST(request: NextRequest) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: me } = await supabase.from("employees").select("role").eq("auth_user_id", user.id).single();
  if (me?.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { firstName, lastName, email, role, assignedOfficeId, assignedRegion, programSlugs, adObjectId, password } =
    await request.json();

  if (!firstName || !lastName || !email) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  // Two ways to give someone their login:
  //  - no password: email invite (they set their own via /reset-password)
  //  - password: the admin sets it now and hands it over; account is
  //    confirmed immediately so they can sign in right away, no email sent.
  const setPassword = typeof password === "string" && password.length > 0;
  if (setPassword && password.length < 8) {
    return NextResponse.json({ error: "Password must be at least 8 characters." }, { status: 400 });
  }

  const admin = createAdminClient();

  const { data: authData, error: authError } = setPassword
    ? await admin.auth.admin.createUser({ email, password, email_confirm: true })
    : await admin.auth.admin.inviteUserByEmail(email, {
        redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/reset-password`,
      });

  if (authError || !authData?.user) {
    return NextResponse.json(
      { error: authError?.message ?? (setPassword ? "Failed to create user" : "Failed to invite user") },
      { status: 500 }
    );
  }
  const invited = authData;

  const { data: employee, error: employeeError } = await supabase
    .from("employees")
    .insert({
      auth_user_id: invited.user.id,
      first_name: firstName,
      last_name: lastName,
      email,
      role: role ?? "staff",
      assigned_office_id: assignedOfficeId || null,
      assigned_region: assignedRegion || null,
      ad_object_id: adObjectId || null,
    })
    .select("id")
    .single();

  if (employeeError || !employee) {
    // Don't leave a login behind with no employee row - it would sign in
    // to an empty portal. Only safe to roll back for an account we just
    // created with a password (an invite may belong to a re-invited user).
    if (setPassword) await admin.auth.admin.deleteUser(invited.user.id);
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

  return NextResponse.json({ ok: true, employeeId: employee.id, method: setPassword ? "password" : "invite" });
}
