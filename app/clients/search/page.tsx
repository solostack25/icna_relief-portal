"use client";

import { useEffect, useRef, useState, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
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
import { ClientTable } from "../ClientTable";

const PAGE_SIZE = 50;

function isClientFilter(v: string | null): v is ClientFilter {
  return v === "all" || v === "housing" || v === "backpacks";
}

export default function FullClientResultsPage() {
  return (
    <Suspense fallback={<main className="min-h-screen px-4 py-12" />}>
      <FullClientResultsContent />
    </Suspense>
  );
}

function FullClientResultsContent() {
  const params = useSearchParams();
  const query = params.get("q") ?? "";
  const filterParam = params.get("filter");
  const filter: ClientFilter = isClientFilter(filterParam) ? filterParam : "all";

  const supabase = createClient();

  const [results, setResults] = useState<ClientRow[]>([]);
  const [totalCount, setTotalCount] = useState<number | null>(null);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const requestId = useRef(0);

  useEffect(() => {
    setPage(0);
  }, [query, filter]);

  useEffect(() => {
    runSearch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, filter, page]);

  async function runSearch() {
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

    const textConsumedByFilter = detectFilterFromQuery(query) !== null && filter !== "all";
    if (query.trim() && !textConsumedByFilter) {
      const orFilter = buildTextSearchFilter(query);
      if (orFilter) builder = builder.or(orFilter);
    }

    const from = page * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;

    const { data, count, error } = await builder
      .order("last_name")
      .order("first_name")
      .range(from, to);

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

  const totalPages = totalCount !== null ? Math.max(1, Math.ceil(totalCount / PAGE_SIZE)) : null;

  return (
    <main className="min-h-screen px-4 py-12">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-2">
          <div>
            <h1 className="text-xl font-semibold">Client Search Results</h1>
            <p className="text-sm text-[var(--color-text-dim)]">
              {filter !== "all" ? FILTER_LABELS[filter] : query.trim() ? `Search: "${query}"` : "All clients"}
            </p>
          </div>
          <Link
            href="/clients"
            className="text-sm text-[var(--color-text-dim)] hover:text-[var(--color-text)]"
          >
            ← Back to search
          </Link>
        </div>

        <div className="text-xs text-[var(--color-text-dim)] mb-4">
          {totalCount !== null && (
            <span>
              {totalCount.toLocaleString()} total — page {page + 1} of {totalPages}
            </span>
          )}
        </div>

        {errorMsg && (
          <div className="rounded-lg border border-red-200 bg-red-50 text-red-700 text-sm px-4 py-3 mb-4">
            {errorMsg}
          </div>
        )}

        <ClientTable results={results} loading={loading} errorMsg={errorMsg} query={query} />

        {totalPages !== null && totalPages > 1 && (
          <div className="flex items-center justify-between mt-4">
            <button
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0 || loading}
              className="rounded-lg border border-[var(--color-border)] text-sm px-4 py-2 disabled:opacity-40"
            >
              ← Previous
            </button>
            <span className="text-xs text-[var(--color-text-dim)]">
              Page {page + 1} of {totalPages}
            </span>
            <button
              onClick={() => setPage((p) => (totalPages && p + 1 < totalPages ? p + 1 : p))}
              disabled={loading || (totalPages !== null && page + 1 >= totalPages)}
              className="rounded-lg border border-[var(--color-border)] text-sm px-4 py-2 disabled:opacity-40"
            >
              Next →
            </button>
          </div>
        )}
      </div>
    </main>
  );
}
