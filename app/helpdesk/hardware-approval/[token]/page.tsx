"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Card, Eyebrow, Row, dim, faint, ink, emerald, gold, rose, inputStyle } from "@/components/speaker/ui";

type Data = {
  step: { stage: "supervisor" | "executive"; roles: string; approver_name: string; decision: string; decided_at: string | null };
  ticket: {
    ticket_number: string | null;
    title: string;
    description: string | null;
    requested_by: string;
    requested_by_email: string;
    approval_status: "pending" | "approved" | "denied" | null;
    ship_to: string | null;
    grant: string | null;
  };
  steps: { stage: string; roles: string; approver_name: string; decision: string; decided_at: string | null; notes: string | null }[];
};

const OUTCOME_TEXT: Record<string, string> = {
  escalated: "Approved. It now goes to the CIO and CSO.",
  approved_pending_others: "Your approval is recorded. Waiting on the other approver.",
  approved: "Approved. That was the final sign-off, so IT can now purchase it. The requester has been notified.",
  denied: "Denied. The ticket is closed and the requester has been notified with your reason.",
  stuck: "Your approval is recorded, but the next approver isn't set up yet. IT has been notified and will route it.",
  already_final: "This request was already decided, so nothing changed.",
};

export default function HardwareApprovalPage() {
  const { token } = useParams<{ token: string }>();
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [outcome, setOutcome] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/helpdesk/hardware-approval/${token}`)
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) throw new Error(body.error ?? "Couldn't load this approval.");
        setData(body);
      })
      .catch((e) => setError(e.message));
  }, [token]);

  async function decide(decision: "approve" | "deny") {
    if (decision === "deny" && !notes.trim()) {
      setError("Please add a short reason when denying.");
      return;
    }
    setSubmitting(true);
    setError(null);
    const res = await fetch(`/api/helpdesk/hardware-approval/${token}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decision, notes: notes.trim() || undefined }),
    });
    const body = await res.json().catch(() => ({}));
    setSubmitting(false);
    if (!res.ok) {
      setError(body.error ?? "Something went wrong.");
      return;
    }
    setOutcome(body.outcome);
  }

  const t = data?.ticket;
  const finalised = t && t.approval_status !== "pending";

  return (
    <main style={{ minHeight: "100vh", background: "var(--portal-sand)" }}>
      <div className="flex items-center px-6 py-4" style={{ background: "#fff", borderBottom: "1px solid var(--portal-line)" }}>
        <img src="/icna-relief-logo.png" alt="ICNA Relief" className="h-7" />
      </div>
      <div className="max-w-xl mx-auto px-4 py-8">
        <Eyebrow>{data ? `Approving as ${data.step.roles}` : "IT Help Desk"}</Eyebrow>
        <h1 style={{ fontFamily: "'Fraunces', serif", fontStyle: "italic", fontWeight: 500, fontSize: 28, margin: "0 0 20px", color: ink }}>Hardware purchase approval</h1>

        {error && (
          <div className="text-sm rounded-xl p-3 mb-4 font-semibold" style={{ background: `${rose}12`, color: rose }}>
            {error}
          </div>
        )}
        {!data && !error && (
          <p className="text-sm" style={{ color: faint }}>
            Loading…
          </p>
        )}

        {outcome && (
          <Card style={{ borderColor: outcome === "denied" ? `${rose}55` : `${emerald}55` }}>
            <div className="text-3xl mb-2">{outcome === "denied" ? "✋" : "✅"}</div>
            <p className="text-sm m-0" style={{ color: ink }}>
              {OUTCOME_TEXT[outcome] ?? "Decision recorded."}
            </p>
          </Card>
        )}

        {data && t && !outcome && (
          <div className="space-y-4">
            <Card>
              <div className="text-lg font-bold" style={{ color: ink }}>
                {t.title}
              </div>
              <div className="text-xs mb-3" style={{ color: dim }}>
                {t.ticket_number ? `${t.ticket_number} · ` : ""}requested by {t.requested_by}
              </div>
              <Row k="Requester" v={t.requested_by_email} />
              <Row k="Grant purchase" v={t.grant ?? "No"} />
              {t.ship_to && <Row k="Ship to" v={<span style={{ whiteSpace: "pre-line" }}>{t.ship_to}</span>} />}
              {t.description && (
                <div className="mt-4 rounded-xl p-4 text-sm whitespace-pre-wrap" style={{ background: "#F4F3EE", color: ink }}>
                  <div className="text-xs font-bold mb-1" style={{ color: dim }}>
                    What they need
                  </div>
                  {t.description}
                </div>
              )}
            </Card>

            <Card>
              <Eyebrow>Approval trail</Eyebrow>
              <p className="text-xs mt-0 mb-2" style={{ color: dim }}>
                Direct supervisor first, then the CIO and CSO together. Everyone must approve.
              </p>
              {data.steps.map((s, i) => (
                <div key={i} className="flex justify-between gap-3 text-sm py-1.5">
                  <span style={{ color: ink }}>
                    {s.approver_name}{" "}
                    <span className="text-xs" style={{ color: faint }}>
                      ({s.roles})
                    </span>
                  </span>
                  <span className="text-xs font-bold" style={{ color: s.decision === "approved" ? emerald : s.decision === "denied" ? rose : gold }}>
                    {s.decision === "superseded" ? "not needed" : s.decision}
                  </span>
                </div>
              ))}
            </Card>

            {data.step.decision !== "pending" ? (
              <Card>
                <p className="text-sm m-0" style={{ color: dim }}>
                  {data.step.decision === "superseded" ? (
                    "This request was decided by another approver, so your decision isn't needed."
                  ) : (
                    <>
                      You already <strong>{data.step.decision}</strong> this request
                      {data.step.decided_at ? ` on ${new Date(data.step.decided_at).toLocaleDateString()}` : ""}.
                    </>
                  )}
                </p>
              </Card>
            ) : finalised ? (
              <Card>
                <p className="text-sm m-0" style={{ color: dim }}>
                  This request is already {t.approval_status}; no decision is needed.
                </p>
              </Card>
            ) : (
              <Card>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={3}
                  placeholder="Note (required if denying)"
                  style={{ ...inputStyle, resize: "vertical" }}
                />
                <div className="grid grid-cols-2 gap-3 mt-3">
                  <button
                    onClick={() => decide("approve")}
                    disabled={submitting}
                    className="rounded-full py-3 text-sm font-bold text-white disabled:opacity-50"
                    style={{ background: emerald, boxShadow: "0 4px 14px -4px rgba(31,111,84,0.6)" }}
                  >
                    Approve
                  </button>
                  <button
                    onClick={() => decide("deny")}
                    disabled={submitting}
                    className="rounded-full py-3 text-sm font-bold disabled:opacity-50"
                    style={{ background: "#fff", color: rose, border: `1.5px solid ${rose}66` }}
                  >
                    Deny
                  </button>
                </div>
              </Card>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
