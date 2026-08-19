"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import {
  type ClientFilter,
  type ClientRow,
  CLIENT_LIST_COLUMNS,
  FILTER_LABELS,
  buildTextSearchFilter,
  detectFilterFromQuery,
  fetchFilteredClientIds,
} from "@/lib/clientSearch";
import { ClientTable } from "./ClientTable";

const PAGE_SIZE = 25;

export default function ClientDirectoryPage() {
  const supabase = createClient();

  const [query, setQuery] = useState("");
  const [manualFilter, setManualFilter] = useState<ClientFilter>("all");
  const [results, setResults] = useState<ClientRow[]>([]);
  const [totalCount, setTotalCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const detectedFilter = detectFilterFromQuery(query);
  const activeFilter: ClientFilter = manualFilter !== "all" ? manualFilter : detectedFilter ?? "all";

  // Guards against a slow earlier request clobbering a faster later one
  // when responses arrive out of order.
  const requestId = useRef(0);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => {
      runSearch(query, activeFilter);
    }, 250);
    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, manualFilter]);

  async function runSearch(term: string, filter: ClientFilter) {
    const thisRequest = ++requestId.current;
    setLoading(true);
    setErrorMsg(null);

    let idScope: string[] | null = null;
    if (filter !== "all") {
      idScope = await fetchFilteredClientIds(supabase, filter);
      if (thisRequest !== requestId.current) return;
      if (!idScope || idScope.length === 0) {
        setResults([]);
        setTotalCount(0);
        setLoading(false);
        return;
      }
    }

    let builder = supabase.from("clients").select(CLIENT_LIST_COLUMNS, { count: "exact" });

    if (idScope) builder = builder.in("id", idScope);

    // If the free-text query itself was what triggered the filter (e.g.
    // typing "transitional housing"), don't also try to ilike-match that
    // sentence against name/address columns — it was already consumed by
    // the filter above.
    const textConsumedByFilter = manualFilter === "all" && detectFilterFromQuery(term) !== null;
    if (term.trim() && !textConsumedByFilter) {
      const orFilter = buildTextSearchFilter(term);
      if (orFilter) builder = builder.or(orFilter);
    }

    const { data, count, error } = await builder
      .order("last_name")
      .order("first_name")
      .limit(PAGE_SIZE);

    if (thisRequest !== requestId.current) return;

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

  const fullListHref = `/clients/search?q=${encodeURIComponent(query)}&filter=${activeFilter}`;

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

        <div className="relative mb-3">
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Name, phone, Client ID, address, DOB, zip, or a question like 'in transitional housing'..."
            className="w-full px-4 py-2.5 rounded-lg border border-[var(--color-border)] bg-white focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
          />
          {loading && (
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[var(--color-text-dim)]">
              Searching…
            </span>
          )}
        </div>

        <div className="flex flex-wrap gap-2 mb-4">
          {(["all", "housing", "backpacks"] as ClientFilter[]).map((f) => (
            <button
              key={f}
              onClick={() => setManualFilter(f)}
              className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                activeFilter === f
                  ? "bg-[var(--color-accent)] text-white border-[var(--color-accent)]"
                  : "border-[var(--color-border)] text-[var(--color-text-dim)] hover:border-[var(--color-accent)]"
              }`}
            >
              {FILTER_LABELS[f]}
            </button>
          ))}
          {manualFilter === "all" && detectedFilter && (
            <span className="text-xs px-3 py-1.5 text-[var(--color-text-dim)]">
              Detected from your search — showing {FILTER_LABELS[detectedFilter]}
            </span>
          )}
        </div>

        <div className="text-xs text-[var(--color-text-dim)] mb-3 flex items-center justify-between">
          {errorMsg
            ? null
            : totalCount !== null && (
                <span>
                  Showing {results.length} of {totalCount.toLocaleString()}
                </span>
              )}
          {totalCount !== null && totalCount > PAGE_SIZE && (
            <Link href={fullListHref} className="text-[var(--color-accent)] hover:underline">
              View all {totalCount.toLocaleString()} results →
            </Link>
          )}
        </div>

        {errorMsg && (
          <div className="rounded-lg border border-red-200 bg-red-50 text-red-700 text-sm px-4 py-3 mb-4">
            {errorMsg}
          </div>
        )}

        <ClientTable results={results} loading={loading} errorMsg={errorMsg} query={query} />
      </div>
    </main>
  );
}
