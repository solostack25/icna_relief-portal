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
};

export default function IntakeSearchPage() {
  const supabase = createClient();
  const router = useRouter();

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ClientResult[] | null>(null);
  const [searching, setSearching] = useState(false);

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setSearching(true);

    const term = query.trim();

    // search across name, phone, and client_number — client_number lookup
    // covers the "scan/enter ID card" case since staff can type it manually
    // if a scanner feeds the card_number/client_number into this same field
    const { data } = await supabase
      .from("clients")
      .select("id, client_number, first_name, last_name, dob, phone")
      .or(
        `first_name.ilike.%${term}%,last_name.ilike.%${term}%,phone.ilike.%${term}%,client_number.ilike.%${term}%`
      )
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
            placeholder="Name, phone, or client ID (ICNA-000123)"
            className="flex-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3 text-sm outline-none focus:border-[var(--color-accent)]"
          />
          <button
            type="submit"
            disabled={searching}
            className="rounded-lg bg-[var(--color-accent)] text-black text-sm font-medium px-5 disabled:opacity-50"
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
                  className="w-full text-left flex items-center justify-between px-4 py-3 border-b border-[var(--color-border)] last:border-0 hover:bg-black/20"
                >
                  <div>
                    <div className="text-sm font-medium">
                      {c.first_name} {c.last_name}
                    </div>
                    <div className="text-xs text-[var(--color-text-dim)]">
                      {c.client_number}
                      {c.dob ? ` · DOB ${c.dob}` : ""}
                      {c.phone ? ` · ${c.phone}` : ""}
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
          href="/intake/new"
          className="block text-center rounded-lg border border-[var(--color-accent)]/40 text-[var(--color-accent)] text-sm font-medium py-3 hover:border-[var(--color-accent)]"
        >
          + New Client Intake
        </Link>
      </div>
    </main>
  );
}
