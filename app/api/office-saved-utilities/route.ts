import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Deliberately does no office/role check beyond "is logged in" -
// office_saved_utilities RLS (own office via my_assigned_office(), or
// admin) is the actual enforcement, same RLS-first pattern as
// /api/office-info/save. An office_id the caller isn't scoped to
// simply returns/affects 0 rows rather than erroring.

async function requireEmployee() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, status: 401 as const };
  const { data: me } = await supabase.from("employees").select("id").eq("auth_user_id", user.id).single();
  if (!me) return { ok: false as const, status: 401 as const };
  return { ok: true as const, supabase, employeeId: me.id };
}

export async function GET(request: NextRequest) {
  const auth = await requireEmployee();
  if (!auth.ok) return NextResponse.json({ error: "Unauthorized" }, { status: auth.status });

  const officeId = new URL(request.url).searchParams.get("officeId");
  if (!officeId) return NextResponse.json({ error: "officeId is required" }, { status: 400 });

  const { data, error } = await auth.supabase
    .from("office_saved_utilities")
    .select("*")
    .eq("office_id", officeId)
    .eq("is_active", true)
    .order("vendor_name");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ utilities: data ?? [] });
}

export async function POST(request: NextRequest) {
  const auth = await requireEmployee();
  if (!auth.ok) return NextResponse.json({ error: "Unauthorized" }, { status: auth.status });

  const body = await request.json().catch(() => null);
  if (!body?.office_id || !body?.vendor_name?.trim()) {
    return NextResponse.json({ error: "office_id and vendor_name are required" }, { status: 400 });
  }

  const { data, error } = await auth.supabase
    .from("office_saved_utilities")
    .insert({
      office_id: body.office_id,
      vendor_name: body.vendor_name.trim(),
      utility_type: body.utility_type ?? null,
      other_utility_name: body.other_utility_name ?? null,
      billing_programs: body.billing_programs ?? null,
      grant_eligible: !!body.grant_eligible,
      grant_id: body.grant_id ?? null,
      poc_is_icna_member: !!body.poc_is_icna_member,
      poc_user_id: body.poc_user_id ?? null,
      poc_name: body.poc_name ?? null,
      service_location_name: body.service_location_name ?? null,
      service_address_line1: body.service_address_line1 ?? null,
      service_city: body.service_city ?? null,
      service_zip_code: body.service_zip_code ?? null,
      pin_number: body.pin_number ?? null,
      notes: body.notes ?? null,
      created_by: auth.employeeId,
    })
    .select("*")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ utility: data });
}
