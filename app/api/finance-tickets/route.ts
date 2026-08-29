import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { startFinanceTicketApproval } from "@/lib/financeTickets";
import { SINGLE_RECORD_CATEGORIES } from "@/lib/financeTicketForms";

const VALID_CATEGORIES = [
  "credit_card_reimbursement",
  "honorarium",
  "mileage_reimbursement",
  "pex_new_card_request",
  "pex_recharge_request",
  "utility_payment",
  "vendor_payment",
];

// Which finance_tickets column points at this category's detail row.
const DETAIL_FK_COLUMN: Record<string, string> = {
  honorarium: "honorarium_id",
  utility_payment: "utility_id",
  vendor_payment: "vendor_id",
  pex_new_card_request: "pex_new_request_id",
  pex_recharge_request: "pex_recharge_request_id",
};

async function requireEmployee() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, status: 401 as const };
  const { data: me } = await supabase.from("employees").select("id, role, assigned_office_id").eq("auth_user_id", user.id).single();
  if (!me) return { ok: false as const, status: 401 as const };
  return { ok: true as const, supabase, employeeId: me.id, role: me.role, assignedOfficeId: me.assigned_office_id };
}

export async function GET() {
  const auth = await requireEmployee();
  if (!auth.ok) return NextResponse.json({ error: "Unauthorized" }, { status: auth.status });

  // RLS scopes this to the requestor's own tickets, tickets they're
  // the assigned technician on, or everything for admins.
  const { data, error } = await auth.supabase
    .from("finance_tickets")
    .select("id, ticket_number, title, category, total, status, priority, submitted_at, created_at")
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ tickets: data });
}

// Inserts the grant/office allocation rows for one line item (a
// credit card transaction or a mileage trip) - shared by both batch
// categories below rather than duplicated per category.
async function insertAllocations(
  supabase: Awaited<ReturnType<typeof createClient>>,
  refColumn: "credit_card_transaction_id" | "mileage_trip_id",
  refId: string,
  grantAllocations?: { grant_id: string; allocated_amount?: number; allocated_percentage?: number }[],
  officeIds?: string[]
) {
  if (grantAllocations?.length) {
    await supabase.from("finance_ticket_grant_allocations").insert(
      grantAllocations.map((g) => ({ [refColumn]: refId, grant_id: g.grant_id, allocated_amount: g.allocated_amount, allocated_percentage: g.allocated_percentage }))
    );
  }
  if (officeIds?.length) {
    await supabase.from("finance_ticket_office_allocations").insert(officeIds.map((office_id) => ({ [refColumn]: refId, office_id })));
  }
}

export async function POST(req: Request) {
  const auth = await requireEmployee();
  if (!auth.ok) return NextResponse.json({ error: "Unauthorized" }, { status: auth.status });

  const body = await req.json();
  if (!body.title?.trim() || !VALID_CATEGORIES.includes(body.category)) {
    return NextResponse.json({ error: "Title and a valid category are required" }, { status: 400 });
  }

  const ticketBase = {
    title: body.title.trim(),
    category: body.category,
    requestor_id: auth.employeeId,
    billing_office_id: body.billing_office_id ?? auth.assignedOfficeId ?? null,
    grant_eligible: !!body.grant_eligible,
    priority: body.priority ?? "normal",
    submitted_at: new Date().toISOString(),
  };

  let ticketId: string;
  let ticketNumber: string;

  try {
    if (body.category === "credit_card_reimbursement") {
      const { statement, transactions } = body;
      if (!statement || !Array.isArray(transactions) || transactions.length === 0) {
        return NextResponse.json({ error: "A statement header and at least one transaction are required" }, { status: 400 });
      }
      const { data: statementRow, error: statementErr } = await auth.supabase
        .from("finance_credit_card_statements")
        .insert({ ...statement, requestor_id: auth.employeeId, transaction_count: transactions.length })
        .select("id")
        .single();
      if (statementErr || !statementRow) throw new Error(statementErr?.message ?? "Couldn't create credit card statement");

      let total = 0;
      for (const txn of transactions) {
        const { grant_allocations, office_ids, ...txnFields } = txn;
        const { data: txnRow, error: txnErr } = await auth.supabase
          .from("finance_credit_card_transactions")
          .insert({ ...txnFields, statement_id: statementRow.id })
          .select("id, receipt_total")
          .single();
        if (txnErr || !txnRow) throw new Error(txnErr?.message ?? "Couldn't create a credit card transaction");
        total += Number(txnRow.receipt_total ?? 0);
        await insertAllocations(auth.supabase, "credit_card_transaction_id", txnRow.id, grant_allocations, office_ids);
      }

      const { data: ticket, error } = await auth.supabase
        .from("finance_tickets")
        .insert({ ...ticketBase, credit_card_statement_id: statementRow.id, total: body.total ?? total })
        .select("id, ticket_number")
        .single();
      if (error || !ticket) throw new Error(error?.message ?? "Couldn't create ticket");
      ticketId = ticket.id;
      ticketNumber = ticket.ticket_number;
    } else if (body.category === "mileage_reimbursement") {
      const { batch, trips } = body;
      if (!batch || !Array.isArray(trips) || trips.length === 0) {
        return NextResponse.json({ error: "A batch header and at least one trip are required" }, { status: 400 });
      }
      const { data: batchRow, error: batchErr } = await auth.supabase
        .from("finance_mileage_batches")
        .insert({ ...batch, requestor_id: auth.employeeId, trip_count: trips.length })
        .select("id")
        .single();
      if (batchErr || !batchRow) throw new Error(batchErr?.message ?? "Couldn't create mileage batch");

      let total = 0;
      for (const trip of trips) {
        const { grant_allocations, office_ids, ...tripFields } = trip;
        const { data: tripRow, error: tripErr } = await auth.supabase
          .from("finance_mileage_trips")
          .insert({ ...tripFields, batch_id: batchRow.id })
          .select("id, mileage_reimbursement")
          .single();
        if (tripErr || !tripRow) throw new Error(tripErr?.message ?? "Couldn't create a mileage trip");
        total += Number(tripRow.mileage_reimbursement ?? 0);
        await insertAllocations(auth.supabase, "mileage_trip_id", tripRow.id, grant_allocations, office_ids);
      }

      const { data: ticket, error } = await auth.supabase
        .from("finance_tickets")
        .insert({ ...ticketBase, mileage_batch_id: batchRow.id, total: body.total ?? total })
        .select("id, ticket_number")
        .single();
      if (error || !ticket) throw new Error(error?.message ?? "Couldn't create ticket");
      ticketId = ticket.id;
      ticketNumber = ticket.ticket_number;
    } else {
      const config = SINGLE_RECORD_CATEGORIES[body.category];
      if (!config) return NextResponse.json({ error: "Unsupported category" }, { status: 400 });

      const detail = body.detail ?? {};
      const { data: detailRow, error: detailErr } = await auth.supabase
        .from(config.table)
        .insert({ ...detail, requestor_id: auth.employeeId })
        .select("id" + (config.totalField ? `, ${config.totalField}` : ""))
        .single();
      if (detailErr || !detailRow) throw new Error(detailErr?.message ?? `Couldn't create ${body.category} detail`);
      const detailRecord = detailRow as unknown as Record<string, unknown>;

      const total = body.total ?? (config.totalField ? Number(detailRecord[config.totalField] ?? 0) : 0);
      const fkColumn = DETAIL_FK_COLUMN[body.category];
      const { data: ticket, error } = await auth.supabase
        .from("finance_tickets")
        .insert({ ...ticketBase, [fkColumn]: detailRecord.id, total })
        .select("id, ticket_number")
        .single();
      if (error || !ticket) throw new Error(error?.message ?? "Couldn't create ticket");
      ticketId = ticket.id;
      ticketNumber = ticket.ticket_number;
    }
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Something went wrong" }, { status: 500 });
  }

  try {
    await startFinanceTicketApproval(ticketId);
  } catch (err) {
    return NextResponse.json({
      ticket: { id: ticketId, ticket_number: ticketNumber },
      warning: `Ticket created but routing failed: ${err instanceof Error ? err.message : "unknown error"}`,
    });
  }

  return NextResponse.json({ ticket: { id: ticketId, ticket_number: ticketNumber } });
}
