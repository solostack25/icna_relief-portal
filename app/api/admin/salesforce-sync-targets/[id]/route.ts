import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, status: 401 as const };
  const { data: me } = await supabase.from("employees").select("role").eq("auth_user_id", user.id).single();
  if (me?.role !== "admin") return { ok: false as const, status: 403 as const };
  return { ok: true as const, supabase };
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: "Forbidden" }, { status: auth.status });
  const { id } = await params;

  const body = await req.json();
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  // Only touch fields actually sent - lets the UI, e.g., flip
  // is_active without resending (and blanking) the client_secret.
  for (const key of [
    "food_bank_name",
    "instance_url",
    "client_id",
    "client_secret",
    "source_module",
    "object_api_name",
    "field_mapping",
    "schedule",
    "is_active",
  ]) {
    if (body[key] !== undefined) updates[key] = body[key];
  }

  const { data, error } = await auth.supabase
    .from("salesforce_sync_targets")
    .update(updates)
    .eq("id", id)
    .select("id, office_id, food_bank_name, instance_url, client_id, source_module, object_api_name, field_mapping, sync_mode, schedule, is_active, updated_at")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ target: data });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: "Forbidden" }, { status: auth.status });
  const { id } = await params;

  const { error } = await auth.supabase.from("salesforce_sync_targets").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
