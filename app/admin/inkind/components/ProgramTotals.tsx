"use client";

import type { ProgramTotal } from "@/lib/inkind/fetchSessions";

export default function ProgramTotals({ totals }: { totals: Record<string, ProgramTotal> }) {
  const entries = Object.entries(totals);
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-6">
      {entries.map(([program, t]) => (
        <div key={program} className="rounded-xl border border-gray-200 bg-white p-3">
          <p className="text-xs text-gray-500 truncate" title={program}>
            {program}
          </p>
          <p className="text-2xl font-bold text-brand-dark">{t.items}</p>
          <p className="text-xs text-gray-400">${t.value.toFixed(2)}</p>
        </div>
      ))}
    </div>
  );
}
