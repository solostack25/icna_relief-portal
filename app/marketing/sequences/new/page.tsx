"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

type Step = {
  channel: "email" | "sms";
  delayAfterPreviousHours: number;
  subject: string;
  body: string;
};

type Segment = { id: string; name: string; memberCount: number };

const emptyStep = (): Step => ({ channel: "email", delayAfterPreviousHours: 0, subject: "", body: "" });

export default function NewSequencePage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [steps, setSteps] = useState<Step[]>([emptyStep()]);
  const [segments, setSegments] = useState<Segment[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [enrollSegmentId, setEnrollSegmentId] = useState("");
  const [enrolling, setEnrolling] = useState(false);
  const [enrolled, setEnrolled] = useState<number | null>(null);

  useEffect(() => {
    fetch("/api/marketing/segments")
      .then((r) => r.json())
      .then((d) => setSegments(d.segments ?? []));
  }, []);

  const updateStep = (i: number, patch: Partial<Step>) => {
    setSteps((prev) => prev.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));
  };

  const save = async () => {
    if (!name.trim()) return setError("Name is required");
    setSaving(true);
    setError(null);
    const res = await fetch("/api/marketing/sequences", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, description, steps }),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) return setError(data.error ?? "Could not save sequence");
    setSavedId(data.id);
  };

  const enroll = async () => {
    if (!savedId || !enrollSegmentId) return;
    setEnrolling(true);
    const res = await fetch(`/api/marketing/sequences/${savedId}/enroll`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ segmentId: enrollSegmentId }),
    });
    const data = await res.json();
    setEnrolling(false);
    if (res.ok) setEnrolled(data.enrolled);
    else setError(data.error ?? "Could not enroll segment");
  };

  if (savedId) {
    return (
      <div className="max-w-2xl mx-auto p-6">
        <h1 className="text-xl font-semibold mb-2">Sequence saved</h1>
        <p className="text-sm text-gray-500 mb-6">
          Enroll a segment now, or skip this and enroll later from the sequence detail page.
        </p>

        {enrolled !== null ? (
          <div>
            <p className="text-sm mb-4">
              Enrolled <span className="font-medium text-emerald-600">{enrolled.toLocaleString()}</span> contacts. The
              first step will send on the next dispatcher run (within 15 minutes) for anyone with no delay before it.
            </p>
            <button className="bg-emerald-600 text-white px-4 py-2 rounded text-sm font-medium" onClick={() => router.push("/marketing/sequences")}>
              Back to Sequences
            </button>
          </div>
        ) : (
          <div className="flex gap-2 items-center">
            <select className="border rounded px-3 py-2 text-sm flex-1" value={enrollSegmentId} onChange={(e) => setEnrollSegmentId(e.target.value)}>
              <option value="">Select a segment to enroll...</option>
              {segments.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.memberCount.toLocaleString()} contacts)
                </option>
              ))}
            </select>
            <button
              className="bg-emerald-600 text-white px-4 py-2 rounded text-sm font-medium disabled:opacity-50"
              onClick={enroll}
              disabled={!enrollSegmentId || enrolling}
            >
              {enrolling ? "Enrolling..." : "Enroll"}
            </button>
          </div>
        )}
        {error && <p className="text-sm text-red-600 mt-3">{error}</p>}
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto p-6">
      <h1 className="text-2xl font-semibold mb-1">New Sequence</h1>
      <p className="text-sm text-gray-500 mb-6">
        Mix email and SMS steps freely. Delay is measured from when the previous step fired (or from enrollment, for
        step 1).
      </p>

      <div className="space-y-3 mb-6">
        <input className="border rounded px-3 py-2 w-full text-sm" placeholder="Sequence name" value={name} onChange={(e) => setName(e.target.value)} />
        <input className="border rounded px-3 py-2 w-full text-sm" placeholder="Description (optional)" value={description} onChange={(e) => setDescription(e.target.value)} />
      </div>

      <div className="space-y-4 mb-4">
        {steps.map((step, i) => (
          <div key={i} className="border rounded p-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-medium">Step {i + 1}</span>
              {steps.length > 1 && (
                <button className="text-xs text-gray-400" onClick={() => setSteps((prev) => prev.filter((_, idx) => idx !== i))}>
                  Remove
                </button>
              )}
            </div>

            <div className="flex items-center gap-3 mb-3">
              <select className="border rounded px-2 py-1 text-sm" value={step.channel} onChange={(e) => updateStep(i, { channel: e.target.value as "email" | "sms" })}>
                <option value="email">Email</option>
                <option value="sms">SMS</option>
              </select>
              <span className="text-xs text-gray-500">
                {i === 0 ? "Send" : "Wait"}
              </span>
              <input
                type="number"
                min={0}
                className="border rounded px-2 py-1 text-sm w-20"
                value={step.delayAfterPreviousHours}
                onChange={(e) => updateStep(i, { delayAfterPreviousHours: Number(e.target.value) })}
              />
              <span className="text-xs text-gray-500">hours {i === 0 ? "after enrollment" : "after previous step"}</span>
            </div>

            {step.channel === "email" && (
              <input
                className="border rounded px-3 py-2 w-full text-sm mb-2"
                placeholder="Subject line"
                value={step.subject}
                onChange={(e) => updateStep(i, { subject: e.target.value })}
              />
            )}
            <textarea
              className="border rounded px-3 py-2 w-full text-sm font-mono"
              rows={step.channel === "email" ? 6 : 3}
              maxLength={step.channel === "sms" ? 1024 : undefined}
              placeholder={step.channel === "email" ? "Email body (HTML)" : "SMS text"}
              value={step.body}
              onChange={(e) => updateStep(i, { body: e.target.value })}
            />
            {step.channel === "sms" && <div className="text-xs text-gray-400 text-right">{step.body.length}/1024</div>}
          </div>
        ))}
      </div>

      <button className="text-sm text-emerald-600 mb-6" onClick={() => setSteps((prev) => [...prev, emptyStep()])}>
        + Add step
      </button>

      {error && <p className="text-sm text-red-600 mb-4">{error}</p>}

      <div>
        <button className="bg-emerald-600 text-white px-4 py-2 rounded text-sm font-medium disabled:opacity-50" onClick={save} disabled={saving}>
          {saving ? "Saving..." : "Save Sequence"}
        </button>
      </div>
    </div>
  );
}
