import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getResourcesUser } from "@/lib/resources/access";
import { DEPARTMENTS, MATRIX } from "@/lib/resources/notify";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function GET() {
  const supabase = await createClient();
  const me = await getResourcesUser(supabase);
  if (!me?.canManage) return NextResponse.json({ error: "Only Admin / IT can manage Resources settings." }, { status: 403 });
  const [{ data: lists }, { data: log }] = await Promise.all([
    supabase.from("res_notification_recipients").select("department, emails, updated_at"),
    supabase.from("res_notification_log").select("id, event, subject, recipients, status, error, created_at").order("created_at", { ascending: false }).limit(50),
  ]);
  return NextResponse.json({
    departments: DEPARTMENTS.map((d) => ({ ...d, emails: lists?.find((l) => l.department === d.id)?.emails ?? [] })),
    matrix: Object.entries(MATRIX).map(([event, m]) => ({ event, ...m })),
    log: log ?? [],
  });
}

export async function PUT(request: NextRequest) {
  const supabase = await createClient();
  const me = await getResourcesUser(supabase);
  if (!me?.canManage) return NextResponse.json({ error: "Only Admin / IT can manage Resources settings." }, { status: 403 });
  const b = await request.json().catch(() => ({}));
  if (!DEPARTMENTS.some((d) => d.id === b.department)) return NextResponse.json({ error: "Unknown department" }, { status: 400 });
  const emails: string[] = Array.from(
    new Set(
      String(b.emails ?? "")
        .split(/[\s,;]+/)
        .map((e: string) => e.trim().toLowerCase())
        .filter(Boolean),
    ),
  );
  const bad = emails.filter((e) => !EMAIL.test(e));
  if (bad.length) return NextResponse.json({ error: `Not valid email addresses: ${bad.join(", ")}` }, { status: 400 });
  const { error } = await supabase.from("res_notification_recipients").update({ emails, updated_at: new Date().toISOString() }).eq("department", b.department);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true, emails });
}
