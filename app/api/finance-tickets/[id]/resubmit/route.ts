import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resubmitFinanceTicket } from "@/lib/financeTickets";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { data: me } = await supabase.from("employees").select("id").eq("auth_user_id", user.id).single();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const { data: ticket } = await supabase.from("finance_tickets").select("id, requestor_id, status, detail").eq("id", id).single();
  if (!ticket) return NextResponse.json({ error: "Ticket not found" }, { status: 404 });
  if (ticket.requestor_id !== me.id) return NextResponse.json({ error: "Only the requestor can resubmit this ticket" }, { status: 403 });
  if (ticket.status !== "fixing") return NextResponse.json({ error: "This ticket isn't awaiting changes" }, { status: 400 });

  const body = await req.json().catch(() => ({}));
  if (body.detail || body.total || body.title) {
    await supabase
      .from("finance_tickets")
      .update({
        ...(body.detail ? { detail: { ...ticket.detail, ...body.detail } } : {}),
        ...(body.total ? { total: body.total } : {}),
        ...(body.title ? { title: body.title } : {}),
      })
      .eq("id", id);
  }

  const result = await resubmitFinanceTicket(id);
  return NextResponse.json(result);
}
