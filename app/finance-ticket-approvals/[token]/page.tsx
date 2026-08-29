"use client";

import { useEffect, useState, use } from "react";
import FinanceTicketDetailView from "@/components/FinanceTicketDetailView";

type Data = {
  step: {
    approval_level: number;
    chain_person_name: string;
    approver_name: string;
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
};

const CATEGORY_LABELS: Record<string, string> = {
  credit_card_reimbursement: "Credit Card Reimbursement",
  honorarium: "Honorarium",
  mileage_reimbursement: "Mileage Reimbursement",
  pex_new_card_request: "PEX New Card Request",
  pex_recharge_request: "PEX Recharge Request",
  utility_payment: "Utility Payment",
  vendor_payment: "Vendor Payment",
};

export default function FinanceTicketApprovalPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [outcome, setOutcome] = useState<string | null>(null);

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

  async function decide(decision: "approve" | "reject" | "fix") {
    if (decision === "fix" && !notes.trim()) {
      setError("Please explain what needs to change before requesting changes.");
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
      if (!res.ok) throw new Error(body.error ?? "Something went wrong.");
      setOutcome(body.outcome);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen px-4 py-12 bg-gray-50">
      <div className="max-w-lg mx-auto">
        <h1 className="text-xl font-semibold mb-1">Finance Ticket Approval</h1>
        <p className="text-sm text-gray-500 mb-8">ICNA Relief USA</p>

        {error && <div className="rounded-lg border border-red-200 bg-red-50 text-red-700 text-sm p-4 mb-6">{error}</div>}

        {outcome && (
          <div className="rounded-lg border border-green-200 bg-green-50 text-green-800 text-sm p-4">
            {outcome === "approved" && "Approved. The requestor has been notified and the ticket is ready for processing."}
            {outcome === "denied" && "Denied. The requestor has been notified."}
            {outcome === "returned_for_fix" && "Sent back to the requestor for changes."}
            {outcome === "escalated" && "Approved — this amount needs one more level of approval, which has been sent."}
            {outcome === "escalation_failed" && "Approved, but no further approver could be found automatically. Finance has been notified to handle this manually."}
          </div>
        )}

        {!data && !error && <p className="text-sm text-gray-500">Loading…</p>}

        {data && !outcome && (
          <div className="space-y-6">
            <div className="rounded-xl border border-gray-200 bg-white p-5">
              <div className="text-xs font-semibold text-gray-500 mb-1">{data.ticket.ticket_number} · {CATEGORY_LABELS[data.ticket.category] ?? data.ticket.category}</div>
              <div className="text-lg font-semibold mb-1">{data.ticket.title}</div>
              <div className="text-2xl font-bold text-gray-900 mb-3">${data.ticket.total.toLocaleString()}</div>
              <div className="text-sm text-gray-600 space-y-1">
                <div>Requested by: {data.ticket.employees?.first_name} {data.ticket.employees?.last_name}</div>
                <div>Submitted: {new Date(data.ticket.submitted_at).toLocaleDateString()}</div>
                {data.step.revision_number > 1 && <div>Revision #{data.step.revision_number}</div>}
              </div>
            </div>

            <div className="rounded-xl border border-gray-200 bg-white p-5">
              <FinanceTicketDetailView category={data.ticket.category} detail={data.detail} />
            </div>

            {data.priorSteps.length > 0 && (
              <div className="rounded-xl border border-gray-200 bg-white p-5">
                <div className="text-sm font-semibold mb-2">Prior Approvals</div>
                <div className="space-y-1 text-sm text-gray-600">
                  {data.priorSteps.map((s, i) => (
                    <div key={i}>
                      Level {s.approval_level} — {s.chain_person_name}: {s.approval_status}
                      {s.comments ? ` ("${s.comments}")` : ""}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="rounded-xl border border-gray-200 bg-white p-5 space-y-4">
              <textarea
                placeholder="Notes (required if requesting changes)"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full text-sm rounded-lg border border-gray-200 p-3"
                rows={3}
              />
              <div className="flex gap-2 flex-wrap">
                <button
                  onClick={() => decide("approve")}
                  disabled={submitting}
                  className="flex-1 rounded-full bg-green-700 text-white text-sm font-semibold py-2.5 disabled:opacity-50"
                >
                  Approve
                </button>
                <button
                  onClick={() => decide("fix")}
                  disabled={submitting}
                  className="flex-1 rounded-full bg-amber-600 text-white text-sm font-semibold py-2.5 disabled:opacity-50"
                >
                  Request Changes
                </button>
                <button
                  onClick={() => decide("reject")}
                  disabled={submitting}
                  className="flex-1 rounded-full bg-red-600 text-white text-sm font-semibold py-2.5 disabled:opacity-50"
                >
                  Reject
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
