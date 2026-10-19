import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { financeGate, isResponse } from "@/lib/finance/access";
import { allocateCentral, upsertRows, type Scope } from "@/lib/finance/expenses";

export const dynamic = "force-dynamic";

// POST one row typed in on the Enter tab. Saving a central row re-shares
// central costs to offices for that month.
export async function POST(req: NextRequest) {
  const gate = await financeGate();
  if (isResponse(gate)) return gate;
  const b = await req.json().catch(() => ({}));
  const year = Number(b.year);
  const month = Number(b.month);
  const scope = b.scope as Scope;
  if (!(year >= 2000 && year <= 2100) || !(month >= 1 && month <= 12) || !["office", "central", "grant"].includes(scope)) {
    return NextResponse.json({ error: "Pick a month and what the row is for" }, { status: 400 });
  }
  if (scope !== "central" && !String(b.office_name ?? "").trim()) return NextResponse.json({ error: "Pick an office" }, { status: 400 });
  if (scope === "central" && !String(b.department ?? "").trim()) return NextResponse.json({ error: "Enter the department" }, { status: 400 });
  const num = (v: unknown) => (v === "" || v == null ? null : Number.isFinite(Number(v)) ? Number(v) : null);
  try {
    await upsertRows(
      [
        {
          year,
          month,
          scope,
          office_name: scope === "central" ? null : String(b.office_name).trim(),
          department: scope === "central" ? String(b.department).trim().toUpperCase() : null,
          subhead: scope === "central" ? String(b.subhead || b.department).trim().toUpperCase() : null,
          revenue: num(b.revenue),
          central_share: scope === "office" ? num(b.central_share) : null,
          amounts: b.amounts ?? {},
          notes: b.notes ? String(b.notes) : null,
        },
      ],
      { source: "manual", employeeId: gate.employeeId }
    );
    const allocation = scope === "central" ? await allocateCentral(year, month, gate.employeeId) : null;
    return NextResponse.json({ ok: true, allocation });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const gate = await financeGate();
  if (isResponse(gate)) return gate;
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const admin = createAdminClient();
  const { data: row } = await admin.from("fin_expense_rows").select("year, month, scope").eq("id", id).maybeSingle();
  const { error } = await admin.from("fin_expense_rows").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (row?.scope === "central") await allocateCentral(row.year as number, row.month as number, gate.employeeId);
  return NextResponse.json({ ok: true });
}
