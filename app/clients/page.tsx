"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

type ClientRow = {
  id: string;
  client_number: string;
  first_name: string;
  last_name: string;
  dob: string | null;
  phone: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  household_key: string | null;
};

const PAGE_SIZE = 25;

// Same term-sniffing approach as the intake search: DOB and zip need exact
// matches (an ilike on a date or a 5-digit number either misses real
// matches or over-matches), everything else is free text across the
// fields people actually search by.
function buildSearchFilter(rawTerm: string): string {
  const term = rawTerm.trim();

  const isoDate = term.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const usDate = term.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (isoDate) return `dob.eq.${term}`;
  if (usDate) {
    const [, mm, dd, yyyy] = usDate;
    return `dob.eq.${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
  }

  if (/^\d{5}$/.test(term)) return `zip.eq.${term}`;

  return [
    `first_name.ilike.%${term}%`,
    `last_name.ilike.%${term}%`,
    `phone.ilike.%${term}%`,
    `client_number.ilike.%${term}%`,
    `household_key.ilike.%${term}%`,
    `city.ilike.%${term}%`,
    `state.ilike.%${term}%`,
  ].join(",");
}

function formatDob(dob: string | null): string {
  if (!dob) return "—";
  const [y, m, d] = dob.split("-");
  return `${m}/${d}/${y}`;
}

export default function ClientDirectoryPage() {
  const supabase = createClient();

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ClientRow[]>([]);
  const [totalCount, setTotalCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Guards against a slow earlier request clobbering a faster later one
  // when responses arrive out of order.
  const requestId = useRef(0);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current);

    debounceTimer.current = setTimeout(() => {
      runSearch(query);
    }, 250);

    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  async function runSearch(term: string) {
    const thisRequest = ++requestId.current;
    setLoading(true);
    setErrorMsg(null);

    let builder = supabase
      .from("clients")
      .select(
        "id, client_number, first_name, last_name, dob, phone, city, state, zip, household_key",
        { count: "exact" }
      );

    if (term.trim().length > 0) {
      builder = builder.or(buildSearchFilter(term));
    }

    const { data, count, error } = await builder
      .order("last_name")
      .order("first_name")
      .limit(PAGE_SIZE);

    if (thisRequest !== requestId.current) return; // stale response, ignore

    if (error) {
      setErrorMsg(error.message);
      setResults([]);
      setTotalCount(null);
    } else {
      setResults(data ?? []);
      setTotalCount(count ?? null);
    }
    setLoading(false);
  }

  return (
    <main className="min-h-screen px-4 py-12">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-semibold">Clients</h1>
            <p className="text-sm text-[var(--color-text-dim)]">
              Search existing clients or register a new household
            </p>
          </div>
          <Link
            href="/select-app"
            className="text-sm text-[var(--color-text-dim)] hover:text-[var(--color-text)]"
          >
            ← Back
          </Link>
        </div>

        <Link
          href="/intake/new-household"
          className="block text-center rounded-lg border border-[var(--color-accent)]/40 text-[var(--color-accent)] text-sm font-medium py-3 mb-6 hover:border-[var(--color-accent)]"
        >
          + New Household Intake
        </Link>

        <div className="relative mb-4">
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Start typing to search..."
            className="w-full px-4 py-2.5 rounded-lg border border-[var(--color-border)] bg-white focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
          />
          {loading && (
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[var(--color-text-dim)]">
              Searching…
            </span>
          )}
        </div>

        <div className="text-xs text-[var(--color-text-dim)] mb-3">
          {errorMsg
            ? null
            : totalCount !== null && (
                <span>
                  Showing {results.length} of {totalCount.toLocaleString()}
                  {totalCount > PAGE_SIZE ? ` — refine your search to narrow results` : ""}
                </span>
              )}
        </div>

        {errorMsg && (
          <div className="rounded-lg border border-red-200 bg-red-50 text-red-700 text-sm px-4 py-3 mb-4">
            {errorMsg}
          </div>
        )}

        <div className="rounded-lg border border-[var(--color-border)] bg-white overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--color-border)] text-left text-xs text-[var(--color-text-dim)] uppercase tracking-wide">
                <th className="px-4 py-2.5 font-medium">Name</th>
                <th className="px-4 py-2.5 font-medium">Client ID</th>
                <th className="px-4 py-2.5 font-medium">DOB</th>
                <th className="px-4 py-2.5 font-medium">Phone</th>
                <th className="px-4 py-2.5 font-medium">Location</th>
              </tr>
            </thead>
            <tbody>
              {results.length === 0 && !loading && !errorMsg && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-[var(--color-text-dim)]">
                    {query.trim() ? "No clients match that search" : "No clients found"}
                  </td>
                </tr>
              )}
              {results.map((c) => (
                <tr
                  key={c.id}
                  className="border-b border-[var(--color-border)] last:border-0 hover:bg-[var(--color-bg)] transition-colors"
                >
                  <td className="px-4 py-2.5">
                    <Link
                      href={`/clients/${c.id}`}
                      className="font-medium text-[var(--color-accent)] hover:underline"
                    >
                      {c.last_name}, {c.first_name}
                    </Link>
                  </td>
                  <td className="px-4 py-2.5 text-[var(--color-text-dim)]">{c.client_number}</td>
                  <td className="px-4 py-2.5 text-[var(--color-text-dim)]">{formatDob(c.dob)}</td>
                  <td className="px-4 py-2.5 text-[var(--color-text-dim)]">{c.phone ?? "—"}</td>
                  <td className="px-4 py-2.5 text-[var(--color-text-dim)]">
                    {[c.city, c.state].filter(Boolean).join(", ") || "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
}
