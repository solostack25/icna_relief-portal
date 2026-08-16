"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

type Segment = { id: string; name: string; memberCount: number };

export default function NewDonorCallingCampaignPage() {
  const router = useRouter();
  const [segments, setSegments] = useState<Segment[]>([]);
  const [name, setName] = useState("");
  const [script, setScript] = useState("");
  const [segmentId, setSegmentId] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/marketing/segments")
      .then((r) => r.json())
      .then((d) => setSegments(d.segments ?? []));
  }, []);

  const save = async () => {
    if (!name.trim() || !segmentId) return setError("Name and segment are required");
    setSaving(true);
    const res = await fetch("/api/marketing/donor-calling", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, script, segmentId }),
    });
    const data = await res.json();
    setSaving(false);
    if (res.ok) router.push(`/marketing/donor-calling/${data.id}`);
    else setError(data.error ?? "Could not save campaign");
  };

  return (
    <div className="max-w-2xl mx-auto p-6">
      <h1 className="text-2xl font-semibold mb-1">New Calling Campaign</h1>
      <p className="text-sm text-gray-500 mb-6">Callers work through the segment one contact at a time, with your script alongside.</p>

      <div className="space-y-3 mb-6">
        <input className="border rounded px-3 py-2 w-full text-sm" placeholder="Campaign name" value={name} onChange={(e) => setName(e.target.value)} />
        <textarea
          className="border rounded px-3 py-2 w-full text-sm"
          rows={6}
          placeholder="Talking points / script (shown to callers during each call)"
          value={script}
          onChange={(e) => setScript(e.target.value)}
        />
        <select className="border rounded px-3 py-2 w-full text-sm" value={segmentId} onChange={(e) => setSegmentId(e.target.value)}>
          <option value="">Select a segment...</option>
          {segments.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name} ({s.memberCount.toLocaleString()} contacts)
            </option>
          ))}
        </select>
      </div>

      {error && <p className="text-sm text-red-600 mb-4">{error}</p>}

      <button className="bg-emerald-600 text-white px-4 py-2 rounded text-sm font-medium disabled:opacity-50" onClick={save} disabled={saving}>
        {saving ? "Saving..." : "Save & Start"}
      </button>
    </div>
  );
}
