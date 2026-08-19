"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type ClientResult = {
  id: string;
  client_number: string;
  first_name: string;
  last_name: string;
  dob: string | null;
  phone: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
};

// Detects what kind of thing the search term looks like, so a single
// box can search name/phone/Client ID as free text, but DOB and zip as
// exact matches — an ilike on a date or a 5-digit zip would either miss
// real matches or over-match unrelated numbers.
function buildSearchFilter(rawTerm: string): string {
  const term = rawTerm.trim();

  // DOB: accept YYYY-MM-DD or MM/DD/YYYY, normalize to the DB's format
  const isoDate = term.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const usDate = term.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (isoDate) {
    return `dob.eq.${term}`;
  }
  if (usDate) {
    const [, mm, dd, yyyy] = usDate;
    const normalized = `${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
    return `dob.eq.${normalized}`;
  }

  // Zip: 5-digit numeric term
  if (/^\d{5}$/.test(term)) {
    return `zip.eq.${term}`;
  }

  // Otherwise: free text across name, phone, Client ID, city, and state —
  // client_number.ilike also covers the household_key prefix, so
  // searching a partial Client ID (with or without the -N suffix) works.
  return [
    `first_name.ilike.%${term}%`,
    `last_name.ilike.%${term}%`,
    `phone.ilike.%${term}%`,
    `client_number.ilike.%${term}%`,
    `city.ilike.%${term}%`,
    `state.ilike.%${term}%`,
  ].join(",");
}

export default function IntakeSearchPage() {
  const supabase = createClient();
  const router = useRouter();

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ClientResult[] | null>(null);
  const [searching, setSearching] = useState(false);

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setSearching(true);

    const { data } = await supabase
      .from("clients")
      .select("id, client_number, first_name, last_name, dob, phone, city, state, zip")
      .or(buildSearchFilter(query))
      .limit(20);

    setResults(data ?? []);
    setSearching(false);
  }

  return (
    <main className="min-h-screen px-4 py-12">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-xl font-semibold">Client Intake</h1>
            <p className="text-sm text-[var(--color-text-dim)]">
              Search for an existing client before creating a new record
            </p>
          </div>
          <Link
            href="/select-app"
            className="text-sm text-[var(--color-text-dim)] hover:text-[var(--color-text)]"
          >
            ← Back
          </Link>
        </div>

        <form onSubmit={handleSearch} className="flex gap-2 mb-8">
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Name, phone, Client ID, city, state, zip, or DOB (MM/DD/YYYY)"
            className="flex-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3 text-sm outline-none focus:border-[var(--color-accent)]"
          />
          <button
            type="submit"
            disabled={searching}
            className="rounded-lg bg-[var(--color-accent)] text-white text-sm font-medium px-5 disabled:opacity-50"
          >
            {searching ? "Searching..." : "Search"}
          </button>
        </form>

        {results !== null && (
          <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] overflow-hidden mb-6">
            {results.length === 0 ? (
              <p className="p-6 text-sm text-[var(--color-text-dim)]">
                No matching clients found.
              </p>
            ) : (
              results.map((c) => (
                <button
                  key={c.id}
                  onClick={() => router.push(`/clients/${c.id}`)}
                  className="w-full text-left flex items-center justify-between px-4 py-3 border-b border-[var(--color-border)] last:border-0 hover:bg-white"
                >
                  <div>
                    <div className="text-sm font-medium">
                      {c.first_name} {c.last_name}
                    </div>
                    <div className="text-xs text-[var(--color-text-dim)]">
                      {c.client_number}
                      {c.dob ? ` · DOB ${c.dob}` : ""}
                      {c.phone ? ` · ${c.phone}` : ""}
                      {c.city || c.state || c.zip
                        ? ` · ${[c.city, c.state, c.zip].filter(Boolean).join(", ")}`
                        : ""}
                    </div>
                  </div>
                  <span className="text-[var(--color-accent)] text-sm">
                    View →
                  </span>
                </button>
              ))
            )}
          </div>
        )}

        <Link
          href="/intake/new-household"
          className="block text-center rounded-lg border border-[var(--color-accent)]/40 text-[var(--color-accent)] text-sm font-medium py-3 hover:border-[var(--color-accent)]"
        >
          + New Household Intake
        </Link>
      </div>
    </main>
  );
}
