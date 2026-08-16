"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import EmailBuilderClient from "./EmailBuilderClient";
import { renderBlocksToHtml, type EmailBlock } from "@/lib/emailBlocks";

type Segment = { id: string; name: string; memberCount: number };

export default function NewCampaignPage() {
  const router = useRouter();
  const [segments, setSegments] = useState<Segment[]>([]);
  const [name, setName] = useState("");
  const [subject, setSubject] = useState("");
  const [blocks, setBlocks] = useState<EmailBlock[]>([]);
  const [segmentId, setSegmentId] = useState("");
  const [saving, setSaving] = useState(false);
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [sendResult, setSendResult] = useState<{ sent: number; failed: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/marketing/segments")
      .then((r) => r.json())
      .then((d) => setSegments(d.segments ?? []));
  }, []);

  const createDraft = async (): Promise<string | null> => {
    if (!name.trim() || !subject.trim() || blocks.length === 0 || !segmentId) {
      setError("Name, subject, at least one content block, and a segment are all required.");
      return null;
    }
    setSaving(true);
    setError(null);
    const res = await fetch("/api/marketing/campaigns", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, subject, bodyHtml: renderBlocksToHtml(blocks), bodyBlocks: blocks, segmentId }),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) {
      setError(data.error ?? "Could not save campaign");
      return null;
    }
    return data.id;
  };

  const saveAndSend = async () => {
    const id = await createDraft();
    if (!id) return;
    setSendingId(id);
    const res = await fetch(`/api/marketing/campaigns/${id}/send`, { method: "POST" });
    const data = await res.json();
    setSendingId(null);
    if (!res.ok) {
      setError(data.error ?? "Send failed");
      return;
    }
    setSendResult(data);
  };

  const saveDraftOnly = async () => {
    const id = await createDraft();
    if (id) router.push("/marketing/campaigns");
  };

  const selectedSegment = segments.find((s) => s.id === segmentId);

  if (sendResult) {
    return (
      <div className="max-w-2xl mx-auto p-6">
        <h1 className="text-xl font-semibold mb-4">Campaign sent</h1>
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="border rounded p-4 text-center">
            <div className="text-2xl font-semibold text-emerald-600">{sendResult.sent}</div>
            <div className="text-xs text-gray-500">Sent</div>
          </div>
          <div className="border rounded p-4 text-center">
            <div className="text-2xl font-semibold text-red-500">{sendResult.failed}</div>
            <div className="text-xs text-gray-500">Failed</div>
          </div>
          <div className="border rounded p-4 text-center">
            <div className="text-2xl font-semibold text-gray-500">{sendResult.total}</div>
            <div className="text-xs text-gray-500">Total recipients</div>
          </div>
        </div>
        <button
          className="bg-emerald-600 text-white px-4 py-2 rounded text-sm font-medium"
          onClick={() => router.push("/marketing/campaigns")}
        >
          Back to Campaigns
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto p-6">
      <h1 className="text-2xl font-semibold mb-1">New Campaign</h1>
      <p className="text-sm text-gray-500 mb-6">
        Every send includes an unsubscribe link and mailing address footer automatically (CAN-SPAM requirement).
      </p>

      <div className="space-y-3 mb-4">
        <input
          className="border rounded px-3 py-2 w-full text-sm"
          placeholder="Internal campaign name"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <input
          className="border rounded px-3 py-2 w-full text-sm"
          placeholder="Subject line"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
        />
      </div>

      <div className="border rounded p-4 mb-4">
        <EmailBuilderClient blocks={blocks} onChange={setBlocks} />
      </div>

      <div className="space-y-3 mb-4">
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
          Will send to up to {selectedSegment.memberCount.toLocaleString()} contacts in &quot;{selectedSegment.name}&quot;
          (fewer if some have opted out or have no email on file).
        </p>
      )}

      {error && <p className="text-sm text-red-600 mb-4">{error}</p>}

      <div className="flex gap-3">
        <button
          className="bg-emerald-600 text-white px-4 py-2 rounded text-sm font-medium disabled:opacity-50"
          onClick={saveAndSend}
          disabled={saving || !!sendingId}
        >
          {sendingId ? "Sending..." : "Send Now"}
        </button>
        <button
          className="border px-4 py-2 rounded text-sm font-medium disabled:opacity-50"
          onClick={saveDraftOnly}
          disabled={saving || !!sendingId}
        >
          Save Draft
        </button>
      </div>
    </div>
  );
}
