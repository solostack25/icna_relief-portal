import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { getFinanceAdminAccess } from "@/lib/financeAdminAccess";

export async function GET() {
  const access = await getFinanceAdminAccess();
  if (!access.ok) return NextResponse.json({ error: "Not authorized" }, { status: access.status });

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("finance_tickets")
    .select(
      "id, ticket_number, title, category, total, status, priority, grant_eligible, submitted_at, created_at, technician_id, requestor:requestor_id(first_name, last_name, email), technician:technician_id(first_name, last_name)"
    )
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Who each ticket is waiting on right now — this is what the separate
  // "Approval Chains" screen used to show; the queue carries it instead.
  const ids = (data ?? []).map((t: { id: string }) => t.id);
  const { data: current } = ids.length
    ? await admin
        .from("finance_approvals")
        .select("finance_ticket_id, approval_level, chain_person_name, chain_person_job_title, acting_as_delegate_for_email, created_at")
        .in("finance_ticket_id", ids)
        .eq("is_current_step", true)
        .eq("approval_status", "pending")
    : { data: [] };
  const waiting = new Map((current ?? []).map((s: any) => [s.finance_ticket_id, s]));

  return NextResponse.json({
    tickets: (data ?? []).map((t: any) => {
      // A closed ticket can still have a never-decided step (e.g. processed
      // before the approver acted) — don't show it as waiting.
      const s: any = ["processed", "denied", "duplicate"].includes(t.status) ? null : waiting.get(t.id);
      return {
        ...t,
        waiting_on: s
          ? {
              level: s.approval_level,
              name: s.chain_person_name,
              title: s.chain_person_job_title,
              covering: !!s.acting_as_delegate_for_email,
              since: s.created_at,
            }
          : null,
      };
    }),
  });
}
