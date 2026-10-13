"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Card, Eyebrow, Row, StatusPill, money, dim, faint, ink, emerald, gold, rose, inputStyle } from "@/components/speaker/ui";

type Data = {
  step: { gate: string; approver_name: string; approver_role: string | null; decision: string; decided_at: string | null };
  request: {
    request_number: string;
    status: string;
    event: string;
    when: string;
    region: string;
    coordinator_name: string;
    coordinator_email: string;
    area_manager_name: string;
    speaker_name: string;
    speaker_email: string | null;
    speaker_phone: string | null;
    travel_required: boolean;
    honorarium: number;
    travel_cost: number;
    hotel_cost: number;
    total_cost: number;
    w9_on_file: boolean | null;
    justification: string | null;
    requires_leadership: boolean;
  };
  approvals: { gate: string; approver_name: string; approver_role: string | null; decision: string; decided_at: string | null; notes: string | null }[];
};

const OUTCOME_TEXT: Record<string, string> = {
  approved: "Approved — this was the final sign-off. The finance ticket, speaker agreement and calendar invite are going out automatically.",
  escalated: "Approved — it now goes to leadership for sign-off because travel is required and the total is over $500.",
  approved_pending_others: "Your approval is recorded. Waiting on the other leadership approvers.",
  denied: "Denied — the coordinator has been notified with your note.",
  stuck: "Approved — but no leadership approvers are configured yet. The portal admin has been notified.",
};

export default function SpeakerApprovalPage() {
  const { token } = useParams<{ token: string }>();
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [outcome, setOutcome] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/speaker-requests/approve/${token}`)
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) throw new Error(body.error ?? "Couldn't load");
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
    const res = await fetch(`/api/speaker-requests/approve/${token}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decision, notes: notes.trim() || undefined }),
    });
    const body = await res.json();
    setSubmitting(false);
    if (!res.ok) {
      setError(body.error ?? "Something went wrong.");
      return;
    }
    setOutcome(body.outcome);
  }

  const r = data?.request;
  const closed = r && (r.status === "denied" || r.status === "cancelled" || (r.status === "approved" && data?.step.decision === "pending"));

  return (
    <main style={{ minHeight: "100vh", background: "var(--portal-sand)" }}>
      <div className="flex items-center px-6 py-4" style={{ background: "#fff", borderBottom: "1px solid var(--portal-line)" }}>
        <img src="/icna-relief-logo.png" alt="ICNA Relief" className="h-7" />
      </div>
      <div className="max-w-xl mx-auto px-4 py-8">
        <Eyebrow>{data?.step.gate === "leadership" ? "Joint leadership sign-off" : "Area Manager review"}</Eyebrow>
        <h1 style={{ fontFamily: "'Fraunces', serif", fontStyle: "italic", fontWeight: 500, fontSize: 28, margin: "0 0 20px", color: ink }}>Speaker request approval</h1>

        {error && (
          <div className="text-sm rounded-xl p-3 mb-4 font-semibold" style={{ background: `${rose}12`, color: rose }}>
            {error}
          </div>
        )}
        {!data && !error && <p className="text-sm" style={{ color: faint }}>Loading…</p>}

        {outcome && (
          <Card style={{ borderColor: outcome === "denied" ? `${rose}55` : `${emerald}55` }}>
            <div className="text-3xl mb-2">{outcome === "denied" ? "✋" : "✅"}</div>
            <p className="text-sm m-0" style={{ color: ink }}>
              {OUTCOME_TEXT[outcome] ?? "Decision recorded."}
            </p>
          </Card>
        )}

        {data && r && !outcome && (
          <div className="space-y-4">
            <Card>
              <div className="flex flex-wrap items-start justify-between gap-2 mb-2">
                <div>
                  <div className="text-lg font-bold" style={{ color: ink }}>
                    {r.speaker_name}
                  </div>
                  <div className="text-xs" style={{ color: dim }}>
                    {r.request_number} · requested by {r.coordinator_name}
                  </div>
                </div>
                <StatusPill status={r.status} />
              </div>
              <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 30, color: ink, margin: "8px 0 4px" }}>{money(r.total_cost)}</div>
              <div className="text-xs mb-3" style={{ color: dim }}>
                {r.travel_required ? `Fee ${money(r.honorarium)} + travel ${money(r.travel_cost)} + hotel ${money(r.hotel_cost)}` : "Local speaker honorarium (no travel)"}
              </div>
              <Row k="Event" v={r.event} />
              <Row k="When" v={r.when} />
              <Row k="Region" v={r.region} />
              <Row k="Speaker contact" v={[r.speaker_email, r.speaker_phone].filter(Boolean).join(" · ") || "—"} />
              {r.travel_required && <Row k="W-9 on file" v={r.w9_on_file ? "Yes" : "No — will be requested automatically"} />}
              {r.justification && (
                <div className="mt-4 rounded-xl p-4 text-sm whitespace-pre-wrap" style={{ background: "#F4F3EE", color: ink }}>
                  <div className="text-xs font-bold mb-1" style={{ color: dim }}>
                    Strategic justification
                  </div>
                  {r.justification}
                </div>
              )}
            </Card>

            {data.approvals.length > 1 && (
              <Card>
                <Eyebrow>Approval trail</Eyebrow>
                {data.approvals.map((a, i) => (
                  <div key={i} className="flex justify-between text-sm py-1.5">
                    <span style={{ color: ink }}>
                      {a.approver_name} <span className="text-xs" style={{ color: faint }}>({a.approver_role})</span>
                    </span>
                    <span className="text-xs font-bold" style={{ color: a.decision === "approved" ? emerald : a.decision === "denied" ? rose : gold }}>
                      {a.decision}
                    </span>
                  </div>
                ))}
              </Card>
            )}

            {data.step.decision !== "pending" ? (
              <Card>
                <p className="text-sm m-0" style={{ color: dim }}>
                  You already <strong>{data.step.decision}</strong> this request{data.step.decided_at ? ` on ${new Date(data.step.decided_at).toLocaleDateString()}` : ""}.
                </p>
              </Card>
            ) : closed ? (
              <Card>
                <p className="text-sm m-0" style={{ color: dim }}>
                  This request is already {r.status}; no decision is needed.
                </p>
              </Card>
            ) : (
              <Card>
                {data.step.gate === "leadership" && (
                  <p className="text-xs mt-0 mb-3" style={{ color: dim }}>
                    Travel is required and the combined cost is over $500, so leadership has to sign off. Please check the travel and hotel estimates against the fundraising target.
                  </p>
                )}
                <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder="Note (required if denying)" style={{ ...inputStyle, resize: "vertical" }} />
                <div className="grid grid-cols-2 gap-3 mt-3">
                  <button onClick={() => decide("approve")} disabled={submitting} className="rounded-full py-3 text-sm font-bold text-white disabled:opacity-50" style={{ background: emerald, boxShadow: "0 4px 14px -4px rgba(31,111,84,0.6)" }}>
                    Approve
                  </button>
                  <button onClick={() => decide("deny")} disabled={submitting} className="rounded-full py-3 text-sm font-bold disabled:opacity-50" style={{ background: "#fff", color: rose, border: `1.5px solid ${rose}66` }}>
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
