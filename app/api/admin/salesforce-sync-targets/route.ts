import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, status: 401 as const };
  const { data: me } = await supabase.from("employees").select("id, role").eq("auth_user_id", user.id).single();
  if (me?.role !== "admin") return { ok: false as const, status: 403 as const };
  return { ok: true as const, supabase, employeeId: me.id };
}

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: "Forbidden" }, { status: auth.status });

  const { data, error } = await auth.supabase
    .from("salesforce_sync_targets")
    .select("id, office_id, food_bank_name, instance_url, client_id, source_module, object_api_name, field_mapping, sync_mode, schedule, is_active, updated_at")
    .order("updated_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  // client_secret intentionally excluded from the list response - the
  // edit form only ever writes a new secret, never displays the old one.
  return NextResponse.json({ targets: data });
}

export async function POST(req: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: "Forbidden" }, { status: auth.status });

  const body = await req.json();
  if (!body.office_id || !body.food_bank_name?.trim() || !body.instance_url?.trim()) {
    return NextResponse.json({ error: "Office, food bank name, and instance URL are required" }, { status: 400 });
  }

  const { data, error } = await auth.supabase
    .from("salesforce_sync_targets")
    .insert({
      office_id: body.office_id,
      food_bank_name: body.food_bank_name.trim(),
      instance_url: body.instance_url.trim(),
      client_id: body.client_id ?? "",
      client_secret: body.client_secret ?? "",
      source_module: body.source_module,
      object_api_name: body.object_api_name ?? "",
      field_mapping: body.field_mapping ?? [],
      schedule: body.schedule ?? "daily",
      is_active: body.is_active ?? false,
      created_by: auth.employeeId,
    })
    .select("id, office_id, food_bank_name, instance_url, client_id, source_module, object_api_name, field_mapping, sync_mode, schedule, is_active, updated_at")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ target: data });
}
