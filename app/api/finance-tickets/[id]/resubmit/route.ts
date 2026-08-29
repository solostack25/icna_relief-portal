import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resubmitFinanceTicket } from "@/lib/financeTickets";

// Which finance_tickets column points at this category's detail row,
// and which table that row lives in - same mapping as
// app/api/finance-tickets/route.ts uses for the single-record
// categories (Credit Card and Mileage are batch/line-item shaped and
// are not editable through this endpoint - they resubmit as-is).
const EDITABLE_DETAIL: Record<string, { fkColumn: string; table: string }> = {
  honorarium: { fkColumn: "honorarium_id", table: "finance_honorariums" },
  utility_payment: { fkColumn: "utility_id", table: "finance_utilities" },
  vendor_payment: { fkColumn: "vendor_id", table: "finance_vendors" },
  pex_new_card_request: { fkColumn: "pex_new_request_id", table: "finance_pex_new_requests" },
  pex_recharge_request: { fkColumn: "pex_recharge_request_id", table: "finance_pex_recharge_requests" },
};

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { data: me } = await supabase.from("employees").select("id").eq("auth_user_id", user.id).single();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const { data: ticket } = await supabase.from("finance_tickets").select("id, requestor_id, status, category, total").eq("id", id).single();
  if (!ticket) return NextResponse.json({ error: "Ticket not found" }, { status: 404 });
  if (ticket.requestor_id !== me.id) return NextResponse.json({ error: "Only the requestor can resubmit this ticket" }, { status: 403 });
  if (ticket.status !== "fixing") return NextResponse.json({ error: "This ticket isn't awaiting changes" }, { status: 400 });

  const body = await req.json().catch(() => ({}));

  // Apply edits to the type-specific detail row (RLS only allows this
  // while status is still 'fixing' - see
  // finance_tickets_resubmit_edit_migration.sql).
  if (body.detail && Object.keys(body.detail).length > 0) {
    const editable = EDITABLE_DETAIL[ticket.category];
    if (!editable) {
      return NextResponse.json({ error: "This ticket type doesn't support inline editing here - contact Finance to make changes." }, { status: 400 });
    }
    const { data: ticketFk } = await supabase.from("finance_tickets").select(editable.fkColumn).eq("id", id).single();
    const fkValue = (ticketFk as unknown as Record<string, string>)?.[editable.fkColumn];
    if (!fkValue) return NextResponse.json({ error: "Couldn't find the detail record to update" }, { status: 500 });

    const { error: detailErr } = await supabase.from(editable.table).update(body.detail).eq("id", fkValue);
    if (detailErr) return NextResponse.json({ error: detailErr.message }, { status: 500 });
  }

  if (body.title || body.total) {
    await supabase
      .from("finance_tickets")
      .update({ ...(body.title ? { title: body.title } : {}), ...(body.total ? { total: body.total } : {}) })
      .eq("id", id);
  }

  const result = await resubmitFinanceTicket(id);
  return NextResponse.json(result);
}
