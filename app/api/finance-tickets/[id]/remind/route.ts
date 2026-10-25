import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { pushRemindCurrentApprover } from "@/lib/financeTickets";

// "Remind" on the ticket page: push notification to the approver the
// ticket is waiting on. Anyone who can see the ticket may press it; it's
// limited to once a week per ticket (see pushRemindCurrentApprover).
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { data: me } = await supabase.from("employees").select("id").eq("auth_user_id", user.id).maybeSingle();

  const { id } = await params;
  // RLS decides whether this person can see (and so remind on) the ticket.
  const { data: ticket } = await supabase.from("finance_tickets").select("id, status").eq("id", id).maybeSingle();
  if (!ticket) return NextResponse.json({ error: "Ticket not found" }, { status: 404 });
  if (ticket.status !== "pending") return NextResponse.json({ error: "This ticket isn't waiting on an approval." }, { status: 400 });

  const r = await pushRemindCurrentApprover(id, me?.id ?? null);
  if (!r.ok) return NextResponse.json({ error: r.error, nextAvailableAt: "nextAvailableAt" in r ? r.nextAvailableAt : null }, { status: 400 });
  return NextResponse.json(r);
}
