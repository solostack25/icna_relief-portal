import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { requireCopilotAuth, lookupEmployeeByEmail } from "@/lib/copilotAuth";
import { startFinanceTicketApproval } from "@/lib/financeTickets";

// Friendly free-text -> the real utility_type enum, so "pay my
// internet bill" matches a saved utility with utility_type =
// "internet_phone" even though the employee never says that word.
// Matching below also always checks vendor_name/other_utility_name
// directly, so "pay the Spectrum bill" or "pay the FPL bill" work
// without this map at all.
const TYPE_ALIASES: Record<string, string> = {
  electric: "electricity",
  electricity: "electricity",
  power: "electricity",
  water: "water_sewer",
  sewer: "water_sewer",
  "water & sewer": "water_sewer",
  gas: "gas_heating",
  heating: "gas_heating",
  internet: "internet_phone",
  phone: "internet_phone",
  wifi: "internet_phone",
  security: "security_alarm",
  alarm: "security_alarm",
  trash: "trash_recycling",
  recycling: "trash_recycling",
  garbage: "trash_recycling",
};

export async function POST(req: Request) {
  const authError = await requireCopilotAuth(req);
  if (authError) return authError;

  const { requesterEmail, utility, amount } = (await req.json()) as {
    requesterEmail: string;
    utility?: string;
    amount?: number;
  };

  if (!requesterEmail?.trim()) return NextResponse.json({ error: "requesterEmail is required" }, { status: 400 });
  if (!utility?.trim()) return NextResponse.json({ error: "utility is required (e.g. \"internet\", \"Spectrum\", \"electric\")" }, { status: 400 });
  if (!amount || amount <= 0) return NextResponse.json({ error: "A positive amount is required" }, { status: 400 });

  const requester = await lookupEmployeeByEmail(requesterEmail);
  if (!requester) {
    return NextResponse.json({ error: "No employee record found for this requester." }, { status: 404 });
  }
  // The requester's OWN assigned office is the only office this tool
  // will ever touch - there's no session/RLS here to fall back on
  // (this route authenticates by API key, not a browser session), so
  // this office_id is the entire access boundary. requesterEmail
  // itself is trusted because it's injected by the Portal Assistant
  // from the caller's actual signed-in session, never taken from
  // anything the employee typed - see lib/ai/tools.ts.
  if (!requester.assigned_office_id) {
    return NextResponse.json({
      error: "You don't have an office assigned on file, so I can't tell which office's saved utilities to use. Add one from your office dashboard first.",
    });
  }

  const admin = createAdminClient();
  const { data: saved, error: savedErr } = await admin
    .from("office_saved_utilities")
    .select("*")
    .eq("office_id", requester.assigned_office_id)
    .eq("is_active", true);
  if (savedErr) return NextResponse.json({ error: savedErr.message }, { status: 500 });

  type SavedUtility = {
    id: string;
    office_id: string;
    vendor_name: string;
    utility_type: string | null;
    other_utility_name: string | null;
    billing_programs: string[] | null;
    grant_eligible: boolean;
    grant_id: string | null;
    poc_is_icna_member: boolean;
    poc_user_id: string | null;
    poc_name: string | null;
    service_location_name: string | null;
    service_address_line1: string | null;
    service_city: string | null;
    service_zip_code: string | null;
    pin_number: string | null;
    notes: string | null;
  };
  const savedUtilities = (saved ?? []) as SavedUtility[];

  const term = utility.trim().toLowerCase();
  const mappedType = TYPE_ALIASES[term];
  const matches = savedUtilities.filter(
    (u) =>
      (mappedType && u.utility_type === mappedType) ||
      u.vendor_name.toLowerCase().includes(term) ||
      (u.other_utility_name && u.other_utility_name.toLowerCase().includes(term)) ||
      (u.utility_type && u.utility_type.replace(/_/g, " ").includes(term))
  );

  if (matches.length === 0) {
    return NextResponse.json({
      error: `No saved utility matching "${utility}" for your office.`,
      availableUtilities: savedUtilities.map((u) => u.vendor_name),
    });
  }
  if (matches.length > 1) {
    return NextResponse.json({
      ambiguous_target: true,
      candidates: matches.map((u) => u.vendor_name),
    });
  }

  const target = matches[0];

  try {
    const { data: detailRow, error: detailErr } = await admin
      .from("finance_utilities")
      .insert({
        requestor_id: requester.id,
        vendor_name: target.vendor_name,
        utility_type: target.utility_type,
        other_utility_name: target.other_utility_name,
        billing_office_id: target.office_id,
        billing_programs: target.billing_programs,
        expense_date: new Date().toISOString().slice(0, 10),
        grant_eligible: target.grant_eligible,
        grant_id: target.grant_id,
        poc_is_icna_member: target.poc_is_icna_member,
        poc_user_id: target.poc_user_id,
        poc_name: target.poc_name,
        service_location_name: target.service_location_name,
        service_address_line1: target.service_address_line1,
        service_city: target.service_city,
        service_zip_code: target.service_zip_code,
        pin_number: target.pin_number,
        total_amount: amount,
        notes: target.notes,
      })
      .select("id")
      .single();
    if (detailErr || !detailRow) throw new Error(detailErr?.message ?? "Couldn't create utility detail");

    const monthLabel = new Date().toLocaleDateString("en-US", { month: "long", year: "numeric" });
    const { data: ticket, error: ticketErr } = await admin
      .from("finance_tickets")
      .insert({
        title: `${target.vendor_name} \u2014 ${monthLabel}`,
        category: "utility_payment",
        requestor_id: requester.id,
        billing_office_id: target.office_id,
        grant_eligible: target.grant_eligible,
        priority: "normal",
        submitted_at: new Date().toISOString(),
        utility_id: detailRow.id,
        total: amount,
      })
      .select("id, ticket_number")
      .single();
    if (ticketErr || !ticket) throw new Error(ticketErr?.message ?? "Couldn't create ticket");

    let warning: string | undefined;
    try {
      await startFinanceTicketApproval(ticket.id);
    } catch (routeErr) {
      warning = `Ticket created but routing failed: ${routeErr instanceof Error ? routeErr.message : "unknown error"}`;
    }

    return NextResponse.json({
      ticketNumber: ticket.ticket_number,
      vendor: target.vendor_name,
      amount,
      url: `/finance-tickets/${ticket.id}`,
      warning,
      message: `Submitted ${ticket.ticket_number} for ${target.vendor_name}, $${amount.toLocaleString()}. It's been routed for approval.`,
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Something went wrong submitting the payment." }, { status: 500 });
  }
}
