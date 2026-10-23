import { NextResponse } from "next/server";
import { requirePex, pexAdmin } from "@/lib/pex/access";
import { loadTransactions, readFilters } from "@/lib/pex/txQuery";
import { spendGroup } from "@/lib/pex/categories";

// CSV export of the PEX transactions list (same filters as the page).
export async function GET(req: Request) {
  const auth = await requirePex({ admin: true });
  if ("res" in auth) return auth.res;
  const db = pexAdmin();
  const sp = Object.fromEntries(new URL(req.url).searchParams.entries());
  const f = readFilters(sp);
  const { rows, cards } = await loadTransactions(db, auth.viewer, f);
  const cardById = new Map(cards.map((c) => [c.id, c]));
  const [{ data: offices }, { data: emps }] = await Promise.all([
    db.from("b2s_offices").select("id, field_office"),
    db.from("employees").select("id, first_name, last_name"),
  ]);
  const office = new Map((offices ?? []).map((o) => [o.id, o.field_office]));
  const emp = new Map((emps ?? []).map((e) => [e.id, `${e.first_name ?? ""} ${e.last_name ?? ""}`.trim()]));
  const cell = (v: unknown) => {
    const s = v == null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const head = ["Date", "Merchant", "City", "State", "MCC", "Type of spending", "Amount", "Pending", "Card last 4", "Card holder", "Office", "Grant card", "Grant status", "Coded to grants", "Non-grant", "PEX note"];
  const lines = rows.map((r) => {
    const c = cardById.get(r.card_id as string);
    return [
      r.transaction_date,
      r.merchant,
      r.merchant_city,
      r.merchant_state,
      r.mcc,
      spendGroup(r.mcc as string),
      Number(r.amount).toFixed(2),
      r.is_pending ? "yes" : "",
      c?.last4 ?? r.card_last4,
      emp.get(c?.employee_id ?? "") ?? r.card_holder,
      office.get(c?.office_id ?? ""),
      c?.grant_eligible ? "yes" : "",
      c?.grant_eligible ? r.status : "",
      Number(r.allocated_amount).toFixed(2),
      Number(r.non_grant_amount).toFixed(2),
      r.memo,
    ]
      .map(cell)
      .join(",");
  });
  return new NextResponse([head.join(","), ...lines].join("\n"), {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="pex-transactions-${f.month}.csv"` },
  });
}
