import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { requireCopilotAuth, lookupEmployeeByEmail } from "@/lib/copilotAuth";
import { financeTicketStatusLabel } from "@/lib/financeTicketStatus";
import { CATEGORY_LABELS } from "@/lib/financeTicketForms";

// Same "own tickets, open by default" shape as
// /api/copilot/helpdesk/my-tickets, for the same reason: someone
// asking the assistant about their own request shouldn't need to know
// which of the two ticket systems (Help Desk vs Finance Tickets) it
// actually lives in.
const TERMINAL_STATUSES = ["processed", "denied", "duplicate"];

export async function POST(req: Request) {
  const authError = await requireCopilotAuth(req);
  if (authError) return authError;

  const { requesterEmail, statusFilter } = (await req.json()) as { requesterEmail: string; statusFilter?: "open" | "all" };
  if (!requesterEmail?.trim()) {
    return NextResponse.json({ error: "requesterEmail is required" }, { status: 400 });
  }

  const requester = await lookupEmployeeByEmail(requesterEmail);
  if (!requester) {
    return NextResponse.json({ error: "No employee record found for this requester." }, { status: 404 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("finance_tickets")
    .select("id, ticket_number, title, category, total, status, submitted_at")
    .eq("requestor_id", requester.id)
    .order("submitted_at", { ascending: false })
    .limit(15);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = data ?? [];
  const filtered = (statusFilter ?? "open") === "open" ? rows.filter((t: { status: string }) => !TERMINAL_STATUSES.includes(t.status)) : rows;

  return NextResponse.json({
    tickets: filtered.map((t: { ticket_number: string; title: string; category: string; total: number; status: string; submitted_at: string | null; id: string }) => ({
      ticketNumber: t.ticket_number,
      title: t.title,
      category: CATEGORY_LABELS[t.category] ?? t.category,
      total: t.total,
      status: financeTicketStatusLabel(t.status),
      submittedAt: t.submitted_at,
      url: `/finance-tickets/${t.id}`,
    })),
  });
}
