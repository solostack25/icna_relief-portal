"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";

type Sequence = {
  id: string;
  name: string;
  description: string | null;
  status: "draft" | "active" | "paused";
  stepCount: number;
  activeEnrollments: number;
};

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-gray-100 text-gray-600",
  active: "bg-emerald-100 text-emerald-700",
  paused: "bg-amber-100 text-amber-700",
};

export default function SequencesPage() {
  const [sequences, setSequences] = useState<Sequence[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    fetch("/api/marketing/sequences")
      .then((r) => r.json())
      .then((d) => setSequences(d.sequences ?? []))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const togglePause = async (s: Sequence) => {
    const newStatus = s.status === "paused" ? "active" : "paused";
    await fetch(`/api/marketing/sequences/${s.id}/status`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus }),
    });
    load();
  };

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold">Drip Sequences</h1>
          <p className="text-sm text-gray-500">Multi-step email + SMS campaigns, run automatically every 15 minutes</p>
        </div>
        <Link href="/marketing/sequences/new" className="bg-emerald-600 text-white px-4 py-2 rounded text-sm font-medium">
          New Sequence
        </Link>
      </div>

      {loading ? (
        <p className="text-gray-400 text-sm">Loading...</p>
      ) : sequences.length === 0 ? (
        <p className="text-gray-400 text-sm">No sequences yet.</p>
      ) : (
        <div className="border rounded divide-y">
          {sequences.map((s) => (
            <div key={s.id} className="p-4 flex items-center justify-between">
              <div>
                <div className="font-medium">{s.name}</div>
                <div className="text-xs text-gray-400">
                  {s.stepCount} step{s.stepCount !== 1 ? "s" : ""} · {s.activeEnrollments.toLocaleString()} active enrollments
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className={`text-[10px] px-2 py-1 rounded uppercase tracking-wide ${STATUS_COLORS[s.status]}`}>
                  {s.status}
                </span>
                {s.status !== "draft" && (
                  <button className="text-xs text-gray-500 underline" onClick={() => togglePause(s)}>
                    {s.status === "paused" ? "Resume" : "Pause"}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
