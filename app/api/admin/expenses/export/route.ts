import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { financeGate, isResponse } from "@/lib/finance/access";
import { toCsv } from "@/lib/finance/exportRows";
import type { Scope } from "@/lib/finance/expenses";

export const dynamic = "force-dynamic";

// GET ?scope=office|central|grant&year=2026[&month=][&template=1]
// CSV in the cleaned workbook's layout. template=1 → headers only (the
// upload template).
export async function GET(req: NextRequest) {
  const gate = await financeGate();
  if (isResponse(gate)) return gate;
  const sp = req.nextUrl.searchParams;
  const scope = (["office", "central", "grant"].includes(sp.get("scope") ?? "") ? sp.get("scope") : "office") as Scope;
  const year = Number(sp.get("year")) || new Date().getFullYear();
  const month = Number(sp.get("month")) || null;
  const names = { office: "Expense-Total", central: "Central Expenses", grant: "Grants Expenses" };
  let rows: Parameters<typeof toCsv>[1] = [];
  if (sp.get("template") !== "1") {
    let q = createAdminClient().from("fin_expense_rows").select("*").eq("scope", scope).eq("year", year).limit(10000);
    if (month) q = q.eq("month", month);
    const { data } = await q;
    rows = (data ?? []) as typeof rows;
  }
  const csv = toCsv(scope, rows);
  const file = sp.get("template") === "1" ? `${names[scope]} template.csv` : `${names[scope]} ${year}${month ? `-${String(month).padStart(2, "0")}` : ""}.csv`;
  return new NextResponse(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${file}"` } });
}
