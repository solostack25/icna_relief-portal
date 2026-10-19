"use client";

import { useEffect, useState, use } from "react";
import { useSearchParams } from "next/navigation";
import ReceiptStrip, { type ReceiptView } from "@/components/finance/ReceiptStrip";
import FinanceTicketDetailView from "@/components/FinanceTicketDetailView";
import { financeApprovalStatusLabel } from "@/lib/financeTicketStatus";

type Data = {
  step: {
    approval_level: number;
    approval_status: string;
    decision_date: string | null;
    chain_person_name: string;
    approver_name: string;
    acting_as_delegate_for_email: string | null;
    approval_amount_threshold: number | null;
    is_final_approval: boolean;
    revision_number: number;
  };
  ticket: {
    ticket_number: string;
    title: string;
    category: string;
    total: number;
    status: string;
    submitted_at: string;
    employees: { first_name: string; last_name: string };
  };
  priorSteps: { approval_level: number; chain_person_name: string; approval_status: string; decision_date: string | null; comments: string | null }[];
  detail: unknown;
  receipts?: ReceiptView[];
};

type Decision = "approve" | "reject" | "fix";

const CATEGORY_LABELS: Record<string, string> = {
  credit_card_reimbursement: "Credit Card Reimbursement",
  honorarium: "Honorarium",
  mileage_reimbursement: "Mileage Reimbursement",
  pex_new_card_request: "PEX New Card Request",
  pex_recharge_request: "PEX Recharge Request",
  utility_payment: "Utility Payment",
  vendor_payment: "Vendor Payment",
};

const ACTION: Record<Decision, { label: string; confirm: string; bg: string; soft: string; ink: string }> = {
  approve: { label: "Approve", confirm: "Confirm approval", bg: "#1F6F54", soft: "#E7F3EE", ink: "#14513D" },
  fix: { label: "Request changes", confirm: "Send back for changes", bg: "#B7791F", soft: "#FBF0D9", ink: "#7A4F12" },
  reject: { label: "Reject", confirm: "Confirm rejection", bg: "#B42318", soft: "#FDECEA", ink: "#8A1B12" },
};

const money = (n: number) => `$${Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const OUTCOME: Record<string, string> = {
  approved: "Approved. The requestor has been told and finance can pay it.",
  denied: "Rejected. The requestor has been told.",
  returned_for_fix: "Sent back to the requestor with your note.",
  escalated: "Approved. This amount needs one more approval, and it's been sent on.",
  escalation_failed: "Approved, but no next approver was found automatically. Finance has been told to route it by hand.",
};

export default function FinanceTicketApprovalPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const search = useSearchParams();
  const preset = search.get("action");
  const [choice, setChoice] = useState<Decision | null>(preset === "approve" || preset === "reject" || preset === "fix" ? preset : null);
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [outcome, setOutcome] = useState<{ key: string; to?: string } | null>(null);
  const [showDetail, setShowDetail] = useState(false);

  useEffect(() => {
    fetch(`/api/finance-ticket-approvals/${token}`)
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error ?? `Request failed (${res.status})`);
        }
        return res.json();
      })
      .then(setData)
      .catch((e) => setError(e.message));
  }, [token]);

  async function decide(decision: Decision) {
    if (decision === "fix" && !notes.trim()) {
      setError("Add a short note so the requestor knows what to change.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/finance-ticket-approvals/${token}/decide`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision, notes: notes.trim() || undefined }),
      });
      const body = await res.json();
      if (!res.ok || body.ok === false) throw new Error(body.error ?? "Something went wrong.");
      setOutcome({ key: body.outcome, to: body.escalatedTo });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setSubmitting(false);
    }
  }

  const decided = data && data.step.approval_status !== "pending";
  const a = choice ? ACTION[choice] : null;

  return (
    <main className="min-h-screen px-4 py-8 sm:py-12" style={{ background: "#F4F6F5", color: "#16302B" }}>
      <div className="max-w-lg mx-auto space-y-4">
        <div>
          <div className="text-[11px] font-bold uppercase tracking-wider" style={{ color: "#1F6F54" }}>ICNA Relief · Finance approval</div>
        </div>

        {error && <div className="rounded-xl border border-red-200 bg-red-50 text-red-700 text-sm p-4">{error}</div>}

        {outcome && (
          <div className="rounded-2xl bg-white p-6 text-center shadow-sm">
            <div className="mx-auto mb-3 h-12 w-12 rounded-full flex items-center justify-center text-2xl" style={{ background: "#E7F3EE", color: "#1F6F54" }}>✓</div>
            <div className="text-base font-semibold mb-1">Done</div>
            <p className="text-sm" style={{ color: "rgba(22,48,43,0.7)" }}>
              {OUTCOME[outcome.key] ?? "Your decision was saved."}
              {outcome.key === "escalated" && outcome.to ? ` It's now with ${outcome.to}.` : ""}
            </p>
            <p className="text-xs mt-4" style={{ color: "rgba(22,48,43,0.5)" }}>You can close this page.</p>
          </div>
        )}

        {!data && !error && <p className="text-sm text-gray-500">Loading…</p>}

        {data && !outcome && (
          <>
            <div className="rounded-2xl bg-white p-5 shadow-sm">
              <div className="text-xs font-semibold mb-1" style={{ color: "rgba(22,48,43,0.55)" }}>
                {data.ticket.ticket_number} · {CATEGORY_LABELS[data.ticket.category] ?? data.ticket.category}
              </div>
              <div className="text-lg font-semibold">{data.ticket.title}</div>
              <div className="text-3xl font-bold my-1">{money(data.ticket.total)}</div>
              <div className="text-sm space-y-0.5" style={{ color: "rgba(22,48,43,0.7)" }}>
                <div>Requested by {data.ticket.employees?.first_name} {data.ticket.employees?.last_name}</div>
                <div>Submitted {new Date(data.ticket.submitted_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</div>
                {data.step.revision_number > 1 && <div>Revision #{data.step.revision_number}</div>}
                {data.step.acting_as_delegate_for_email && <div>You&apos;re covering for {data.step.chain_person_name}</div>}
                {!data.step.is_final_approval && !decided && <div>After you approve, it goes to the next approver.</div>}
              </div>
            </div>

            {decided ? (
              <div className="rounded-2xl bg-white p-5 shadow-sm text-sm">
                This approval was already handled: <span className="font-semibold">{financeApprovalStatusLabel(data.step.approval_status)}</span>
                {data.step.decision_date ? ` on ${new Date(data.step.decision_date).toLocaleDateString()}` : ""}. Nothing else to do.
              </div>
            ) : (
              <div className="rounded-2xl bg-white p-5 shadow-sm space-y-3">
                {a && choice ? (
                  <>
                    <div className="rounded-xl px-4 py-3 text-sm font-semibold" style={{ background: a.soft, color: a.ink }}>
                      You chose: {a.label}
                    </div>
                    <textarea
                      placeholder={choice === "fix" ? "What needs to change? (required)" : "Note (optional)"}
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      className="w-full text-sm rounded-xl border border-gray-200 p-3"
                      rows={choice === "fix" ? 3 : 2}
                      autoFocus={choice === "fix"}
                    />
                    <button
                      onClick={() => decide(choice)}
                      disabled={submitting}
                      className="w-full rounded-full text-white text-base font-semibold py-3.5 disabled:opacity-50"
                      style={{ background: a.bg }}
                    >
                      {submitting ? "Saving…" : `${a.confirm} · ${money(data.ticket.total)}`}
                    </button>
                    <button onClick={() => setChoice(null)} className="w-full text-xs font-semibold py-1" style={{ color: "rgba(22,48,43,0.6)" }}>
                      Choose something else
                    </button>
                  </>
                ) : (
                  <>
                    <textarea
                      placeholder="Note (required if requesting changes)"
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      className="w-full text-sm rounded-xl border border-gray-200 p-3"
                      rows={2}
                    />
                    <div className="grid grid-cols-3 gap-2">
                      {(["approve", "fix", "reject"] as Decision[]).map((d) => (
                        <button
                          key={d}
                          onClick={() => decide(d)}
                          disabled={submitting}
                          className="rounded-full text-white text-sm font-semibold py-3 disabled:opacity-50"
                          style={{ background: ACTION[d].bg }}
                        >
                          {ACTION[d].label}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}

            {data.receipts && data.receipts.length > 0 && (
              <div className="rounded-2xl bg-white p-5 shadow-sm">
                <ReceiptStrip receipts={data.receipts} />
              </div>
            )}

            <div className="rounded-2xl bg-white shadow-sm">
              <button onClick={() => setShowDetail((v) => !v)} className="w-full flex justify-between items-center px-5 py-4 text-sm font-semibold">
                <span>Ticket details</span>
                <span style={{ color: "rgba(22,48,43,0.5)" }}>{showDetail ? "Hide" : "Show"}</span>
              </button>
              {showDetail && (
                <div className="px-5 pb-5">
                  <FinanceTicketDetailView category={data.ticket.category} detail={data.detail} />
                </div>
              )}
            </div>

            {data.priorSteps.length > 0 && (
              <div className="rounded-2xl bg-white p-5 shadow-sm">
                <div className="text-sm font-semibold mb-2">Earlier approvals</div>
                <div className="space-y-1 text-sm" style={{ color: "rgba(22,48,43,0.7)" }}>
                  {data.priorSteps.map((s, i) => (
                    <div key={i}>
                      Level {s.approval_level}: {s.chain_person_name}, {financeApprovalStatusLabel(s.approval_status)}
                      {s.comments ? ` ("${s.comments}")` : ""}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </main>
  );
}
