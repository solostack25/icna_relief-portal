"use client";

import { useState, useMemo } from "react";
import type { DirectoryPerson } from "./page";

type StateGroup = {
  state: string;
  fieldOffices: string[];
  areaManagers: DirectoryPerson[];
  employees: DirectoryPerson[];
};
type RegionGroup = {
  region: string;
  regionalDirectors: DirectoryPerson[];
  states: StateGroup[];
};

function PersonRow({ person, tag }: { person: DirectoryPerson; tag?: string }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2.5 px-3">
      <div className="min-w-0">
        <div className="text-sm font-medium truncate">
          {person.name}
          {tag && (
            <span className="ml-2 text-[10px] font-semibold uppercase tracking-wide text-[var(--color-accent)] bg-[var(--color-accent)]/10 px-1.5 py-0.5 rounded">
              {tag}
            </span>
          )}
        </div>
        <div className="text-xs text-[var(--color-text-dim)] truncate">{person.jobTitle ?? "—"}</div>
      </div>
      <div className="text-right shrink-0">
        <a href={`mailto:${person.email}`} className="text-xs text-[var(--color-accent)] hover:underline block">
          {person.email}
        </a>
        {person.phone && <div className="text-xs text-[var(--color-text-dim)]">{person.phone}</div>}
      </div>
    </div>
  );
}

function StateSection({ group }: { group: StateGroup }) {
  const [open, setOpen] = useState(false);
  const total = group.areaManagers.length + group.employees.length;

  return (
    <div className="border-t border-[var(--color-border)] first:border-t-0">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-2.5 text-left hover:bg-black/[0.02] cursor-pointer"
      >
        <span className="text-sm font-medium">
          {group.state}
          <span className="text-[var(--color-text-dim)] font-normal ml-2 text-xs">
            {group.fieldOffices.join(", ")}
          </span>
        </span>
        <span className="text-xs text-[var(--color-text-dim)]">
          {total} {total === 1 ? "person" : "people"} {open ? "▲" : "▼"}
        </span>
      </button>
      {open && (
        <div className="divide-y divide-[var(--color-border)] bg-black/[0.015]">
          {group.areaManagers.map((p) => (
            <PersonRow key={p.id} person={p} tag="Area Manager" />
          ))}
          {group.employees.map((p) => (
            <PersonRow key={p.id} person={p} />
          ))}
          {total === 0 && <p className="px-4 py-3 text-xs text-[var(--color-text-dim)]">No one matched here yet.</p>}
        </div>
      )}
    </div>
  );
}

function RegionSection({ region }: { region: RegionGroup }) {
  const [open, setOpen] = useState(false);
  const totalPeople =
    region.regionalDirectors.length +
    region.states.reduce((sum, s) => sum + s.areaManagers.length + s.employees.length, 0);

  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] overflow-hidden mb-3">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-3.5 text-left hover:bg-black/[0.02] cursor-pointer"
      >
        <div>
          <div className="text-sm font-semibold">{region.region}</div>
          {region.regionalDirectors.length > 0 && (
            <div className="text-xs text-[var(--color-text-dim)]">
              Regional Director: {region.regionalDirectors.map((p) => p.name).join(", ")}
            </div>
          )}
        </div>
        <span className="text-xs text-[var(--color-text-dim)]">
          {totalPeople} {totalPeople === 1 ? "person" : "people"} {open ? "▲" : "▼"}
        </span>
      </button>
      {open && (
        <div>
          {region.regionalDirectors.length > 0 && (
            <div className="border-t border-[var(--color-border)] bg-[var(--color-accent)]/[0.03] divide-y divide-[var(--color-border)]">
              {region.regionalDirectors.map((p) => (
                <PersonRow key={p.id} person={p} tag="Regional Director" />
              ))}
            </div>
          )}
          {region.states.map((s) => (
            <StateSection key={s.state} group={s} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function DirectoryClient({
  regions,
  unmatched,
  allPeople,
}: {
  regions: RegionGroup[];
  unmatched: DirectoryPerson[];
  allPeople: DirectoryPerson[];
}) {
  const [query, setQuery] = useState("");
  const [unmatchedOpen, setUnmatchedOpen] = useState(false);

  const searchResults = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return null;
    return allPeople.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.email.toLowerCase().includes(q) ||
        p.jobTitle?.toLowerCase().includes(q) ||
        p.department?.toLowerCase().includes(q) ||
        p.officeLocation?.toLowerCase().includes(q)
    );
  }, [allPeople, query]);

  return (
    <div>
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search by name, email, title, or office…"
        className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2.5 text-sm mb-4"
      />

      {searchResults ? (
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] overflow-hidden divide-y divide-[var(--color-border)]">
          {searchResults.length === 0 && (
            <p className="p-6 text-sm text-[var(--color-text-dim)] text-center">No matches.</p>
          )}
          {searchResults.map((p) => (
            <PersonRow key={p.id} person={p} />
          ))}
        </div>
      ) : (
        <>
          {regions.map((r) => (
            <RegionSection key={r.region} region={r} />
          ))}

          {unmatched.length > 0 && (
            <div className="rounded-xl border border-amber-200 bg-amber-50/50 overflow-hidden mt-4">
              <button
                onClick={() => setUnmatchedOpen(!unmatchedOpen)}
                className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-black/[0.02] cursor-pointer"
              >
                <span className="text-sm font-medium text-amber-800">
                  Unmatched ({unmatched.length}) — office not recognized
                </span>
                <span className="text-xs text-amber-700">{unmatchedOpen ? "▲" : "▼"}</span>
              </button>
              {unmatchedOpen && (
                <div className="divide-y divide-amber-100 border-t border-amber-100">
                  {unmatched.map((p) => (
                    <PersonRow key={p.id} person={p} />
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
