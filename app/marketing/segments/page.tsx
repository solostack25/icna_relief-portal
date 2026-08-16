"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type Segment = {
  id: string;
  name: string;
  description: string | null;
  type: "static" | "dynamic";
  memberCount: number;
  created_at: string;
};

export default function SegmentsPage() {
  const [segments, setSegments] = useState<Segment[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/marketing/segments")
      .then((r) => r.json())
      .then((d) => setSegments(d.segments ?? []))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold">Segments</h1>
          <p className="text-sm text-gray-500">Static lists and live donor/tag-based audiences</p>
        </div>
        <Link href="/marketing/segments/new" className="bg-emerald-600 text-white px-4 py-2 rounded text-sm font-medium">
          New Segment
        </Link>
      </div>

      {loading ? (
        <p className="text-gray-400 text-sm">Loading...</p>
      ) : segments.length === 0 ? (
        <p className="text-gray-400 text-sm">No segments yet.</p>
      ) : (
        <div className="border rounded divide-y">
          {segments.map((s) => (
            <div key={s.id} className="p-4 flex items-center justify-between">
              <div>
                <div className="font-medium flex items-center gap-2">
                  {s.name}
                  <span
                    className={`text-[10px] px-1.5 py-0.5 rounded uppercase tracking-wide ${
                      s.type === "dynamic" ? "bg-blue-100 text-blue-700" : "bg-gray-100 text-gray-600"
                    }`}
                  >
                    {s.type}
                  </span>
                </div>
                {s.description && <div className="text-xs text-gray-400 mt-0.5">{s.description}</div>}
              </div>
              <div className="text-sm text-gray-500">{s.memberCount.toLocaleString()} contacts</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
