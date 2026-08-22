import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { createAdUser, assignLicense } from "@/lib/msgraph";

const ROLE_JOB_TITLES: Record<string, string> = {
  staff: "Staff",
  regional_director: "Regional Director",
  program_director: "Program Director",
  admin: "Administrator",
};

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
    assignedRegion,
    programSlugs,
    licenseSkuIds,
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
      assigned_region: assignedRegion || null,
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

  // ---------- Active Directory account creation ----------
  // Best-effort: the portal record + login invite above have already
  // succeeded regardless of what happens here, so a Graph failure
  // (most likely: User.ReadWrite.All not granted yet) is reported back
  // as a warning, not a hard failure of the whole request - the admin
  // can still create the AD account manually and the employee isn't
  // stuck in limbo.
  let ad: { created: boolean; tempPassword?: string; userPrincipalName?: string; warning?: string; licenseWarnings?: string[] } = {
    created: false,
  };

  try {
    let officeLocation: string | undefined;
    if (assignedOfficeId) {
      const { data: office } = await supabase
        .from("b2s_offices")
        .select("field_office")
        .eq("id", assignedOfficeId)
        .single();
      officeLocation = office?.field_office;
    }

    const adUser = await createAdUser({
      firstName,
      lastName,
      email,
      jobTitle: ROLE_JOB_TITLES[role ?? "staff"],
      officeLocation,
    });

    ad = { created: true, tempPassword: adUser.tempPassword, userPrincipalName: adUser.userPrincipalName };

    if (Array.isArray(licenseSkuIds) && licenseSkuIds.length > 0) {
      const licenseWarnings: string[] = [];
      for (const skuId of licenseSkuIds) {
        try {
          await assignLicense(adUser.id, skuId);
        } catch (e) {
          licenseWarnings.push(e instanceof Error ? e.message : `Failed to assign license ${skuId}`);
        }
      }
      if (licenseWarnings.length > 0) ad.licenseWarnings = licenseWarnings;
    }
  } catch (e) {
    ad = {
      created: false,
      warning: `Portal account created, but the Active Directory account could not be created automatically: ${
        e instanceof Error ? e.message : "unknown error"
      }. Create it manually in Entra ID.`,
    };
  }

  return NextResponse.json({ ok: true, employeeId: employee.id, ad });
}
