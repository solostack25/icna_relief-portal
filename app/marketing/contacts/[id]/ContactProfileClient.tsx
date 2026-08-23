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

  if (loading) return <p className="text-sm text-gray-400 mt-6">Loading…</p>;
  if (notFoundErr || !contact) return <p className="text-sm text-gray-400 mt-6">Contact not found.</p>;

  return (
    <div>
      <div className="flex items-center justify-between mt-4 mb-6">
        <h1 className="text-xl font-semibold">
          {contact.first_name} {contact.last_name ?? ""}
        </h1>
        <div className="flex gap-1.5">
          {contact.tags.map((t) => (
            <span key={t} className="rounded-full bg-purple-100 text-purple-700 text-xs font-medium px-2.5 py-1 capitalize">
              {t.replace(/_/g, " ")}
            </span>
          ))}
        </div>
      </div>

      <section className="rounded-xl border p-6 mb-6" style={{ background: "var(--portal-sand, #FAF8F2)" }}>
        <h2 className="text-sm font-medium mb-4">Contact Info</h2>
        <dl className="grid grid-cols-[80px_1fr] gap-y-3 text-sm">
          <dt className="text-gray-500">Phone</dt>
          <dd>{contact.phone ?? "—"}</dd>
          <dt className="text-gray-500">Email</dt>
          <dd>{contact.email ?? "—"}</dd>
        </dl>
        <label className="flex items-center gap-2 mt-4 pt-4 border-t text-sm cursor-pointer">
          <input type="checkbox" checked={contact.do_not_call} onChange={toggleDoNotCall} />
          Do not call this contact
        </label>
      </section>

      <section className="rounded-xl border p-6 mb-6" style={{ background: "var(--portal-sand, #FAF8F2)" }}>
        <h2 className="text-sm font-medium mb-4">Comms</h2>
        <div className="flex flex-wrap items-center gap-3 mb-2">
          <button
            onClick={handleCall}
            disabled={!contact.phone || calling || contact.do_not_call}
            className="flex items-center gap-2 border rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-40"
            style={{ borderColor: "var(--portal-emerald)", color: "var(--portal-emerald)" }}
          >
            📞 {calling ? "Calling…" : "Call"}
          </button>
          <button
            onClick={() => setShowTextBox((s) => !s)}
            disabled={!contact.phone || contact.do_not_call}
            className="flex items-center gap-2 border rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-40"
            style={{ borderColor: "#3E7FBF", color: "#3E7FBF" }}
          >
            💬 Text
          </button>
        </div>
        {contact.do_not_call && <p className="text-xs text-amber-600 mb-2">Marked do-not-call — calling/texting disabled.</p>}
        {showTextBox && (
          <div className="flex gap-2 mb-2">
            <input
              value={textBody}
              onChange={(e) => setTextBody(e.target.value)}
              placeholder="Message…"
              className="flex-1 border rounded-lg px-3 py-2 text-sm"
            />
            <button
              onClick={handleSendText}
              disabled={texting || !textBody.trim()}
              className="rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              style={{ background: "#3E7FBF" }}
            >
              {texting ? "Sending…" : "Send"}
            </button>
          </div>
        )}
        {callMsg && <p className="text-xs text-gray-500">{callMsg}</p>}
      </section>

      <section className="rounded-xl border p-6" style={{ background: "var(--portal-sand, #FAF8F2)" }}>
        <h2 className="text-sm font-medium mb-4">Log a Call Attempt</h2>
        <form onSubmit={handleLogCall} className="space-y-3 mb-5">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Outcome</label>
            <select
              value={disposition}
              onChange={(e) => setDisposition(e.target.value)}
              className="w-full border rounded-lg px-3 py-2 text-sm bg-white"
            >
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
              className="w-full border rounded-lg px-3 py-2 text-sm bg-white"
            />
          )}
          <div>
            <label className="block text-xs text-gray-500 mb-1">Notes</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="w-full border rounded-lg px-3 py-2 text-sm bg-white resize-none"
            />
          </div>
          <button
            type="submit"
            disabled={!disposition || logging}
            className="rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            style={{ background: "var(--portal-emerald)" }}
          >
            {logging ? "Saving…" : "Log Call"}
          </button>
        </form>

        {history.length > 0 && (
          <div className="space-y-3 pt-4 border-t">
            {history.map((h) => (
              <div key={h.id} className="text-sm">
                <p>
                  <span className="font-medium">{dispositionLabel(h.disposition)}</span>
                  <span className="text-gray-400"> · {new Date(h.called_at).toLocaleString()}</span>
                  {h.campaign_name && <span className="text-gray-400"> · {h.campaign_name}</span>}
                  {h.pledge_amount != null && <span className="text-gray-400"> · ${h.pledge_amount}</span>}
                </p>
                {h.notes && <p className="text-gray-500">{h.notes}</p>}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
