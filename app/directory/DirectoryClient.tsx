"use client";

import { useState, useMemo } from "react";
import type { DirectoryPerson } from "./page";

export default function DirectoryClient({ people }: { people: DirectoryPerson[] }) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return people;
    return people.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.email.toLowerCase().includes(q) ||
        p.jobTitle?.toLowerCase().includes(q) ||
        p.department?.toLowerCase().includes(q) ||
        p.officeLocation?.toLowerCase().includes(q)
    );
  }, [people, query]);

  return (
    <div>
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search by name, email, title, department, or office…"
        className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2.5 text-sm mb-4"
      />

      <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] overflow-hidden divide-y divide-[var(--color-border)]">
        {filtered.length === 0 && (
          <p className="p-6 text-sm text-[var(--color-text-dim)] text-center">No matches.</p>
        )}
        {filtered.map((p) => (
          <div key={p.id} className="px-5 py-3.5 flex items-center justify-between gap-4">
            <div className="min-w-0">
              <div className="text-sm font-medium truncate">{p.name}</div>
              <div className="text-xs text-[var(--color-text-dim)] truncate">
                {p.jobTitle ?? "—"}
                {p.department ? ` · ${p.department}` : ""}
                {p.officeLocation ? ` · ${p.officeLocation}` : ""}
              </div>
            </div>
            <div className="text-right shrink-0">
              <a
                href={`mailto:${p.email}`}
                className="text-xs text-[var(--color-accent)] hover:underline block"
              >
                {p.email}
              </a>
              {p.phone && <div className="text-xs text-[var(--color-text-dim)]">{p.phone}</div>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
