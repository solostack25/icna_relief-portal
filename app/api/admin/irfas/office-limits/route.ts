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

  const [{ data: offices }, { data: limits }, { data: applications }] = await Promise.all([
    auth.supabase.from("b2s_offices").select("id, field_office, region").eq("is_active", true).order("field_office"),
    auth.supabase.from("zakat_office_limits").select("office_id, limit_amount"),
    auth.supabase.from("zakat_applications").select("office_id, amount_requested, amount_approved").in("status", ["approved", "paid"]),
  ]);

  const limitByOffice = new Map((limits ?? []).map((l) => [l.office_id, Number(l.limit_amount)]));
  const givenByOffice = new Map<string, number>();
  for (const a of applications ?? []) {
    const amount = Number(a.amount_approved ?? a.amount_requested ?? 0);
    givenByOffice.set(a.office_id, (givenByOffice.get(a.office_id) ?? 0) + amount);
  }

  const result = (offices ?? []).map((o) => ({
    office_id: o.id,
    field_office: o.field_office,
    region: o.region,
    limit_amount: limitByOffice.get(o.id) ?? null,
    given: givenByOffice.get(o.id) ?? 0,
  }));

  return NextResponse.json({ offices: result });
}

export async function POST(req: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: "Forbidden" }, { status: auth.status });

  const body = await req.json();
  if (!body.office_id || body.limit_amount === undefined || body.limit_amount === null) {
    return NextResponse.json({ error: "office_id and limit_amount are required" }, { status: 400 });
  }

  const { error } = await auth.supabase
    .from("zakat_office_limits")
    .upsert(
      { office_id: body.office_id, limit_amount: body.limit_amount, updated_by: auth.employeeId, updated_at: new Date().toISOString() },
      { onConflict: "office_id" }
    );
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
