"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type Segment = { id: string; name: string; memberCount: number };

export default function NewSmsCampaignPage() {
  const router = useRouter();
  const [segments, setSegments] = useState<Segment[]>([]);
  const [name, setName] = useState("");
  const [text, setText] = useState("");
  const [segmentId, setSegmentId] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ sent: number; failed: number; total: number } | null>(null);

  useEffect(() => {
    fetch("/api/marketing/segments")
      .then((r) => r.json())
      .then((d) => setSegments(d.segments ?? []));
  }, []);

  const selectedSegment = segments.find((s) => s.id === segmentId);

  const sendNow = async () => {
    if (!name.trim() || !text.trim() || !segmentId) {
      setError("Name, message, and a segment are all required.");
      return;
    }
    setSending(true);
    setError(null);

    const createRes = await fetch("/api/marketing/sms-campaigns", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, text, segmentId }),
    });
    const created = await createRes.json();
    if (!createRes.ok) {
      setSending(false);
      setError(created.error ?? "Could not save campaign");
      return;
    }

    const sendRes = await fetch(`/api/marketing/sms-campaigns/${created.id}/send`, { method: "POST" });
    const sendData = await sendRes.json();
    setSending(false);
    if (!sendRes.ok) {
      setError(sendData.error ?? "Send failed");
      return;
    }
    setResult(sendData);
  };

  if (result) {
    return (
      <div className="max-w-2xl mx-auto p-6">
        <h1 className="text-xl font-semibold mb-4">Campaign sent</h1>
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="border rounded p-4 text-center">
            <div className="text-2xl font-semibold text-emerald-600">{result.sent}</div>
            <div className="text-xs text-gray-500">Sent</div>
          </div>
          <div className="border rounded p-4 text-center">
            <div className="text-2xl font-semibold text-red-500">{result.failed}</div>
            <div className="text-xs text-gray-500">Failed</div>
          </div>
          <div className="border rounded p-4 text-center">
            <div className="text-2xl font-semibold text-gray-500">{result.total}</div>
            <div className="text-xs text-gray-500">Total recipients</div>
          </div>
        </div>
        <button className="bg-emerald-600 text-white px-4 py-2 rounded text-sm font-medium" onClick={() => router.push("/marketing/sms-campaigns")}>
          Back to SMS Campaigns
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto p-6">
      <h1 className="text-2xl font-semibold mb-1">New SMS Campaign</h1>
      <p className="text-sm text-gray-500 mb-6">
        Sends throttled to Skyetel&apos;s 1 message/sec limit. Anyone who&apos;s texted STOP is automatically excluded.
      </p>

      <div className="space-y-3 mb-4">
        <input
          className="border rounded px-3 py-2 w-full text-sm"
          placeholder="Internal campaign name"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <div>
          <textarea
            className="border rounded px-3 py-2 w-full text-sm"
            rows={4}
            maxLength={1024}
            placeholder="Message text"
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <div className="text-xs text-gray-400 text-right">{text.length}/1024</div>
        </div>
        <select className="border rounded px-3 py-2 w-full text-sm" value={segmentId} onChange={(e) => setSegmentId(e.target.value)}>
          <option value="">Select a segment...</option>
          {segments.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name} ({s.memberCount.toLocaleString()} contacts)
            </option>
          ))}
        </select>
      </div>

      {selectedSegment && (
        <p className="text-xs text-gray-500 mb-4">
          Will text up to {selectedSegment.memberCount.toLocaleString()} contacts in &quot;{selectedSegment.name}&quot;
          (fewer if some have opted out or have no phone on file). Segments over 250 recipients aren&apos;t supported yet
          — split into smaller lists for now.
        </p>
      )}

      {error && <p className="text-sm text-red-600 mb-4">{error}</p>}

      <button
        className="bg-emerald-600 text-white px-4 py-2 rounded text-sm font-medium disabled:opacity-50"
        onClick={sendNow}
        disabled={sending}
      >
        {sending ? "Sending..." : "Send Now"}
      </button>
    </div>
  );
}
