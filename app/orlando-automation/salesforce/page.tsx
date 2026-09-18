"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { ORLANDO_OFFICE_ID } from "@/lib/orlandoAutomation/config";

type IntakeRow = {
  id: string;
  client_id: string;
  created_at: string;
  salesforce_synced: boolean;
  salesforce_case_id: string | null;
  ticket_number: string | null;
};

type ClientRow = {
  id: string;
  first_name: string;
  last_name: string;
  client_number: string | null;
};

export default function SalesforcePushPage() {
  const supabase = createClient();

  const [intakes, setIntakes] = useState<IntakeRow[]>([]);
  const [clients, setClients] = useState<Map<string, ClientRow>>(new Map());
  const [loading, setLoading] = useState(true);
  const [pushing, setPushing] = useState<string | null>(null);
  const [results, setResults] = useState<Map<string, string>>(new Map());

  async function load() {
    setLoading(true);

    const { data: intakeRows } = await supabase
      .from("hp_intakes")
      // hp_intakes has no office column - scope through the client.
      .select("id, client_id, created_at, salesforce_synced, salesforce_case_id, ticket_number, clients!inner(office_id)")
      .eq("clients.office_id", ORLANDO_OFFICE_ID)
      .order("created_at", { ascending: false })
      .limit(100);

    const clientIds = (intakeRows ?? []).map((i) => i.client_id);
    const { data: clientRows } = clientIds.length
      ? await supabase
          .from("clients")
          .select("id, first_name, last_name, client_number")
          .in("id", clientIds)
      : { data: [] as ClientRow[] };

    setIntakes(intakeRows ?? []);
    setClients(new Map((clientRows ?? []).map((c) => [c.id, c])));
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function push(intakeId: string) {
    setPushing(intakeId);
    setResults((r) => new Map(r).set(intakeId, ""));

    try {
      const res = await fetch("/api/orlando-automation/salesforce/push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ intakeId }),
      });
      const data = await res.json();
      setResults((r) =>
        new Map(r).set(intakeId, res.ok ? "Pushed successfully" : data.error ?? "Push failed")
      );
    } catch (err) {
      setResults((r) =>
        new Map(r).set(intakeId, err instanceof Error ? err.message : "Push failed")
      );
    }

    setPushing(null);
    load();
  }

  const pending = intakes.filter((i) => !i.salesforce_synced);
  const synced = intakes.filter((i) => i.salesforce_synced);

  return (
    <main className="min-h-screen px-4 py-12">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-semibold">Push to Salesforce</h1>
            <p className="text-sm text-[var(--color-text-dim)]">
              Hunger Prevention intakes captured in the app, ready to sync
            </p>
          </div>
          <Link
            href="/orlando-automation"
            className="text-sm text-[var(--color-text-dim)] hover:text-[var(--color-text)]"
          >
            ← Home
          </Link>
        </div>

        <div className="rounded-lg border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 text-amber-800 text-xs px-4 py-3 mb-6">
          Salesforce field mapping for Hunger Prevention isn't finalized yet, so pushes
          will authenticate but won't create records until that's wired up. This screen
          is ready to go the moment the mapping is confirmed.
        </div>

        <h2 className="text-sm font-medium mb-2">
          Pending sync {loading ? "" : `(${pending.length})`}
        </h2>
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] overflow-hidden mb-8">
          {loading ? (
            <p className="p-6 text-sm text-[var(--color-text-dim)]">Loading…</p>
          ) : pending.length === 0 ? (
            <p className="p-6 text-sm text-[var(--color-text-dim)]">
              Nothing waiting to sync.
            </p>
          ) : (
            pending.map((i) => {
              const client = clients.get(i.client_id);
              const result = results.get(i.id);
              return (
                <div
                  key={i.id}
                  className="flex items-center justify-between px-4 py-3 border-b border-[var(--color-border)] last:border-0"
                >
                  <div>
                    <div className="text-sm font-medium">
                      {client ? `${client.first_name} ${client.last_name}` : "Unknown client"}
                    </div>
                    <div className="text-xs text-[var(--color-text-dim)]">
                      {client?.client_number} · {new Date(i.created_at).toLocaleDateString()}
                      {i.ticket_number ? ` · ${i.ticket_number}` : ""}
                    </div>
                    {result && (
                      <div className="text-xs mt-1 text-amber-700">{result}</div>
                    )}
                  </div>
                  <button
                    onClick={() => push(i.id)}
                    disabled={pushing === i.id}
                    className="text-xs font-medium rounded-lg px-3 py-2 border border-[var(--color-accent)] text-[var(--color-accent)] hover:bg-[var(--color-input-bg)] disabled:opacity-50 shrink-0"
                  >
                    {pushing === i.id ? "Pushing…" : "Push to Salesforce"}
                  </button>
                </div>
              );
            })
          )}
        </div>

        {synced.length > 0 && (
          <>
            <h2 className="text-sm font-medium mb-2 text-[var(--color-text-dim)]">
              Already synced ({synced.length})
            </h2>
            <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] overflow-hidden opacity-60">
              {synced.map((i) => {
                const client = clients.get(i.client_id);
                return (
                  <div
                    key={i.id}
                    className="flex items-center justify-between px-4 py-3 border-b border-[var(--color-border)] last:border-0"
                  >
                    <div className="text-sm">
                      {client ? `${client.first_name} ${client.last_name}` : "Unknown client"}
                    </div>
                    <span className="text-xs text-[var(--color-text-dim)]">
                      {i.salesforce_case_id ?? "synced"}
                    </span>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </main>
  );
}
