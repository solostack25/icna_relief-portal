"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";

type Contact = { id: string; first_name: string | null; last_name: string | null; phone: string; email: string | null };
type Recording = { transcript: string | null; status: string; error: string | null } | null;

const DISPOSITIONS = [
  { value: "reached", label: "Reached — had a conversation" },
  { value: "pledge", label: "Pledge made" },
  { value: "voicemail", label: "Left voicemail" },
  { value: "no_answer", label: "No answer" },
  { value: "callback_requested", label: "Asked for a callback" },
  { value: "declined", label: "Declined" },
  { value: "wrong_number", label: "Wrong number" },
  { value: "do_not_call", label: "Do not call again" },
];

const inputStyle: React.CSSProperties = {
  border: "1.5px solid var(--portal-line, rgba(22,48,43,0.12))",
  borderRadius: 10,
  padding: "10px 14px",
  fontSize: 14,
  background: "#fff",
  outline: "none",
};

const cardStyle: React.CSSProperties = {
  background: "#fff",
  borderRadius: 24,
  boxShadow: "0 3px 12px rgba(22,48,43,0.06)",
  padding: "24px 26px",
  marginBottom: 20,
};

export default function DonorCallingWorkspace() {
  const params = useParams();
  const campaignId = params.id as string;

  const [contact, setContact] = useState<Contact | null>(null);
  const [remaining, setRemaining] = useState(0);
  const [script, setScript] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [calling, setCalling] = useState(false);
  const [callMsg, setCallMsg] = useState<string | null>(null);
  const [disposition, setDisposition] = useState("");
  const [notes, setNotes] = useState("");
  const [pledgeAmount, setPledgeAmount] = useState("");
  const [logging, setLogging] = useState(false);

  const [recording, setRecording] = useState<Recording>(null);
  const [pushing, setPushing] = useState(false);
  const [pushMsg, setPushMsg] = useState<string | null>(null);

  const loadNext = useCallback(async () => {
    setLoading(true);
    setCallMsg(null);
    setDisposition("");
    setNotes("");
    setPledgeAmount("");
    setRecording(null);
    setPushMsg(null);
    const res = await fetch(`/api/marketing/donor-calling/${campaignId}/queue`);
    const data = await res.json();
    setContact(data.contact ?? null);
    setRemaining(data.remaining ?? 0);
    setScript(data.script ?? null);
    setLoading(false);
  }, [campaignId]);

  useEffect(() => {
    loadNext();
  }, [loadNext]);

  const loadRecording = useCallback(async (contactId: string) => {
    const res = await fetch(`/api/marketing/contacts/${contactId}/recording`);
    const data = await res.json();
    setRecording(data.recording ?? null);
  }, []);

  useEffect(() => {
    if (!contact) return;
    loadRecording(contact.id);
    // Transcription happens asynchronously after the call ends (3CX
    // webhook -> Whisper), so it's rarely ready the instant this page
    // loads - poll every 15s while there's no transcript yet, so it
    // shows up on its own instead of needing a manual refresh.
    const interval = setInterval(() => loadRecording(contact.id), 15000);
    return () => clearInterval(interval);
  }, [contact, loadRecording]);

  const call = async () => {
    if (!contact) return;
    setCalling(true);
    const res = await fetch("/api/calling/click-to-call", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        toNumber: contact.phone,
        toName: `${contact.first_name ?? ""} ${contact.last_name ?? ""}`.trim(),
        targetType: "contact",
        targetId: contact.id,
      }),
    });
    const data = await res.json();
    setCalling(false);
    setCallMsg(res.ok ? "Calling — check your phone/softphone" : data.error ?? "Call failed");
  };

  const logOutcome = async () => {
    if (!contact || !disposition) return;
    setLogging(true);
    await fetch(`/api/marketing/donor-calling/${campaignId}/outcome`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contactId: contact.id,
        disposition,
        notes,
        pledgeAmount: pledgeAmount ? Number(pledgeAmount) : null,
      }),
    });
    setLogging(false);
    loadNext();
  };

  const pushTranscript = async () => {
    if (!contact) return;
    setPushing(true);
    setPushMsg(null);
    const res = await fetch(`/api/marketing/contacts/${contact.id}/push-transcript`, { method: "POST" });
    const data = await res.json();
    setPushing(false);
    if (res.ok) {
      setPushMsg("Pushed to Salesforce.");
      setRecording((r) => (r ? { ...r, status: "pushed_to_salesforce" } : r));
    } else {
      setPushMsg(data.error ?? "Push failed.");
    }
  };

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto p-6 text-sm mt-6" style={{ color: "rgba(22,48,43,0.4)" }}>
        Loading…
      </div>
    );
  }

  if (!contact) {
    return (
      <div className="max-w-2xl mx-auto p-6 text-center mt-10">
        <h1 style={{ fontFamily: "'Fraunces', serif", fontStyle: "italic", fontWeight: 500, fontSize: 26, margin: "0 0 8px" }}>
          All done
        </h1>
        <p className="text-sm" style={{ color: "rgba(22,48,43,0.5)" }}>
          No more uncalled contacts in this campaign&apos;s list.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto p-6">
      <p className="text-xs font-semibold mb-4" style={{ color: "rgba(22,48,43,0.4)" }}>
        {remaining} remaining in this list
      </p>

      <section style={cardStyle}>
        <h1 style={{ fontFamily: "'Fraunces', serif", fontStyle: "italic", fontWeight: 500, fontSize: 24, margin: "0 0 4px" }}>
          {contact.first_name} {contact.last_name}
        </h1>
        <p className="text-sm mb-4" style={{ color: "rgba(22,48,43,0.5)" }}>
          {contact.phone}
        </p>
        <button
          onClick={call}
          disabled={calling}
          className="flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-bold cursor-pointer disabled:opacity-50 hover:scale-105 active:scale-95 transition-transform duration-150"
          style={{ background: "var(--portal-emerald, #2F6D46)", color: "#fff", boxShadow: "0 3px 10px rgba(31,111,84,0.3)" }}
        >
          📞 {calling ? "Calling…" : "Call"}
        </button>
        {callMsg && (
          <p className="text-xs mt-2" style={{ color: "rgba(22,48,43,0.5)" }}>
            {callMsg}
          </p>
        )}
      </section>

      {script && (
        <section style={{ ...cardStyle, background: "#EAF1F8" }}>
          <h2 className="text-sm font-bold mb-2" style={{ color: "#2B5A8A" }}>
            Script
          </h2>
          <p className="text-sm whitespace-pre-wrap" style={{ color: "#1F3A52" }}>
            {script}
          </p>
        </section>
      )}

      <section style={cardStyle}>
        <h2 className="text-sm font-bold mb-4" style={{ color: "#2F4A3E" }}>
          Log Outcome
        </h2>
        <select className="w-full mb-3" style={inputStyle} value={disposition} onChange={(e) => setDisposition(e.target.value)}>
          <option value="">Select outcome…</option>
          {DISPOSITIONS.map((d) => (
            <option key={d.value} value={d.value}>
              {d.label}
            </option>
          ))}
        </select>
        {disposition === "pledge" && (
          <input
            type="number"
            className="w-full mb-3"
            style={inputStyle}
            placeholder="Pledge amount ($)"
            value={pledgeAmount}
            onChange={(e) => setPledgeAmount(e.target.value)}
          />
        )}
        <textarea
          className="w-full mb-4 resize-none"
          style={inputStyle}
          rows={2}
          placeholder="Notes (optional)"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
        <button
          onClick={logOutcome}
          disabled={!disposition || logging}
          className="rounded-full px-6 py-2.5 text-sm font-bold text-white cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed hover:scale-105 active:scale-95 transition-transform duration-150"
          style={{
            background: disposition ? "var(--portal-emerald, #2F6D46)" : "rgba(22,48,43,0.25)",
            boxShadow: disposition ? "0 3px 10px rgba(31,111,84,0.3)" : "none",
          }}
        >
          {logging ? "Saving…" : "Save & Next"}
        </button>
      </section>

      <section style={cardStyle}>
        <h2 className="text-sm font-bold mb-3" style={{ color: "#2F4A3E" }}>
          Call Transcript
        </h2>
        {!recording && (
          <p className="text-sm" style={{ color: "rgba(22,48,43,0.4)" }}>
            No recording yet — transcripts appear here automatically once a recorded call finishes and 3CX sends it
            over (usually within a minute or two of hanging up).
          </p>
        )}
        {recording?.status === "transcribing" && (
          <p className="text-sm" style={{ color: "rgba(22,48,43,0.5)" }}>
            Transcribing…
          </p>
        )}
        {recording?.status === "failed" && (
          <p className="text-sm" style={{ color: "#B5566B" }}>
            Couldn&apos;t process this recording: {recording.error ?? "unknown error"}
          </p>
        )}
        {recording?.transcript && (
          <>
            <p className="text-sm whitespace-pre-wrap mb-4 p-4 rounded-2xl" style={{ background: "#F4F3EE", color: "rgba(22,48,43,0.75)" }}>
              {recording.transcript}
            </p>
            <button
              onClick={pushTranscript}
              disabled={pushing}
              className="rounded-full px-5 py-2.5 text-sm font-bold text-white cursor-pointer disabled:opacity-50 hover:scale-105 active:scale-95 transition-transform duration-150"
              style={{ background: "#3E7FBF", boxShadow: "0 3px 10px rgba(62,127,191,0.3)" }}
            >
              {pushing ? "Pushing…" : recording.status === "pushed_to_salesforce" ? "Push to Salesforce Again" : "Push to Salesforce"}
            </button>
            {pushMsg && (
              <p className="text-xs mt-2" style={{ color: "rgba(22,48,43,0.5)" }}>
                {pushMsg}
              </p>
            )}
          </>
        )}
      </section>
    </div>
  );
}
