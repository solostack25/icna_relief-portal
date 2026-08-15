import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { setIntegrationSetting } from "@/lib/integrationSettings";

async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: employee } = await supabase.from("employees").select("id, role").eq("auth_user_id", user.id).single();
  if (!employee || employee.role !== "admin") return null;
  return employee;
}

export async function GET() {
  const employee = await requireAdmin();
  if (!employee) return NextResponse.json({ error: "Not authorized" }, { status: 403 });

  const supabase = await createClient();
  const { data: row } = await supabase
    .from("integration_settings")
    .select("updated_at, updated_by")
    .eq("key", "pexels_api_key")
    .maybeSingle();

  if (row) {
    const { data: updater } = await supabase.from("employees").select("first_name, last_name").eq("id", row.updated_by).maybeSingle();
    return NextResponse.json({
      status: { source: "database", updatedAt: row.updated_at, updatedBy: updater ? `${updater.first_name} ${updater.last_name}` : null },
    });
  }
  if (process.env.PEXELS_API_KEY) {
    return NextResponse.json({ status: { source: "env", updatedAt: null, updatedBy: null } });
  }
  return NextResponse.json({ status: { source: "unset", updatedAt: null, updatedBy: null } });
}

export async function POST(req: Request) {
  const employee = await requireAdmin();
  if (!employee) return NextResponse.json({ error: "Not authorized" }, { status: 403 });

  const { apiKey } = await req.json();
  if (typeof apiKey !== "string" || apiKey.trim().length === 0) {
    return NextResponse.json({ error: "API key is required" }, { status: 400 });
  }
  await setIntegrationSetting("pexels_api_key", apiKey.trim(), employee.id);
  return NextResponse.json({ ok: true });
}
