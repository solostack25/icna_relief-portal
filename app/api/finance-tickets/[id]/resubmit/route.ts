import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resubmitFinanceTicket } from "@/lib/financeTickets";

// Which finance_tickets column points at this category's detail row,
// and which table that row lives in - same mapping as
// app/api/finance-tickets/route.ts uses for the single-record
// categories.
const EDITABLE_DETAIL: Record<string, { fkColumn: string; table: string }> = {
  honorarium: { fkColumn: "honorarium_id", table: "finance_honorariums" },
  utility_payment: { fkColumn: "utility_id", table: "finance_utilities" },
  vendor_payment: { fkColumn: "vendor_id", table: "finance_vendors" },
  pex_new_card_request: { fkColumn: "pex_new_request_id", table: "finance_pex_new_requests" },
  pex_recharge_request: { fkColumn: "pex_recharge_request_id", table: "finance_pex_recharge_requests" },
};

async function insertAllocations(
  supabase: Awaited<ReturnType<typeof createClient>>,
  refColumn: "credit_card_transaction_id" | "mileage_trip_id",
  refId: string,
  grantAllocations?: { grant_id: string; allocated_amount?: number; allocated_percentage?: number }[],
  officeIds?: string[]
) {
  if (grantAllocations?.length) {
    await supabase
      .from("finance_ticket_grant_allocations")
      .insert(grantAllocations.map((g) => ({ [refColumn]: refId, grant_id: g.grant_id, allocated_amount: g.allocated_amount, allocated_percentage: g.allocated_percentage })));
  }
  if (officeIds?.length) {
    await supabase.from("finance_ticket_office_allocations").insert(officeIds.map((office_id) => ({ [refColumn]: refId, office_id })));
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { data: me } = await supabase.from("employees").select("id").eq("auth_user_id", user.id).single();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const { data: ticket } = await supabase
    .from("finance_tickets")
    .select("id, requestor_id, status, category, total, credit_card_statement_id, mileage_batch_id")
    .eq("id", id)
    .single();
  if (!ticket) return NextResponse.json({ error: "Ticket not found" }, { status: 404 });
  if (ticket.requestor_id !== me.id) return NextResponse.json({ error: "Only the requestor can resubmit this ticket" }, { status: 403 });
  if (ticket.status !== "fixing") return NextResponse.json({ error: "This ticket isn't awaiting changes" }, { status: 400 });

  const body = await req.json().catch(() => ({}));
  let newTotal: number | undefined = body.total;

  try {
    if (ticket.category === "credit_card_reimbursement" && body.statement && Array.isArray(body.transactions)) {
      if (!ticket.credit_card_statement_id) throw new Error("No statement found for this ticket");
      const { error: statementErr } = await supabase.from("finance_credit_card_statements").update(body.statement).eq("id", ticket.credit_card_statement_id);
      if (statementErr) throw new Error(statementErr.message);

      // Replace-all rather than diff individual rows - simpler and
      // correct given RLS scopes this whole write to "own ticket,
      // still in fixing status" (see finance_tickets_batch_edit_migration.sql).
      // Cascade delete on finance_credit_card_transactions also
      // removes their allocation rows.
      await supabase.from("finance_credit_card_transactions").delete().eq("statement_id", ticket.credit_card_statement_id);

      let total = 0;
      for (const txn of body.transactions) {
        const { grant_allocations, office_ids, ...txnFields } = txn;
        const { data: txnRow, error: txnErr } = await supabase
          .from("finance_credit_card_transactions")
          .insert({ ...txnFields, statement_id: ticket.credit_card_statement_id })
          .select("id, receipt_total")
          .single();
        if (txnErr || !txnRow) throw new Error(txnErr?.message ?? "Couldn't save a transaction");
        total += Number(txnRow.receipt_total ?? 0);
        await insertAllocations(supabase, "credit_card_transaction_id", txnRow.id, grant_allocations, office_ids);
      }
      newTotal = body.total ?? total;
    } else if (ticket.category === "mileage_reimbursement" && body.batch && Array.isArray(body.trips)) {
      if (!ticket.mileage_batch_id) throw new Error("No mileage batch found for this ticket");
      const { error: batchErr } = await supabase.from("finance_mileage_batches").update(body.batch).eq("id", ticket.mileage_batch_id);
      if (batchErr) throw new Error(batchErr.message);

      await supabase.from("finance_mileage_trips").delete().eq("batch_id", ticket.mileage_batch_id);

      let total = 0;
      for (const trip of body.trips) {
        const { grant_allocations, office_ids, ...tripFields } = trip;
        const { data: tripRow, error: tripErr } = await supabase
          .from("finance_mileage_trips")
          .insert({ ...tripFields, batch_id: ticket.mileage_batch_id })
          .select("id, mileage_reimbursement")
          .single();
        if (tripErr || !tripRow) throw new Error(tripErr?.message ?? "Couldn't save a trip");
        total += Number(tripRow.mileage_reimbursement ?? 0);
        await insertAllocations(supabase, "mileage_trip_id", tripRow.id, grant_allocations, office_ids);
      }
      newTotal = body.total ?? total;
    } else if (body.detail && Object.keys(body.detail).length > 0) {
      const editable = EDITABLE_DETAIL[ticket.category];
      if (!editable) {
        return NextResponse.json({ error: "This ticket type doesn't support inline editing here - contact Finance to make changes." }, { status: 400 });
      }
      const { data: ticketFk } = await supabase.from("finance_tickets").select(editable.fkColumn).eq("id", id).single();
      const fkValue = (ticketFk as unknown as Record<string, string>)?.[editable.fkColumn];
      if (!fkValue) return NextResponse.json({ error: "Couldn't find the detail record to update" }, { status: 500 });

      const { error: detailErr } = await supabase.from(editable.table).update(body.detail).eq("id", fkValue);
      if (detailErr) throw new Error(detailErr.message);
    }
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Something went wrong saving your changes" }, { status: 500 });
  }

  if (body.title || newTotal !== undefined) {
    await supabase
      .from("finance_tickets")
      .update({ ...(body.title ? { title: body.title } : {}), ...(newTotal !== undefined ? { total: newTotal } : {}) })
      .eq("id", id);
  }

  const result = await resubmitFinanceTicket(id);
  return NextResponse.json(result);
}
