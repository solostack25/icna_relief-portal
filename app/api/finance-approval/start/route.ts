import { NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { startFinanceApproval } from "@/lib/financeApproval";

// Called right after the wizard creates a finance ticket with an amount.
// Requires a real portal login (the ticket was just created by this same
// session) - this isn't the token-authed path, it's the kickoff.
export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { data: me } = await supabase
    .from("employees")
    .select("email")
    .eq("auth_user_id", user.id)
    .single();
  if (!me) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  const { requestId, amount } = await req.json();
  if (!requestId || typeof amount !== "number" || amount <= 0) {
    return NextResponse.json({ error: "requestId and a positive amount are required" }, { status: 400 });
  }

  const admin = createAdminClient();

  // Confirm this ticket really was just submitted by this same person -
  // don't let an arbitrary logged-in user kick off approval chains
  // against tickets they didn't submit.
  const { data: ticket } = await admin
    .from("helpdesk_requests")
    .select("submitted_by_email")
    .eq("id", requestId)
    .single();
  if (!ticket || ticket.submitted_by_email.toLowerCase() !== me.email.toLowerCase()) {
    return NextResponse.json({ error: "Not authorized for this request" }, { status: 403 });
  }

  const { error: insertError } = await admin
    .from("finance_approval_requests")
    .insert({ request_id: requestId, amount });
  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  try {
    await startFinanceApproval({ requestId, amount, submitterEmail: me.email });
  } catch (err: any) {
    // The ticket and finance_approval_requests row already exist even if
    // this fails - surface the error rather than losing it silently, but
    // don't roll back the ticket itself.
    return NextResponse.json({ error: `Approval chain failed to start: ${err.message}` }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
