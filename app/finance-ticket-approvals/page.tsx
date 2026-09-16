import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { CATEGORY_LABELS } from "@/lib/financeTicketForms";

const cardStyle: React.CSSProperties = {
  background: "#fff",
  borderRadius: 16,
  padding: 18,
  boxShadow: "0 3px 12px rgba(22,48,43,0.06)",
  border: "1px solid var(--portal-line, rgba(22,48,43,0.1))",
};

// Purely a visual nudge, same 48h convention the Help Desk uses for
// "overdue" - finance approvals have no formal SLA or reminder email
// yet, just this.
function daysPending(submittedAt: string | null): number {
  if (!submittedAt) return 0;
  return Math.floor((Date.now() - new Date(submittedAt).getTime()) / (1000 * 60 * 60 * 24));
}

export default async function MyApprovalsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/");

  const { data: me } = await supabase.from("employees").select("id, email, first_name").eq("auth_user_id", user.id).single();
  if (!me) redirect("/select-app");

  // RLS (finance_approvals_approver_access_migration.sql) scopes both
  // of the queries below to steps/tickets where this employee is
  // literally the current approver - not just admins/finance staff.
  const { data: steps, error } = await supabase
    .from("finance_approvals")
    .select("id, approval_token, finance_ticket_id, approval_level, is_final_approval, revision_number, acting_as_delegate_for_email, chain_person_name")
    .eq("is_current_step", true)
    .eq("approval_status", "pending")
    .ilike("approver_email", me.email);

  const ticketIds = [...new Set((steps ?? []).map((s) => s.finance_ticket_id))];
  const { data: tickets } = await supabase
    .from("finance_tickets")
    .select("id, ticket_number, title, category, total, submitted_at, employees:requestor_id(first_name, last_name)")
    .in("id", ticketIds.length ? ticketIds : ["00000000-0000-0000-0000-000000000000"]);
  const ticketMap = new Map((tickets ?? []).map((t) => [t.id, t]));

  const items = (steps ?? [])
    .map((s) => {
      const ticket = ticketMap.get(s.finance_ticket_id);
      return ticket ? { step: s, ticket } : null;
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)
    // Oldest first - whoever's waited longest for a decision surfaces
    // at the top, same instinct as the Help Desk's overdue sort.
    .sort((a, b) => new Date(a.ticket.submitted_at ?? 0).getTime() - new Date(b.ticket.submitted_at ?? 0).getTime());

  return (
    <div className="max-w-2xl mx-auto p-6">
      <div className="flex items-center justify-between mb-2">
        <h1 style={{ fontFamily: "'Fraunces', serif", fontStyle: "italic", fontWeight: 500, fontSize: 28, margin: 0 }}>
          My Approvals
        </h1>
        <Link href="/finance-tickets" style={{ fontSize: 13, color: "rgba(22,48,43,0.5)" }}>
          My Tickets →
        </Link>
      </div>
      <p className="text-sm mb-8" style={{ color: "rgba(22,48,43,0.55)" }}>
        Finance tickets waiting on your decision, oldest first.
      </p>

      {error && <p style={{ fontSize: 13, color: "#B5566B" }}>Couldn't load approvals: {error.message}</p>}

      {!error && items.length === 0 && (
        <div style={{ ...cardStyle, textAlign: "center", color: "rgba(22,48,43,0.45)", fontSize: 14 }}>
          Nothing waiting on you right now.
        </div>
      )}

      <div style={{ display: "grid", gap: 12 }}>
        {items.map(({ step, ticket }) => {
          const days = daysPending(ticket.submitted_at);
          const overdue = days >= 2;
          const requestor = ticket.employees as unknown as { first_name: string; last_name: string } | null;
          return (
            <Link
              key={step.id}
              href={`/finance-ticket-approvals/${step.approval_token}`}
              style={{ ...cardStyle, display: "block", textDecoration: "none", color: "inherit" }}
            >
              <div className="flex items-start justify-between gap-3">
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: "rgba(22,48,43,0.5)" }}>
                    {ticket.ticket_number} · {CATEGORY_LABELS[ticket.category] ?? ticket.category}
                  </div>
                  <div style={{ fontSize: 15, fontWeight: 700, marginTop: 2 }}>{ticket.title}</div>
                  <div style={{ fontSize: 13, color: "rgba(22,48,43,0.55)", marginTop: 2 }}>
                    {requestor ? `${requestor.first_name} ${requestor.last_name}` : "Unknown requestor"}
                    {step.acting_as_delegate_for_email && " · covering for " + step.chain_person_name}
                    {step.revision_number > 1 && ` · Revision #${step.revision_number}`}
                  </div>
                </div>
                <div style={{ textAlign: "right", flexShrink: 0 }}>
                  <div style={{ fontSize: 18, fontWeight: 700 }}>${ticket.total.toLocaleString()}</div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: overdue ? "#B5566B" : "rgba(22,48,43,0.4)", marginTop: 2 }}>
                    {days === 0 ? "Today" : `${days} day${days === 1 ? "" : "s"} pending`}
                  </div>
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
