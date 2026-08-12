import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { getFinanceAdminAccess } from "@/lib/financeAdminAccess";

export async function GET() {
  const access = await getFinanceAdminAccess();
  if (!access.ok) return NextResponse.json({ error: "Not authorized" }, { status: access.status });

  const admin = createAdminClient();
  const { data: requests, error } = await admin
    .from("finance_approval_requests")
    .select("*, finance_approval_steps(*)")
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const requestIds = (requests ?? []).map((r: { request_id: string }) => r.request_id);
  const { data: tickets } = await admin
    .from("helpdesk_requests")
    .select("id, title, submitted_by, submitted_by_email")
    .in("id", requestIds.length ? requestIds : ["00000000-0000-0000-0000-000000000000"]);
  type TicketRow = { id: string; title: string; submitted_by: string; submitted_by_email: string };
  const ticketMap = new Map(((tickets ?? []) as TicketRow[]).map((t) => [t.id, t]));

  const enriched = (requests ?? []).map((r: any) => {
    const steps = [...r.finance_approval_steps].sort((a: any, b: any) => a.step_order - b.step_order);
    const pendingStep = steps.find((s: any) => s.status === "pending") ?? null;
    return {
      id: r.id,
      request_id: r.request_id,
      amount: r.amount,
      status: r.status,
      final_tier_name: r.final_tier_name,
      created_at: r.created_at,
      completed_at: r.completed_at,
      ticket: ticketMap.get(r.request_id) ?? null,
      steps,
      pendingApprover: pendingStep
        ? { name: pendingStep.approver_name, email: pendingStep.approver_email, jobTitle: pendingStep.chain_person_job_title }
        : null,
    };
  });

  return NextResponse.json({ requests: enriched });
}
