import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchAll } from "@/lib/grantManagement/server";
import { monthBounds } from "./categories";
import type { PexViewer } from "./access";

// Shared filters for the PEX transactions list and its CSV export.
export type TxFilters = { month: string; card?: string; office?: string; q?: string; pending?: boolean; use?: "grant" | "other" };

export function readFilters(sp: Record<string, string | undefined>): TxFilters {
  const month = /^\d{4}-\d{2}$/.test(sp.month ?? "") ? sp.month! : new Date().toISOString().slice(0, 7);
  return {
    month,
    card: sp.card || undefined,
    office: sp.office || undefined,
    q: sp.q?.trim() || undefined,
    pending: sp.pending === "1",
    use: sp.use === "grant" || sp.use === "other" ? sp.use : undefined,
  };
}

export const TX_COLS =
  "id, transaction_date, transaction_time, merchant, merchant_city, merchant_state, mcc, amount, is_pending, card_id, card_last4, card_holder, employee_id, status, memo, allocated_amount, non_grant_amount, in_grant_scope";

export async function loadTransactions(db: SupabaseClient, viewer: PexViewer, f: TxFilters) {
  // Which cards are in scope.
  let cq = db.from("pex_cards").select("id, first_name, last_name, last4, card_status, available_balance, employee_id, office_id, grant_eligible, is_virtual");
  if (!viewer.isAdmin) cq = cq.eq("employee_id", viewer.employeeId);
  const { data: cards } = await cq;
  let scoped = cards ?? [];
  if (f.office) scoped = scoped.filter((c) => c.office_id === f.office);
  if (f.use === "grant") scoped = scoped.filter((c) => c.grant_eligible);
  if (f.use === "other") scoped = scoped.filter((c) => !c.grant_eligible);
  if (f.card) scoped = scoped.filter((c) => c.id === f.card);
  const narrowed = !viewer.isAdmin || !!(f.office || f.use || f.card);
  const ids = scoped.map((c) => c.id);
  if (narrowed && !ids.length) return { rows: [], cards: cards ?? [] };

  const { start, end } = monthBounds(f.month);
  const rows = await fetchAll<Record<string, unknown>>((from, to) => {
    let q = db.from("gm_pex_transactions").select(TX_COLS).gte("transaction_date", start).lte("transaction_date", end).order("transaction_date", { ascending: false }).order("transaction_time", { ascending: false }).range(from, to);
    if (narrowed) q = q.in("card_id", ids);
    if (f.pending) q = q.eq("is_pending", true);
    if (f.q) q = q.ilike("merchant", `%${f.q.replace(/[%_,()]/g, " ")}%`);
    return q;
  });
  return { rows, cards: cards ?? [] };
}
