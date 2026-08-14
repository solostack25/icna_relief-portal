import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { setIntegrationSetting } from "@/lib/integrationSettings";

const KEYS = {
  appKey: "dropbox_app_key",
  appSecret: "dropbox_app_secret",
  refreshToken: "dropbox_refresh_token",
} as const;

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
  const { data: rows } = await supabase
    .from("integration_settings")
    .select("key, updated_at, updated_by")
    .in("key", Object.values(KEYS));

  const employeeIds = [...new Set((rows ?? []).map((r) => r.updated_by).filter(Boolean))];
  const { data: employees } = await supabase
    .from("employees")
    .select("id, first_name, last_name")
    .in("id", employeeIds.length ? employeeIds : ["00000000-0000-0000-0000-000000000000"]);
  const nameMap = new Map((employees ?? []).map((e) => [e.id, `${e.first_name} ${e.last_name}`]));

  const status = Object.fromEntries(
    Object.entries(KEYS).map(([field, key]) => {
      const row = (rows ?? []).find((r) => r.key === key);
      const envFallback = { appKey: "DROPBOX_APP_KEY", appSecret: "DROPBOX_APP_SECRET", refreshToken: "DROPBOX_REFRESH_TOKEN" }[
        field as keyof typeof KEYS
      ];
      if (row) {
        return [field, { source: "database", updatedAt: row.updated_at, updatedBy: nameMap.get(row.updated_by) ?? null }];
      }
      if (process.env[envFallback as string]) {
        return [field, { source: "env", updatedAt: null, updatedBy: null }];
      }
      return [field, { source: "unset", updatedAt: null, updatedBy: null }];
    })
  );

  return NextResponse.json({ status });
}

export async function POST(req: Request) {
  const employee = await requireAdmin();
  if (!employee) return NextResponse.json({ error: "Not authorized" }, { status: 403 });

  const body = await req.json();
  const updates: [string, string][] = [];
  for (const [field, key] of Object.entries(KEYS)) {
    const value = body[field];
    if (typeof value === "string" && value.trim().length > 0) {
      updates.push([key, value.trim()]);
    }
  }
  if (updates.length === 0) {
    return NextResponse.json({ error: "No values provided to update" }, { status: 400 });
  }

  for (const [key, value] of updates) {
    await setIntegrationSetting(key, value, employee.id);
  }

  return NextResponse.json({ ok: true, updated: updates.map(([k]) => k) });
}
