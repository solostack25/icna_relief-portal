import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";

// Token-authed, deliberately no portal login check - this is the
// standalone magic-link path (see lib/financeApproval.ts's comment on
// why: approvers routinely include people who've never logged into the
// portal). The token itself is the credential.
export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const admin = createAdminClient();

  const { data: step } = await admin
    .from("finance_approval_steps")
    .select("*")
    .eq("approval_token", token)
    .single();
  if (!step) {
    return NextResponse.json({ error: "Approval link not found or expired." }, { status: 404 });
  }

  const { data: far } = await admin
    .from("finance_approval_requests")
    .select("*")
    .eq("id", step.finance_approval_request_id)
    .single();

  const { data: ticket } = await admin
    .from("helpdesk_requests")
    .select("title, description, submitted_by, submitted_by_email, created_at")
    .eq("id", far?.request_id)
    .single();

  const { data: priorSteps } = await admin
    .from("finance_approval_steps")
    .select("step_order, chain_person_name, chain_person_job_title, approver_name, status, decided_at, decision_note")
    .eq("finance_approval_request_id", step.finance_approval_request_id)
    .order("step_order", { ascending: true });

  return NextResponse.json({ step, request: far, ticket, priorSteps: priorSteps ?? [] });
}
