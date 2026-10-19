import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { financeGate, isResponse } from "@/lib/finance/access";
import { allocateCentral, loadOffices, officeKey } from "@/lib/finance/expenses";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

// FTE per office per year — central costs are shared in proportion.
export async function GET(req: NextRequest) {
  const gate = await financeGate();
  if (isResponse(gate)) return gate;
  const year = Number(req.nextUrl.searchParams.get("year")) || new Date().getFullYear();
  const { data } = await createAdminClient().from("fin_allocation_weights").select("office_name, office_id, fte").eq("year", year).order("office_name");
  return NextResponse.json({ year, weights: data ?? [] });
}

// PUT { year, weights: [{ office_name, fte }] } replaces the year's list.
export async function PUT(req: NextRequest) {
  const gate = await financeGate();
  if (isResponse(gate)) return gate;
  const b = await req.json().catch(() => ({}));
  const year = Number(b.year);
  if (!(year >= 2000 && year <= 2100) || !Array.isArray(b.weights)) return NextResponse.json({ error: "Bad request" }, { status: 400 });
  const { byKey } = await loadOffices();
  const rows = (b.weights as { office_name: string; fte: unknown }[])
    .map((w) => ({ name: String(w.office_name ?? "").trim(), fte: Math.max(0, Number(w.fte) || 0) }))
    .filter((w) => w.name)
    .map((w) => {
      const o = byKey.get(officeKey(w.name));
      return { year, office_name: o?.name ?? w.name, office_id: o?.id ?? null, fte: w.fte, updated_by: gate.employeeId, updated_at: new Date().toISOString() };
    });
  const admin = createAdminClient();
  await admin.from("fin_allocation_weights").delete().eq("year", year);
  if (rows.length) {
    const { error } = await admin.from("fin_allocation_weights").insert(rows);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, saved: rows.length });
}

// POST { year, month? } re-shares central costs (one month or every month
// with central data that year).
export async function POST(req: NextRequest) {
  const gate = await financeGate();
  if (isResponse(gate)) return gate;
  const b = await req.json().catch(() => ({}));
  const year = Number(b.year);
  if (!(year >= 2000 && year <= 2100)) return NextResponse.json({ error: "Bad year" }, { status: 400 });
  let months: number[] = [];
  if (Number(b.month) >= 1 && Number(b.month) <= 12) months = [Number(b.month)];
  else {
    const { data } = await createAdminClient().from("fin_expense_rows").select("month").eq("year", year).eq("scope", "central");
    months = [...new Set<number>((data ?? []).map((r: any) => r.month as number))].sort((a, z) => a - z);
  }
  const results = [];
  for (const m of months) results.push({ month: m, ...(await allocateCentral(year, m, gate.employeeId)) });
  return NextResponse.json({ ok: true, results });
}
