import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { setIntegrationSetting } from "@/lib/integrationSettings";

// Generic version of the pattern in app/api/admin/pexels-settings -
// keyed by `key` instead of hardcoded to one credential, so adding a
// new connector (Resend, Salesforce, Skyetel, 3CX...) is just a new
// key name and a UI field, not a new route file every time.

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

export async function GET(req: Request) {
  const employee = await requireAdmin();
  if (!employee) return NextResponse.json({ error: "Not authorized" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const key = searchParams.get("key");
  const envFallbackKey = searchParams.get("envFallbackKey"); // optional process.env name to check
  if (!key) return NextResponse.json({ error: "key is required" }, { status: 400 });

  const supabase = await createClient();
  const { data: row } = await supabase
    .from("integration_settings")
    .select("updated_at, updated_by")
    .eq("key", key)
    .maybeSingle();

  if (row) {
    const { data: updater } = await supabase
      .from("employees")
      .select("first_name, last_name")
      .eq("id", row.updated_by)
      .maybeSingle();
    return NextResponse.json({
      status: {
        source: "database",
        updatedAt: row.updated_at,
        updatedBy: updater ? `${updater.first_name} ${updater.last_name}` : null,
      },
    });
  }
  if (envFallbackKey && process.env[envFallbackKey]) {
    return NextResponse.json({ status: { source: "env", updatedAt: null, updatedBy: null } });
  }
  return NextResponse.json({ status: { source: "unset", updatedAt: null, updatedBy: null } });
}

export async function POST(req: Request) {
  const employee = await requireAdmin();
  if (!employee) return NextResponse.json({ error: "Not authorized" }, { status: 403 });

  const { key, value } = await req.json();
  if (typeof key !== "string" || key.trim().length === 0) {
    return NextResponse.json({ error: "key is required" }, { status: 400 });
  }
  if (typeof value !== "string" || value.trim().length === 0) {
    return NextResponse.json({ error: "value is required" }, { status: 400 });
  }
  await setIntegrationSetting(key.trim(), value.trim(), employee.id);
  return NextResponse.json({ ok: true });
}
