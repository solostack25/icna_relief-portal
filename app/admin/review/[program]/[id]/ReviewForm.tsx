"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function ReviewForm({
  program,
  submissionId,
  currentStatus,
}: {
  program: string;
  submissionId: string;
  currentStatus: string;
}) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState<"reviewed" | "flagged" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleAction(status: "reviewed" | "flagged") {
    if (status === "flagged" && !note.trim()) {
      setError("Add a note explaining what needs fixing before flagging.");
      return;
    }
    setError(null);
    setSaving(status);

    const res = await fetch("/api/admin/review", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ program, submissionId, status, note: note || null }),
    });

    setSaving(null);

    if (!res.ok) {
      const data = await res.json();
      setError(data.error ?? "Failed to update.");
      return;
    }

    router.push(`/admin/review?program=${program}`);
    router.refresh();
  }

  return (
    <section className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6">
      <h2 className="text-sm font-medium mb-1">Review</h2>
      <p className="text-xs text-[var(--color-text-dim)] mb-4">
        Current status: <span className="capitalize">{currentStatus}</span>
      </p>

      <label className="block text-xs mb-1 text-[var(--color-text-dim)]">
        Note (required if flagging)
      </label>
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        rows={3}
        className="w-full mb-4 rounded-lg border border-[var(--color-border)] bg-white px-3 py-2 text-sm outline-none focus:border-[var(--color-accent)]"
        placeholder="e.g. Backpack count doesn't match attendee count, please double check"
      />

      {error && <p className="text-sm text-[#B55139] mb-3">{error}</p>}

      <div className="flex gap-3">
        <button
          onClick={() => handleAction("reviewed")}
          disabled={saving !== null}
          className="flex-1 rounded-lg bg-[var(--color-accent)] text-white text-sm font-medium py-2 disabled:opacity-50"
        >
          {saving === "reviewed" ? "Saving..." : "Mark Reviewed"}
        </button>
        <button
          onClick={() => handleAction("flagged")}
          disabled={saving !== null}
          className="flex-1 rounded-lg border border-[#B55139]/40 text-[#B55139] text-sm font-medium py-2 hover:border-[#B55139] disabled:opacity-50"
        >
          {saving === "flagged" ? "Saving..." : "Flag Issue"}
        </button>
      </div>
    </section>
  );
}
