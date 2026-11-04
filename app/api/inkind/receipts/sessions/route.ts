import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { receiptAccess } from "@/lib/inkind/receipts";

export const dynamic = "force-dynamic";

// GET  /api/inkind/receipts/sessions?officeId=   this office's scan sessions
// POST /api/inkind/receipts/sessions { officeId, name? }   start a new one
export async function GET(req: NextRequest) {
  const access = await receiptAccess(req.nextUrl.searchParams.get("officeId"));
  if ("error" in access) return NextResponse.json({ error: access.error }, { status: access.status });

  const admin = createAdminClient();
  const { data: sessions, error } = await admin
    .from("inkind_receipt_sessions")
    .select("id, name, created_at, updated_at")
    .eq("office_id", access.office.id)
    .order("updated_at", { ascending: false })
    .limit(200);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  type S = { id: string; name: string; created_at: string; updated_at: string };
  const list = (sessions ?? []) as S[];
  const ids = list.map((s) => s.id);
  const { data: rows } = ids.length
    ? await admin.from("inkind_receipts").select("session_id, total").in("session_id", ids)
    : { data: [] as { session_id: string; total: number | null }[] };
  const stats = new Map<string, { count: number; total: number }>();
  for (const r of rows ?? []) {
    const s = stats.get(r.session_id) ?? { count: 0, total: 0 };
    s.count++;
    s.total += Number(r.total) || 0;
    stats.set(r.session_id, s);
  }
  return NextResponse.json({
    sessions: list.map((s) => ({
      ...s,
      receiptCount: stats.get(s.id)?.count ?? 0,
      total: Math.round((stats.get(s.id)?.total ?? 0) * 100) / 100,
    })),
  });
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const access = await receiptAccess(body.officeId);
  if ("error" in access) return NextResponse.json({ error: access.error }, { status: access.status });

  const today = new Date().toLocaleDateString("en-US", { timeZone: "America/Chicago", month: "short", day: "numeric", year: "numeric" });
  const name = (typeof body.name === "string" ? body.name.trim().slice(0, 120) : "") || `Receipts – ${today}`;
  const { data, error } = await createAdminClient()
    .from("inkind_receipt_sessions")
    .insert({ office_id: access.office.id, name })
    .select("id")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ sessionId: data.id });
}
