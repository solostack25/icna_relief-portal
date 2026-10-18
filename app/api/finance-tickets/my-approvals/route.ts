import { NextResponse } from "next/server";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { decideFinanceTicketApproval } from "@/lib/financeTickets";

export const dynamic = "force-dynamic";

async function me() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase.from("employees").select("id, email").eq("auth_user_id", user.id).maybeSingle();
  return data?.email ? data : null;
}

// GET — finance tickets currently waiting on the signed-in person's approval
// (including ones they're covering for someone else).
export async function GET() {
  const emp = await me();
  if (!emp) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const admin = createAdminClient();
  const { data: steps, error } = await admin
    .from("finance_approvals")
    .select("finance_ticket_id, approval_level, is_final_approval, acting_as_delegate_for_email, chain_person_name, created_at, revision_number")
    .eq("is_current_step", true)
    .eq("approval_status", "pending")
    .ilike("approver_email", emp.email);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const rows: any[] = steps ?? [];
  const ids = rows.map((s) => s.finance_ticket_id);
  const { data: tickets } = ids.length
    ? await admin
        .from("finance_tickets")
        .select("id, ticket_number, title, category, total, status, submitted_at, billing_office_id, grant_eligible, requestor:requestor_id(first_name, last_name)")
        .in("id", ids)
    : { data: [] };
  const byId = new Map((tickets ?? []).map((t: any) => [t.id, t]));
  return NextResponse.json({
    approvals: rows
      .map((s: any) => ({ ...s, ticket: byId.get(s.finance_ticket_id) ?? null }))
      .filter((s: any) => s.ticket && !["processed", "denied", "duplicate"].includes(s.ticket.status))
      .sort((a: any, b: any) => String(a.created_at).localeCompare(String(b.created_at))),
  });
}

// POST { ticket_id, decision: "approve" | "reject" | "fix", notes? }
// Decides the signed-in person's own pending step — same engine as the
// emailed approval link, so escalation and notifications are unchanged.
export async function POST(req: Request) {
  const emp = await me();
  if (!emp) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  if (!["approve", "reject", "fix"].includes(body.decision)) return NextResponse.json({ error: "Pick approve, send back, or deny" }, { status: 400 });
  if ((body.decision === "reject" || body.decision === "fix") && !String(body.notes ?? "").trim()) {
    return NextResponse.json({ error: "Add a note so the requestor knows why" }, { status: 400 });
  }
  const admin = createAdminClient();
  const { data: step } = await admin
    .from("finance_approvals")
    .select("approval_token")
    .eq("finance_ticket_id", String(body.ticket_id ?? ""))
    .eq("is_current_step", true)
    .eq("approval_status", "pending")
    .ilike("approver_email", emp.email)
    .maybeSingle();
  if (!step) return NextResponse.json({ error: "This ticket isn't waiting on your approval anymore." }, { status: 409 });
  try {
    const result = await decideFinanceTicketApproval({ token: step.approval_token, decision: body.decision, notes: String(body.notes ?? "").trim() || undefined });
    if (!result.ok) return NextResponse.json({ error: (result as any).error }, { status: 400 });
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Something went wrong" }, { status: 500 });
  }
}
