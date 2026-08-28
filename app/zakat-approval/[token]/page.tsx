"use client";

import { useEffect, useState, use } from "react";

type Data = {
  step: { approver_name: string; decision: string; decided_at: string | null; notes: string | null };
  application: { applicant_name: string; category: string; amount_requested: number; reason: string | null; status: string; submitted_at: string };
  otherSteps: { approver_name: string; decision: string; decided_at: string | null }[];
};

export default function ZakatApprovalPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [outcome, setOutcome] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/zakat-approval/${token}`)
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

  async function decide(decision: "approve" | "reject") {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/zakat-approval/${token}/decide`, {
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
        <h1 className="text-xl font-semibold mb-1">Zakat Application Approval</h1>
        <p className="text-sm text-gray-500 mb-8">ICNA Relief USA — IRFAS</p>

        {error && <div className="rounded-lg border border-red-200 bg-red-50 text-red-700 text-sm p-4 mb-6">{error}</div>}

        {outcome && (
          <div className="rounded-lg border border-green-200 bg-green-50 text-green-800 text-sm p-4">
            {outcome === "approved" && "Approved — all approvers have signed off. Finance has been notified."}
            {outcome === "approved_pending_others" && "Your approval was recorded. Waiting on the remaining approver(s)."}
            {outcome === "rejected" && "Recorded as rejected. The application has been closed."}
          </div>
        )}

        {!data && !error && <p className="text-sm text-gray-500">Loading…</p>}

        {data && !outcome && (
          <div className="space-y-6">
            <div className="rounded-xl border border-gray-200 bg-white p-5">
              <div className="text-lg font-semibold mb-1">{data.application.applicant_name}</div>
              <div className="text-2xl font-bold text-gray-900 mb-3">${data.application.amount_requested.toLocaleString()}</div>
              <div className="text-sm text-gray-600 space-y-1">
                <div>Category: {data.application.category}</div>
                {data.application.reason && <div>Reason: {data.application.reason}</div>}
                <div>Submitted: {new Date(data.application.submitted_at).toLocaleDateString()}</div>
              </div>
            </div>

            {data.otherSteps.length > 0 && (
              <div className="rounded-xl border border-gray-200 bg-white p-5">
                <div className="text-sm font-semibold mb-2">Other Approvers</div>
                <div className="space-y-1 text-sm text-gray-600">
                  {data.otherSteps.map((s, i) => (
                    <div key={i}>
                      {s.approver_name}: {s.decision}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {data.step.decision !== "pending" ? (
              <div className="rounded-lg border border-gray-200 bg-white text-sm p-4 text-gray-600">
                You already recorded a decision on this application: <strong>{data.step.decision}</strong>
              </div>
            ) : (
              <div className="rounded-xl border border-gray-200 bg-white p-5 space-y-4">
                <textarea
                  placeholder="Optional notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full text-sm rounded-lg border border-gray-200 p-3"
                  rows={3}
                />
                <div className="flex gap-3">
                  <button
                    onClick={() => decide("approve")}
                    disabled={submitting}
                    className="flex-1 rounded-full bg-green-700 text-white text-sm font-semibold py-2.5 disabled:opacity-50"
                  >
                    Approve
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
            )}
          </div>
        )}
      </div>
    </main>
  );
}
