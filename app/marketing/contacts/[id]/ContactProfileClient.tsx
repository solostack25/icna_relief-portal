"use client";

import { useEffect, useState } from "react";

type Contact = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  email: string | null;
  source: string;
  do_not_call: boolean;
  tags: string[];
};

type HistoryEntry = {
  id: string;
  disposition: string | null;
  notes: string | null;
  pledge_amount: number | null;
  called_at: string;
  campaign_name: string | null;
};

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

function dispositionLabel(value: string | null) {
  return DISPOSITIONS.find((d) => d.value === value)?.label ?? value ?? "—";
}

export default function ContactProfileClient({ contactId }: { contactId: string }) {
  const [contact, setContact] = useState<Contact | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFoundErr, setNotFoundErr] = useState(false);

  const [callMsg, setCallMsg] = useState<string | null>(null);
  const [calling, setCalling] = useState(false);
  const [texting, setTexting] = useState(false);
  const [textBody, setTextBody] = useState("");
  const [showTextBox, setShowTextBox] = useState(false);

  const [disposition, setDisposition] = useState("");
  const [notes, setNotes] = useState("");
  const [pledgeAmount, setPledgeAmount] = useState("");
  const [logging, setLogging] = useState(false);

  async function load() {
    setLoading(true);
    const res = await fetch(`/api/marketing/contacts/${contactId}`);
    if (!res.ok) {
      setNotFoundErr(true);
      setLoading(false);
      return;
    }
    const data = await res.json();
    setContact(data.contact);
    setHistory(data.history ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contactId]);

  async function toggleDoNotCall() {
    if (!contact) return;
    const next = !contact.do_not_call;
    setContact({ ...contact, do_not_call: next });
    await fetch(`/api/marketing/contacts/${contactId}/toggle-dnc`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ doNotCall: next }),
    });
  }

  async function handleCall() {
    if (!contact?.phone) return;
    setCalling(true);
    setCallMsg(null);
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
    setCallMsg(res.ok ? "Calling — check your phone/softphone." : data.error ?? "Call failed.");
  }

  async function handleSendText() {
    if (!contact?.phone || !textBody.trim()) return;
    setTexting(true);
    const res = await fetch("/api/calling/quick-sms", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        toNumber: contact.phone,
        toName: `${contact.first_name ?? ""} ${contact.last_name ?? ""}`.trim(),
        targetType: "contact",
        targetId: contact.id,
        text: textBody.trim(),
      }),
    });
    const data = await res.json();
    setTexting(false);
    setCallMsg(res.ok ? "Text sent." : data.error ?? "Text failed.");
    if (res.ok) {
      setTextBody("");
      setShowTextBox(false);
    }
  }

  async function handleLogCall(e: React.FormEvent) {
    e.preventDefault();
    if (!disposition) return;
    setLogging(true);
    await fetch(`/api/marketing/contacts/${contactId}/log-call`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ disposition, notes, pledgeAmount: pledgeAmount ? Number(pledgeAmount) : null }),
    });
    setDisposition("");
    setNotes("");
    setPledgeAmount("");
    setLogging(false);
    load();
  }

  if (loading) return <p className="text-sm mt-8" style={{ color: "rgba(22,48,43,0.4)" }}>Loading…</p>;
  if (notFoundErr || !contact) return <p className="text-sm mt-8" style={{ color: "rgba(22,48,43,0.4)" }}>Contact not found.</p>;

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

  return (
    <div>
      <div className="flex items-center justify-between mt-5 mb-7">
        <h1 style={{ fontFamily: "'Fraunces', serif", fontStyle: "italic", fontWeight: 500, fontSize: 28, margin: 0 }}>
          {contact.first_name} {contact.last_name ?? ""}
        </h1>
        <div className="flex gap-1.5">
          {contact.tags.map((t) => (
            <span
              key={t}
              className="rounded-full text-xs font-bold px-3 py-1.5 capitalize"
              style={{ background: "#F0E9FA", color: "#7A4FB5" }}
            >
              {t.replace(/_/g, " ")}
            </span>
          ))}
        </div>
      </div>

      <section style={cardStyle}>
        <h2 className="text-sm font-bold mb-4" style={{ color: "#2F4A3E" }}>
          Contact Info
        </h2>
        <dl className="grid grid-cols-[80px_1fr] gap-y-3 text-sm">
          <dt style={{ color: "rgba(22,48,43,0.45)" }}>Phone</dt>
          <dd style={{ fontWeight: 600 }}>{contact.phone ?? "—"}</dd>
          <dt style={{ color: "rgba(22,48,43,0.45)" }}>Email</dt>
          <dd style={{ fontWeight: 600 }}>{contact.email ?? "—"}</dd>
        </dl>
        <label
          className="flex items-center gap-2.5 mt-5 pt-5 text-sm cursor-pointer"
          style={{ borderTop: "1px solid var(--portal-line, rgba(22,48,43,0.08))" }}
        >
          <input type="checkbox" checked={contact.do_not_call} onChange={toggleDoNotCall} style={{ width: 16, height: 16, accentColor: "#B5566B" }} />
          <span style={{ fontWeight: 500 }}>Do not call this contact</span>
        </label>
      </section>

      <section style={cardStyle}>
        <h2 className="text-sm font-bold mb-4" style={{ color: "#2F4A3E" }}>
          Comms
        </h2>
        <div className="flex flex-wrap items-center gap-3 mb-2">
          <button
            onClick={handleCall}
            disabled={!contact.phone || calling || contact.do_not_call}
            className="flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-bold cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed hover:scale-105 active:scale-95 transition-transform duration-150"
            style={{ background: "var(--portal-emerald, #2F6D46)", color: "#fff", boxShadow: "0 3px 10px rgba(31,111,84,0.3)" }}
          >
            📞 {calling ? "Calling…" : "Call"}
          </button>
          <button
            onClick={() => setShowTextBox((s) => !s)}
            disabled={!contact.phone || contact.do_not_call}
            className="flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-bold cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed hover:scale-105 active:scale-95 transition-transform duration-150"
            style={{ background: "#3E7FBF", color: "#fff", boxShadow: "0 3px 10px rgba(62,127,191,0.3)" }}
          >
            💬 Text
          </button>
        </div>
        {contact.do_not_call && (
          <p className="text-xs mb-2" style={{ color: "#B5566B" }}>
            Marked do-not-call — calling/texting disabled.
          </p>
        )}
        {showTextBox && (
          <div className="flex gap-2 mt-3">
            <input
              value={textBody}
              onChange={(e) => setTextBody(e.target.value)}
              placeholder="Message…"
              className="flex-1"
              style={inputStyle}
            />
            <button
              onClick={handleSendText}
              disabled={texting || !textBody.trim()}
              className="rounded-full px-5 py-2.5 text-sm font-bold text-white cursor-pointer disabled:opacity-50 hover:scale-105 active:scale-95 transition-transform duration-150"
              style={{ background: "#3E7FBF" }}
            >
              {texting ? "Sending…" : "Send"}
            </button>
          </div>
        )}
        {callMsg && (
          <p className="text-xs mt-2" style={{ color: "rgba(22,48,43,0.5)" }}>
            {callMsg}
          </p>
        )}
      </section>

      <section style={cardStyle}>
        <h2 className="text-sm font-bold mb-4" style={{ color: "#2F4A3E" }}>
          Log a Call Attempt
        </h2>
        <form onSubmit={handleLogCall} className="space-y-4 mb-1">
          <div>
            <label className="block text-xs font-semibold mb-1.5" style={{ color: "rgba(22,48,43,0.5)" }}>
              Outcome
            </label>
            <select value={disposition} onChange={(e) => setDisposition(e.target.value)} className="w-full" style={inputStyle}>
              <option value="">Select an outcome…</option>
              {DISPOSITIONS.map((d) => (
                <option key={d.value} value={d.value}>
                  {d.label}
                </option>
              ))}
            </select>
          </div>
          {disposition === "pledge" && (
            <input
              type="number"
              placeholder="Pledge amount ($)"
              value={pledgeAmount}
              onChange={(e) => setPledgeAmount(e.target.value)}
              className="w-full"
              style={inputStyle}
            />
          )}
          <div>
            <label className="block text-xs font-semibold mb-1.5" style={{ color: "rgba(22,48,43,0.5)" }}>
              Notes
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="w-full resize-none"
              style={inputStyle}
            />
          </div>
          <button
            type="submit"
            disabled={!disposition || logging}
            className="rounded-full px-6 py-2.5 text-sm font-bold text-white cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed hover:scale-105 active:scale-95 transition-transform duration-150"
            style={{ background: disposition ? "var(--portal-emerald, #2F6D46)" : "rgba(22,48,43,0.25)", boxShadow: disposition ? "0 3px 10px rgba(31,111,84,0.3)" : "none" }}
          >
            {logging ? "Saving…" : "Log Call"}
          </button>
        </form>

        {history.length > 0 && (
          <div className="space-y-3.5 mt-6 pt-5" style={{ borderTop: "1px solid var(--portal-line, rgba(22,48,43,0.08))" }}>
            {history.map((h) => (
              <div key={h.id} className="text-sm">
                <p>
                  <span style={{ fontWeight: 700 }}>{dispositionLabel(h.disposition)}</span>
                  <span style={{ color: "rgba(22,48,43,0.4)" }}> · {new Date(h.called_at).toLocaleString()}</span>
                  {h.campaign_name && <span style={{ color: "rgba(22,48,43,0.4)" }}> · {h.campaign_name}</span>}
                  {h.pledge_amount != null && <span style={{ color: "rgba(22,48,43,0.4)" }}> · ${h.pledge_amount}</span>}
                </p>
                {h.notes && <p style={{ color: "rgba(22,48,43,0.55)" }}>{h.notes}</p>}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
