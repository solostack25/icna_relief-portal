import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { startFinanceTicketApproval } from "@/lib/financeTickets";

const VALID_CATEGORIES = [
  "credit_card_reimbursement",
  "honorarium",
  "mileage_reimbursement",
  "pex_new_card_request",
  "pex_recharge_request",
  "utility_payment",
  "vendor_payment",
];

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

export async function POST(req: Request) {
  const auth = await requireEmployee();
  if (!auth.ok) return NextResponse.json({ error: "Unauthorized" }, { status: auth.status });

  const body = await req.json();
  if (!body.title?.trim() || !VALID_CATEGORIES.includes(body.category) || !body.total) {
    return NextResponse.json({ error: "Title, a valid category, and a total amount are required" }, { status: 400 });
  }

  const { data: ticket, error } = await auth.supabase
    .from("finance_tickets")
    .insert({
      title: body.title.trim(),
      category: body.category,
      detail: body.detail ?? {},
      requestor_id: auth.employeeId,
      billing_office_id: body.billing_office_id ?? auth.assignedOfficeId ?? null,
      grant_eligible: !!body.grant_eligible,
      total: body.total,
      priority: body.priority ?? "normal",
      submitted_at: new Date().toISOString(),
    })
    .select("id, ticket_number")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  try {
    await startFinanceTicketApproval(ticket.id);
  } catch (err) {
    return NextResponse.json({ ticket, warning: `Ticket created but routing failed: ${err instanceof Error ? err.message : "unknown error"}` });
  }

  return NextResponse.json({ ticket });
}
