"use client";

import { useEffect, useState, use } from "react";

type StepInfo = {
  step_order: number;
  chain_person_name: string;
  chain_person_job_title: string | null;
  approver_name: string;
  status: string;
  decided_at: string | null;
  decision_note: string | null;
};

type Data = {
  step: {
    id: string;
    status: string;
    approver_name: string;
    approver_email: string;
    chain_person_name: string;
    acting_as_delegate_for_email: string | null;
  };
  request: { amount: number; status: string; final_tier_name: string | null };
  ticket: { title: string; description: string | null; submitted_by: string; created_at: string };
  priorSteps: StepInfo[];
};

export default function FinanceApprovalPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [outcome, setOutcome] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/finance-approval/${token}`)
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

  async function decide(decision: "approve" | "deny") {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/finance-approval/${token}/decide`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision, note: note.trim() || undefined }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Something went wrong.");
      setOutcome(body.outcome);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen px-4 py-12 bg-gray-50">
      <div className="max-w-lg mx-auto">
        <h1 className="text-xl font-semibold mb-1">Finance Approval</h1>
        <p className="text-sm text-gray-500 mb-8">ICNA Relief USA</p>

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 text-red-700 text-sm p-4 mb-6">
            {error}
          </div>
        )}

        {outcome && (
          <div className="rounded-lg border border-green-200 bg-green-50 text-green-800 text-sm p-4">
            {outcome === "approved" && "Approved. The submitter has been notified."}
            {outcome === "denied" && "Denied. The submitter has been notified."}
            {outcome === "escalated" && "Approved — this amount needs one more level of approval, which has been sent."}
            {outcome === "escalation_failed" &&
              "Approved, but no further approver could be found automatically. The finance team has been notified to handle this manually."}
          </div>
        )}

        {!data && !error && <p className="text-sm text-gray-500">Loading…</p>}

        {data && !outcome && (
          <div className="space-y-6">
            <div className="rounded-xl border border-gray-200 bg-white p-5">
              <div className="text-lg font-semibold mb-1">{data.ticket.title}</div>
              <div className="text-2xl font-bold text-gray-900 mb-3">
                ${data.request.amount.toLocaleString()}
              </div>
              <div className="text-sm text-gray-600 space-y-1">
                <div>Submitted by: {data.ticket.submitted_by}</div>
                <div>Submitted: {new Date(data.ticket.created_at).toLocaleDateString()}</div>
                {data.ticket.description && (
                  <div className="pt-2 whitespace-pre-wrap">{data.ticket.description}</div>
                )}
              </div>
            </div>

            {data.step.acting_as_delegate_for_email && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 text-amber-800 text-sm p-3">
                You're covering this approval for {data.step.chain_person_name}.
              </div>
            )}

            {data.priorSteps.filter((s) => s.status !== "pending").length > 0 && (
              <div>
                <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">
                  Approval History
                </h2>
                <div className="space-y-1.5 text-sm">
                  {data.priorSteps
                    .filter((s) => s.status !== "pending")
                    .map((s) => (
                      <div key={s.step_order} className="flex items-center justify-between">
                        <span>
                          {s.approver_name}
                          {s.chain_person_job_title ? ` (${s.chain_person_job_title})` : ""}
                        </span>
                        <span
                          className={
                            s.status === "approved" ? "text-green-700" : "text-red-600"
                          }
                        >
                          {s.status}
                        </span>
                      </div>
                    ))}
                </div>
              </div>
            )}

            {data.step.status !== "pending" ? (
              <p className="text-sm text-gray-500">
                This request was already {data.step.status} — no action needed.
              </p>
            ) : (
              <>
                <div>
                  <label className="block text-sm font-medium mb-1.5">Note (optional)</label>
                  <textarea
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    rows={2}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  />
                </div>
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => decide("approve")}
                    disabled={submitting}
                    className="flex-1 rounded-lg bg-green-600 text-white text-sm font-medium py-3 disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
                  >
                    Approve
                  </button>
                  <button
                    type="button"
                    onClick={() => decide("deny")}
                    disabled={submitting}
                    className="flex-1 rounded-lg bg-red-600 text-white text-sm font-medium py-3 disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
                  >
                    Deny
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
