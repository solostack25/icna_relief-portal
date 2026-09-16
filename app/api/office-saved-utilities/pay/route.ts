import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { startFinanceTicketApproval } from "@/lib/financeTickets";

type PaymentInput = { savedUtilityId: string; amount: number };

// Pays 1+ saved utilities in one call. For each: creates a real
// finance_utilities detail row (copying the saved template's static
// fields + this period's amount) and a finance_tickets row - the same
// two inserts the manual "Utility Payment" ticket form makes (see the
// single-record branch of /api/finance-tickets) - then routes it for
// approval exactly like any other ticket. Requestor is always the
// person clicking Pay, since that's whose manager chain gets asked to
// approve it, not whoever originally saved the template.
//
// Each payment succeeds or fails independently - one bad amount or a
// deleted vendor shouldn't block the rest of the office's bills from
// going out.
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: me } = await supabase.from("employees").select("id").eq("auth_user_id", user.id).single();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const payments: PaymentInput[] = body?.payments ?? [];
  if (!Array.isArray(payments) || payments.length === 0) {
    return NextResponse.json({ error: "At least one payment is required" }, { status: 400 });
  }

  const results: { savedUtilityId: string; ok: boolean; ticketId?: string; ticketNumber?: string; warning?: string; error?: string }[] = [];

  for (const payment of payments) {
    try {
      if (!payment.amount || payment.amount <= 0) {
        throw new Error("Amount must be greater than $0");
      }

      // RLS on office_saved_utilities scopes this select to the
      // caller's own office (or admin) - a savedUtilityId for another
      // office simply comes back empty and fails cleanly below,
      // rather than paying someone else's bill.
      const { data: saved, error: savedErr } = await supabase
        .from("office_saved_utilities")
        .select("*")
        .eq("id", payment.savedUtilityId)
        .eq("is_active", true)
        .single();
      if (savedErr || !saved) throw new Error("Saved utility not found");

      const { data: detailRow, error: detailErr } = await supabase
        .from("finance_utilities")
        .insert({
          requestor_id: me.id,
          vendor_name: saved.vendor_name,
          utility_type: saved.utility_type,
          other_utility_name: saved.other_utility_name,
          billing_office_id: saved.office_id,
          billing_programs: saved.billing_programs,
          expense_date: new Date().toISOString().slice(0, 10),
          grant_eligible: saved.grant_eligible,
          grant_id: saved.grant_id,
          poc_is_icna_member: saved.poc_is_icna_member,
          poc_user_id: saved.poc_user_id,
          poc_name: saved.poc_name,
          service_location_name: saved.service_location_name,
          service_address_line1: saved.service_address_line1,
          service_city: saved.service_city,
          service_zip_code: saved.service_zip_code,
          pin_number: saved.pin_number,
          total_amount: payment.amount,
          notes: saved.notes,
        })
        .select("id")
        .single();
      if (detailErr || !detailRow) throw new Error(detailErr?.message ?? "Couldn't create utility detail");

      const monthLabel = new Date().toLocaleDateString("en-US", { month: "long", year: "numeric" });
      const { data: ticket, error: ticketErr } = await supabase
        .from("finance_tickets")
        .insert({
          title: `${saved.vendor_name} \u2014 ${monthLabel}`,
          category: "utility_payment",
          requestor_id: me.id,
          billing_office_id: saved.office_id,
          grant_eligible: saved.grant_eligible,
          priority: "normal",
          submitted_at: new Date().toISOString(),
          utility_id: detailRow.id,
          total: payment.amount,
        })
        .select("id, ticket_number")
        .single();
      if (ticketErr || !ticket) throw new Error(ticketErr?.message ?? "Couldn't create ticket");

      try {
        await startFinanceTicketApproval(ticket.id);
      } catch (routeErr) {
        results.push({
          savedUtilityId: payment.savedUtilityId,
          ok: true,
          ticketId: ticket.id,
          ticketNumber: ticket.ticket_number,
          warning: `Ticket created but routing failed: ${routeErr instanceof Error ? routeErr.message : "unknown error"}`,
        });
        continue;
      }

      results.push({ savedUtilityId: payment.savedUtilityId, ok: true, ticketId: ticket.id, ticketNumber: ticket.ticket_number });
    } catch (err) {
      results.push({ savedUtilityId: payment.savedUtilityId, ok: false, error: err instanceof Error ? err.message : "Something went wrong" });
    }
  }

  return NextResponse.json({ results });
}
