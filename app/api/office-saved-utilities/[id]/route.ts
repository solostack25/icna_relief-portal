import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const EDITABLE_FIELDS = [
  "vendor_name",
  "utility_type",
  "other_utility_name",
  "billing_programs",
  "grant_eligible",
  "grant_id",
  "poc_is_icna_member",
  "poc_user_id",
  "poc_name",
  "service_location_name",
  "service_address_line1",
  "service_city",
  "service_zip_code",
  "pin_number",
  "notes",
];

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const key of EDITABLE_FIELDS) {
    if (key in body) update[key] = body[key];
  }

  const { data, error } = await supabase.from("office_saved_utilities").update(update).eq("id", id).select("*").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ utility: data });
}

// Soft delete only (is_active = false) - past tickets copied this
// template's data at payment time rather than referencing it, so
// they're unaffected either way, but keeping the row means retiring
// a utility by mistake is recoverable.
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { error } = await supabase.from("office_saved_utilities").update({ is_active: false }).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
