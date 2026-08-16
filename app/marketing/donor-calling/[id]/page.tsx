"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";

type Contact = { id: string; first_name: string | null; last_name: string | null; phone: string; email: string | null };

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

  const loadNext = useCallback(async () => {
    setLoading(true);
    setCallMsg(null);
    setDisposition("");
    setNotes("");
    setPledgeAmount("");
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

  if (loading) return <div className="max-w-2xl mx-auto p-6 text-gray-400 text-sm">Loading...</div>;

  if (!contact) {
    return (
      <div className="max-w-2xl mx-auto p-6 text-center">
        <h1 className="text-xl font-semibold mb-2">All done</h1>
        <p className="text-sm text-gray-500">No more uncalled contacts in this campaign&apos;s list.</p>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto p-6">
      <p className="text-xs text-gray-400 mb-4">{remaining} remaining in this list</p>

      <div className="border rounded p-5 mb-4">
        <h1 className="text-xl font-semibold mb-1">
          {contact.first_name} {contact.last_name}
        </h1>
        <p className="text-sm text-gray-500 mb-4">{contact.phone}</p>
        <button
          onClick={call}
          disabled={calling}
          className="bg-emerald-600 text-white px-4 py-2 rounded text-sm font-medium disabled:opacity-50"
        >
          {calling ? "Calling..." : "📞 Call"}
        </button>
        {callMsg && <p className="text-xs text-gray-500 mt-2">{callMsg}</p>}
      </div>

      {script && (
        <div className="border rounded p-4 mb-4 bg-gray-50">
          <div className="text-xs font-medium text-gray-500 mb-1">Script</div>
          <p className="text-sm whitespace-pre-wrap">{script}</p>
        </div>
      )}

      <div className="border rounded p-4">
        <div className="text-xs font-medium text-gray-500 mb-2">Log outcome</div>
        <select className="border rounded px-3 py-2 w-full text-sm mb-2" value={disposition} onChange={(e) => setDisposition(e.target.value)}>
          <option value="">Select outcome...</option>
          {DISPOSITIONS.map((d) => (
            <option key={d.value} value={d.value}>
              {d.label}
            </option>
          ))}
        </select>
        {disposition === "pledge" && (
          <input
            type="number"
            className="border rounded px-3 py-2 w-full text-sm mb-2"
            placeholder="Pledge amount ($)"
            value={pledgeAmount}
            onChange={(e) => setPledgeAmount(e.target.value)}
          />
        )}
        <textarea
          className="border rounded px-3 py-2 w-full text-sm mb-3"
          rows={2}
          placeholder="Notes (optional)"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
        <button
          onClick={logOutcome}
          disabled={!disposition || logging}
          className="bg-gray-900 text-white px-4 py-2 rounded text-sm font-medium disabled:opacity-50"
        >
          {logging ? "Saving..." : "Save & Next"}
        </button>
      </div>
    </div>
  );
}
