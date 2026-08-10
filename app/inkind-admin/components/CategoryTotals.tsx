"use client";

import { CATEGORIES } from "@/lib/inkind/categories";

export default function CategoryTotals({ totals }: { totals: Record<string, number> }) {
  return (
    <div className="grid grid-cols-3 sm:grid-cols-5 gap-3 mb-6">
      {CATEGORIES.map((c) => (
        <div key={c.code} className="rounded-xl border border-gray-200 bg-white p-3">
          <p className="text-xs text-gray-500">{c.label}</p>
          <p className="text-2xl font-bold text-brand-dark">{totals[c.code] ?? 0}</p>
        </div>
      ))}
    </div>
  );
}
