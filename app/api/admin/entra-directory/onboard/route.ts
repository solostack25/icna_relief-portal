import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdUser, assignLicense, setAdUserManager } from "@/lib/msgraph";

// Deliberately does nothing but create the Entra account + assign
// licenses + set manager. No Supabase auth invite, no employees row,
// no program_slugs - that's all "portal setup", a separate later step
// (see /admin/employees/new) once this person's Entra account exists.
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: me } = await supabase.from("employees").select("role").eq("auth_user_id", user.id).single();
  if (me?.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { firstName, lastName, email, jobTitle, department, officeLocation, managerId, licenseSkuIds } = await request.json();

  if (!firstName || !lastName || !email) {
    return NextResponse.json({ error: "First name, last name, and email are required" }, { status: 400 });
  }

  try {
    const adUser = await createAdUser({ firstName, lastName, email, jobTitle, department, officeLocation });

    const warnings: string[] = [];

    if (managerId) {
      try {
        await setAdUserManager(adUser.id, managerId);
      } catch (e) {
        warnings.push(`Manager could not be set: ${e instanceof Error ? e.message : "unknown error"}`);
      }
    }

    if (Array.isArray(licenseSkuIds) && licenseSkuIds.length > 0) {
      for (const skuId of licenseSkuIds) {
        try {
          await assignLicense(adUser.id, skuId);
        } catch (e) {
          warnings.push(`License ${skuId} could not be assigned: ${e instanceof Error ? e.message : "unknown error"}`);
        }
      }
    }

    return NextResponse.json({
      ok: true,
      adUserId: adUser.id,
      userPrincipalName: adUser.userPrincipalName,
      tempPassword: adUser.tempPassword,
      warnings,
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed to create Entra account" }, { status: 502 });
  }
}
