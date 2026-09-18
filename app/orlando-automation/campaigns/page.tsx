"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Plus, Search } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import AddContactModal from "./AddContactModal";
import { ORLANDO_OFFICE_ID } from "@/lib/orlandoAutomation/config";

type Contact = {
  id: string;
  first_name: string;
  last_name: string | null;
  phone: string | null;
  email: string | null;
  organization: string | null;
  list_tag: string | null;
  do_not_call: boolean;
};

const PAGE_SIZE = 50;

export default function CampaignsPage() {
  const supabase = createClient();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalCount, setTotalCount] = useState<number | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);

  async function runQuery(term: string) {
    setLoading(true);

    let builder = supabase
      .from("campaign_contacts")
      .select(
        "id, first_name, last_name, phone, email, organization, list_tag, do_not_call",
        { count: "exact" }
      )
      .eq("office_id", ORLANDO_OFFICE_ID);

    if (term) {
      builder = builder.or(
        `first_name.ilike.%${term}%,last_name.ilike.%${term}%,phone.ilike.%${term}%,organization.ilike.%${term}%`
      );
    }

    const { data, count } = await builder
      .order("created_at", { ascending: false })
      .limit(PAGE_SIZE);

    setResults(data ?? []);
    setTotalCount(count ?? 0);
    setLoading(false);
  }

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => runQuery(query), 250);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  function handleAdded() {
    setShowAddModal(false);
    runQuery(query);
  }

  return (
    <main className="min-h-screen px-4 py-12">
      <div className="max-w-2xl mx-auto">
        <Link
          href="/orlando-automation"
          className="text-sm text-[var(--color-text-dim)] hover:text-[var(--color-text)]"
        >
          ← Back to home
        </Link>

        <div className="flex items-center justify-between mt-4 mb-6">
          <div>
            <h1 className="text-xl font-semibold">Donor Campaigns</h1>
            <p className="text-sm text-[var(--color-text-dim)]">
              {totalCount !== null ? `${totalCount} contact${totalCount === 1 ? "" : "s"}` : "…"}
            </p>
          </div>
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-2 rounded-lg bg-[var(--color-accent-solid)] text-white text-sm font-medium px-4 py-2 hover:opacity-90 transition-opacity"
          >
            <Plus size={15} strokeWidth={2.5} aria-hidden="true" />
            Add Contact
          </button>
        </div>

        <div className="relative mb-4">
          <Search
            size={16}
            strokeWidth={2}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-text-dim)]"
            aria-hidden="true"
          />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name, phone, or organization…"
            className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-input-bg)] pl-9 pr-3.5 py-2.5 text-sm focus:outline-none"
          />
        </div>

        {loading ? (
          <p className="text-sm text-[var(--color-text-dim)]">Loading…</p>
        ) : results.length === 0 ? (
          <p className="text-sm text-[var(--color-text-dim)]">
            {query
              ? "No contacts match that search."
              : "No contacts yet — add your first one to get started."}
          </p>
        ) : (
          <ul className="space-y-2">
            {results.map((c) => (
              <li key={c.id}>
                <Link
                  href={`/orlando-automation/campaigns/${c.id}`}
                  className="flex items-center justify-between rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3 hover:border-[var(--color-accent)] transition-colors"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">
                      {c.first_name} {c.last_name ?? ""}
                      {c.do_not_call && (
                        <span className="ml-2 rounded-full bg-red-100 dark:bg-red-950/40 text-red-700 dark:text-red-400 text-xs font-medium px-2 py-0.5">
                          Do not call
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-[var(--color-text-dim)] truncate">
                      {[c.organization, c.phone, c.email].filter(Boolean).join(" · ") || "—"}
                    </p>
                  </div>
                  {c.list_tag && (
                    <span className="shrink-0 ml-3 rounded-full bg-[var(--badge-purple-bg)] text-[var(--badge-purple-fg)] text-xs font-medium px-2.5 py-1">
                      {c.list_tag}
                    </span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>

      {showAddModal && (
        <AddContactModal onClose={() => setShowAddModal(false)} onAdded={handleAdded} />
      )}
    </main>
  );
}
