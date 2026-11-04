import { NextResponse } from "next/server";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { ENV_EXPORT_EXCLUDED, ENV_EXPORT_GROUPS, envLine, envNameFor } from "@/lib/envExport";

export const dynamic = "force-dynamic";

async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: employee } = await supabase
    .from("employees")
    .select("id, role, first_name, last_name")
    .eq("auth_user_id", user.id)
    .single();
  if (!employee || employee.role !== "admin") return null;
  return employee;
}

const LABELS = new Map(ENV_EXPORT_GROUPS.flatMap((g) => g.fields.map((f) => [f.key, { group: g.title, label: f.label }] as const)));

// Every exportable setting that has a value: saved in the portal (database)
// or only in a Vercel env var the code falls back to.
async function availableSettings(): Promise<Map<string, { value: string; source: "database" | "env" }>> {
  const { data } = await createAdminClient().from("integration_settings").select("key, value");
  const out = new Map<string, { value: string; source: "database" | "env" }>();
  for (const row of (data ?? []) as { key: string; value: string | null }[]) {
    if (row.value && !ENV_EXPORT_EXCLUDED.has(row.key)) out.set(row.key, { value: row.value, source: "database" });
  }
  for (const key of Array.from(LABELS.keys())) {
    const env = process.env[envNameFor(key)];
    if (!out.has(key) && env) out.set(key, { value: env, source: "env" });
  }
  return out;
}

// GET — what can be exported (names only, no values) + recent exports.
export async function GET() {
  const me = await requireAdmin();
  if (!me) return NextResponse.json({ error: "Not authorized" }, { status: 403 });

  const settings = await availableSettings();
  const fields = Array.from(settings.entries()).map(([key, s]) => ({
    key,
    envName: envNameFor(key),
    group: LABELS.get(key)?.group ?? "Other",
    label: LABELS.get(key)?.label ?? key,
    source: s.source,
  }));

  const admin = createAdminClient();
  const { data: recent, error: logError } = await admin
    .from("integration_settings_exports")
    .select("id, exported_by, keys, purpose, created_at")
    .order("created_at", { ascending: false })
    .limit(10);
  const ids = Array.from(new Set((recent ?? []).map((r: any) => r.exported_by as string)));
  const { data: people } = ids.length
    ? await admin.from("employees").select("id, first_name, last_name").in("id", ids)
    : { data: [] as any[] };
  const names = new Map((people ?? []).map((p: any) => [p.id, `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim()]));

  return NextResponse.json({
    fields,
    logReady: !logError,
    recent: (recent ?? []).map((r: any) => ({
      id: r.id,
      by: names.get(r.exported_by) ?? "Unknown",
      keys: r.keys,
      purpose: r.purpose,
      at: r.created_at,
    })),
  });
}

// POST { keys: string[], purpose?: string } — the .env file. Logged first;
// no log row, no keys.
export async function POST(req: Request) {
  const me = await requireAdmin();
  if (!me) return NextResponse.json({ error: "Not authorized" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const requested: string[] = Array.isArray(body.keys) ? body.keys.filter((k: unknown): k is string => typeof k === "string") : [];
  const purpose = typeof body.purpose === "string" ? body.purpose.trim().slice(0, 200) || null : null;

  const settings = await availableSettings();
  const keys = Array.from(new Set(requested)).filter((k) => settings.has(k));
  if (keys.length === 0) return NextResponse.json({ error: "Pick at least one setting that has a value" }, { status: 400 });

  const { error: logError } = await createAdminClient()
    .from("integration_settings_exports")
    .insert({ exported_by: me.id, keys, purpose });
  if (logError) {
    return NextResponse.json(
      { error: `Export is blocked until the audit log works: ${logError.message}. Run supabase/integration_settings_exports_migration.sql.` },
      { status: 500 }
    );
  }

  const stamp = new Date().toLocaleString("en-US", { timeZone: "America/Chicago" });
  const lines = [
    `# Exported from the ICNA Relief portal (Admin > Connectors) by ${me.first_name ?? ""} ${me.last_name ?? ""} on ${stamp} CT`.replace(/\s+/g, " "),
    ...(purpose ? [`# Purpose: ${purpose.replace(/[\r\n]+/g, " ")}`] : []),
    "# Contains secrets: don't commit this file or share it. Delete it once pasted into Vercel.",
    "",
  ];
  let lastGroup = "";
  // Keep the Connectors page's order; anything uncatalogued goes last.
  const order = new Map(Array.from(LABELS.keys()).map((k, i) => [k, i]));
  const ordered = keys.sort((a, b) => (order.get(a) ?? 1e6) - (order.get(b) ?? 1e6) || a.localeCompare(b));
  for (const key of ordered) {
    const group = LABELS.get(key)?.group ?? "Other";
    if (group !== lastGroup) {
      if (lastGroup) lines.push("");
      lines.push(`# ${group}`);
      lastGroup = group;
    }
    lines.push(envLine(envNameFor(key), settings.get(key)!.value));
  }
  lines.push("");

  return new NextResponse(lines.join("\n"), {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Content-Disposition": `attachment; filename="portal-connectors.env"`,
      "Cache-Control": "no-store",
    },
  });
}
