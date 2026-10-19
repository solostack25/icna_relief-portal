import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { financeGate, isResponse } from "@/lib/finance/access";
import { loadOffices } from "@/lib/finance/expenses";

export const dynamic = "force-dynamic";

// GET ?year=2026[&month=1]
//   always: months of the year with totals per scope (which months have data)
//   with month: every row for that month
export async function GET(req: NextRequest) {
  const gate = await financeGate();
  if (isResponse(gate)) return gate;
  const sp = req.nextUrl.searchParams;
  const year = Number(sp.get("year")) || new Date().getFullYear();
  const month = Number(sp.get("month")) || null;
  const admin = createAdminClient();

  const { data: all } = await admin
    .from("fin_expense_rows")
    .select("month, scope, expenses_total, revenue, central_share, source")
    .eq("year", year)
    .limit(5000);
  const months = Array.from({ length: 12 }, (_, i) => ({ month: i + 1, office: 0, central: 0, grant: 0, revenue: 0, grantRevenue: 0, centralShared: 0, rows: 0, sources: [] as string[] }));
  for (const r of all ?? []) {
    const m = months[(r.month as number) - 1];
    m.rows++;
    m[r.scope as "office" | "central" | "grant"] += Number(r.expenses_total || 0);
    if (r.scope === "office") {
      m.revenue += Number(r.revenue || 0);
      m.centralShared += Number(r.central_share || 0);
    }
    if (r.scope === "grant") m.grantRevenue += Number(r.revenue || 0);
    if (!m.sources.includes(r.source as string)) m.sources.push(r.source as string);
  }

  let rows = null;
  if (month) {
    const { data } = await admin.from("fin_expense_rows").select("*").eq("year", year).eq("month", month).order("scope").order("region").order("office_name").order("department").order("subhead");
    rows = data ?? [];
  }
  const { list: offices } = await loadOffices();
  const { data: years } = await admin.from("fin_expense_rows").select("year").order("year", { ascending: false }).limit(1000);
  return NextResponse.json({
    year,
    month,
    months,
    rows,
    offices,
    years: [...new Set([new Date().getFullYear(), ...(years ?? []).map((y: any) => y.year as number)])].sort((a, b) => b - a),
  });
}
