"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useLanguage } from "@/lib/orlandoAutomation/i18n";
import { ORLANDO_OFFICE_ID, ORLANDO_STATE } from "@/lib/orlandoAutomation/config";

type ClientResult = {
  id: string;
  client_number: string;
  first_name: string;
  last_name: string;
  dob: string | null;
  phone: string | null;
  is_blocked: boolean | null;
  dietary_preference: string | null;
};

const PAGE_SIZE = 50;

export default function ClientsPage() {
  const supabase = createClient();
  const { t, tn } = useLanguage();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ClientResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);
  const [totalCount, setTotalCount] = useState<number | null>(null);

  async function runQuery(term: string) {
    setLoading(true);

    let builder = supabase
      .from("clients")
      .select("id, client_number, first_name, last_name, dob, phone, is_blocked, dietary_preference", {
        count: "exact",
      })
      .eq("office_id", ORLANDO_OFFICE_ID);

    if (term) {
      builder = builder.or(
        `first_name.ilike.%${term}%,last_name.ilike.%${term}%,phone.ilike.%${term}%,client_number.ilike.%${term}%`
      );
    }

    const { data, count } = await builder
      .order("last_name", { ascending: true })
      .order("first_name", { ascending: true })
      .range(0, PAGE_SIZE - 1);

    setResults(data ?? []);
    setTotalCount(count ?? 0);
    setHasMore((count ?? 0) > PAGE_SIZE);
    setLoading(false);
  }

  // Initial load: browse the full client list right away.
  useEffect(() => {
    runQuery("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Live filter as you type, debounced so we're not hammering the DB on every keystroke.
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      runQuery(query.trim());
    }, 250);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  return (
    <main className="min-h-screen px-4 py-12">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-xl font-semibold">{t("clientsPage.title")}</h1>
            <p className="text-sm text-[var(--color-text-dim)]">
              {totalCount !== null ? tn("clientsPage.count", totalCount) : t("common.loading")}
            </p>
          </div>
          <Link
            href="/orlando-automation"
            className="text-sm text-[var(--color-text-dim)] hover:text-[var(--color-text)]"
          >
            {t("common.backHome")}
          </Link>
        </div>

        <div className="relative mb-6">
          <input
            aria-label={t("clientsPage.filterPlaceholder")}
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("clientsPage.filterPlaceholder")}
            className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3 text-sm outline-none focus:border-[var(--color-accent)]"
          />
          {query && (
            <button
              onClick={() => setQuery("")}
              aria-label={t("clientsPage.clearFilter")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--color-text-dim)] hover:text-[var(--color-text)] text-sm"
            >
              ✕
            </button>
          )}
        </div>

        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] overflow-hidden mb-2">
          {loading ? (
            <p className="p-6 text-sm text-[var(--color-text-dim)]">{t("common.loading")}</p>
          ) : results.length === 0 ? (
            <p className="p-6 text-sm text-[var(--color-text-dim)]">{t("clientsPage.noMatches")}</p>
          ) : (
            results.map((c) => (
              <Link
                key={c.id}
                href={`/orlando-automation/clients/${c.id}`}
                className="flex items-center justify-between px-4 py-3 border-b border-[var(--color-border)] last:border-0 hover:bg-[var(--color-input-bg)]"
              >
                <div>
                  <div className="text-sm font-medium flex items-center gap-2">
                    {c.first_name} {c.last_name}
                    {c.is_blocked && (
                      <span className="text-[10px] font-semibold text-red-600 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 rounded-full px-1.5 py-0.5">
                        {t("clientsPage.blocked")}
                      </span>
                    )}
                    {(c.dietary_preference === "Halal" || c.dietary_preference === "Non-Halal") && (
                      <span
                        className={[
                          "text-[10px] font-semibold rounded-full px-1.5 py-0.5",
                          c.dietary_preference === "Halal"
                            ? "text-[var(--badge-green-fg)] bg-[var(--badge-green-bg)]"
                            : "text-[var(--badge-amber-fg)] bg-[var(--badge-amber-bg)]",
                        ].join(" ")}
                      >
                        {c.dietary_preference}
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-[var(--color-text-dim)]">
                    {c.client_number}
                    {c.dob ? ` · ${t("profile.dob")} ${c.dob}` : ""}
                    {c.phone ? ` · ${c.phone}` : ""}
                  </div>
                </div>
                <span className="text-[var(--color-accent)] text-sm">{t("clientsPage.view")}</span>
              </Link>
            ))
          )}
        </div>

        {hasMore && (
          <p className="text-xs text-[var(--color-text-dim)] mb-6">
            {t("clientsPage.showingFirst", { n: PAGE_SIZE })}
          </p>
        )}

        <Link
          href="/orlando-automation/clients/new"
          className="block text-center rounded-lg border border-[var(--color-accent)]/40 text-[var(--color-accent)] text-sm font-medium py-3 hover:border-[var(--color-accent)] mt-4"
        >
          {t("clientsPage.registerNew")}
        </Link>
      </div>
    </main>
  );
}
