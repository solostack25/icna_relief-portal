import type { SupabaseClient } from "@supabase/supabase-js";

const DETAIL_LOOKUP: Record<string, { fkColumn: string; table: string }> = {
  honorarium: { fkColumn: "honorarium_id", table: "finance_honorariums" },
  utility_payment: { fkColumn: "utility_id", table: "finance_utilities" },
  vendor_payment: { fkColumn: "vendor_id", table: "finance_vendors" },
  pex_new_card_request: { fkColumn: "pex_new_request_id", table: "finance_pex_new_requests" },
  pex_recharge_request: { fkColumn: "pex_recharge_request_id", table: "finance_pex_recharge_requests" },
};

// Given a finance_tickets row (must include category + all its
// detail_id columns), fetches whatever type-specific detail exists
// for it - a header + line items for the two batch categories
// (Credit Card, Mileage), or a single record for everything else.
export async function getFinanceTicketDetail(
  admin: SupabaseClient,
  ticket: {
    category: string;
    credit_card_statement_id?: string | null;
    mileage_batch_id?: string | null;
    [key: string]: unknown;
  }
): Promise<unknown> {
  if (ticket.category === "credit_card_reimbursement" && ticket.credit_card_statement_id) {
    const { data: statement } = await admin.from("finance_credit_card_statements").select("*").eq("id", ticket.credit_card_statement_id).single();
    const { data: transactions } = await admin.from("finance_credit_card_transactions").select("*").eq("statement_id", ticket.credit_card_statement_id);
    return { statement, transactions };
  }
  if (ticket.category === "mileage_reimbursement" && ticket.mileage_batch_id) {
    const { data: batch } = await admin.from("finance_mileage_batches").select("*").eq("id", ticket.mileage_batch_id).single();
    const { data: trips } = await admin.from("finance_mileage_trips").select("*").eq("batch_id", ticket.mileage_batch_id);
    return { batch, trips };
  }
  const lookup = DETAIL_LOOKUP[ticket.category];
  const fkValue = lookup ? (ticket[lookup.fkColumn] as string | null) : null;
  if (lookup && fkValue) {
    const { data: row } = await admin.from(lookup.table).select("*").eq("id", fkValue).single();
    return row;
  }
  return null;
}
