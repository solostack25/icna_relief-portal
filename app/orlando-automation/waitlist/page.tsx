"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { ORLANDO_OFFICE_ID, ORLANDO_OFFICE_LABEL } from "@/lib/orlandoAutomation/config";

type WaitlistRow = {
  id: string;
  client_id: string;
  requested_date: string;
  created_at: string;
  notified_at: string | null;
};

type ClientRow = {
  id: string;
  first_name: string;
  last_name: string;
  client_number: string | null;
  phone: string | null;
};

export default function WaitlistPage() {
  const supabase = createClient();

  const [rows, setRows] = useState<WaitlistRow[]>([]);
  const [clients, setClients] = useState<Map<string, ClientRow>>(new Map());
  const [loading, setLoading] = useState(true);
  const [showResolved, setShowResolved] = useState(false);

  async function load() {
    setLoading(true);

    const { data: waitlistRows } = await supabase
      .from("pickup_waitlist")
      .select("id, client_id, requested_date, created_at, notified_at")
      .eq("office_id", ORLANDO_OFFICE_ID)
      .order("requested_date");

    const clientIds = (waitlistRows ?? []).map((w) => w.client_id);
    const { data: clientRows } = clientIds.length
      ? await supabase
          .from("clients")
          .select("id, first_name, last_name, client_number, phone")
          .in("id", clientIds)
      : { data: [] as ClientRow[] };

    setRows(waitlistRows ?? []);
    setClients(new Map((clientRows ?? []).map((c) => [c.id, c])));
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function markNotified(id: string) {
    await supabase
      .from("pickup_waitlist")
      .update({ notified_at: new Date().toISOString() })
      .eq("id", id);
    load();
  }

  async function remove(id: string) {
    await supabase.from("pickup_waitlist").delete().eq("id", id);
    load();
  }

  function exportCSV() {
    const header = ["Requested Date", "Name", "Client Number", "Phone", "Joined", "Status"];
    const rows = visible.map((r) => {
      const client = clients.get(r.client_id);
      return [
        r.requested_date,
        client ? `${client.first_name} ${client.last_name}` : "Unknown",
        client?.client_number ?? "",
        client?.phone ?? "",
        new Date(r.created_at).toLocaleDateString(),
        r.notified_at ? "Notified" : "Waiting",
      ];
    });

    const csv = [header, ...rows]
      .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
      .join("\n");

    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "waitlist.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  const visible = rows.filter((r) => (showResolved ? true : !r.notified_at));

  // Group by requested date for quicker scanning.
  const byDate = new Map<string, WaitlistRow[]>();
  for (const r of visible) {
    const list = byDate.get(r.requested_date) ?? [];
    list.push(r);
    byDate.set(r.requested_date, list);
  }

  return (
    <main className="min-h-screen px-4 py-12">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-semibold">Waitlist</h1>
            <p className="text-sm text-[var(--color-text-dim)]">
              Clients waiting for a spot on a fully booked day
            </p>
          </div>
          <Link
            href="/orlando-automation"
            className="text-sm text-[var(--color-text-dim)] hover:text-[var(--color-text)]"
          >
            ← Home
          </Link>
        </div>

        <button
          onClick={exportCSV}
          disabled={visible.length === 0}
          className="text-xs font-medium rounded-lg px-3 py-2 border border-[var(--color-border)] text-[var(--color-text-dim)] hover:text-[var(--color-text)] disabled:opacity-40 mb-4"
        >
          Export CSV
        </button>

        <label className="flex items-center gap-2 text-xs text-[var(--color-text-dim)] mb-4">
          <input
            type="checkbox"
            checked={showResolved}
            onChange={(e) => setShowResolved(e.target.checked)}
            className="accent-[var(--color-accent)]"
          />
          Show already-notified entries
        </label>

        {loading ? (
          <p className="text-sm text-[var(--color-text-dim)]">Loading…</p>
        ) : byDate.size === 0 ? (
          <p className="text-sm text-[var(--color-text-dim)]">
            Nobody's currently on the waitlist.
          </p>
        ) : (
          Array.from(byDate.entries()).map(([date, entries]) => (
            <div key={date} className="mb-6">
              <h2 className="text-sm font-medium mb-2">
                {new Date(date + "T00:00:00").toLocaleDateString(undefined, {
                  weekday: "long",
                  month: "long",
                  day: "numeric",
                })}{" "}
                <span className="text-[var(--color-text-dim)] font-normal">
                  ({entries.length} waiting)
                </span>
              </h2>
              <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] overflow-hidden">
                {entries.map((r) => {
                  const client = clients.get(r.client_id);
                  return (
                    <div
                      key={r.id}
                      className={[
                        "flex items-center justify-between px-4 py-3 border-b border-[var(--color-border)] last:border-0",
                        r.notified_at ? "opacity-50" : "",
                      ].join(" ")}
                    >
                      <div>
                        <div className="text-sm font-medium">
                          {client ? `${client.first_name} ${client.last_name}` : "Unknown client"}
                        </div>
                        <div className="text-xs text-[var(--color-text-dim)]">
                          {client?.client_number}
                          {client?.phone ? (
                            <>
                              {" · "}
                              <a href={`tel:${client.phone}`} className="text-[var(--color-accent)]">
                                {client.phone}
                              </a>
                            </>
                          ) : null}{" "}
                          · joined {new Date(r.created_at).toLocaleDateString()}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {r.notified_at ? (
                          <span className="text-xs text-[var(--color-text-dim)]">Notified</span>
                        ) : (
                          <button
                            onClick={() => markNotified(r.id)}
                            className="text-xs font-medium rounded-lg px-3 py-1.5 border border-[var(--color-accent)] text-[var(--color-accent)] hover:bg-[var(--color-input-bg)]"
                          >
                            Mark notified
                          </button>
                        )}
                        <button
                          onClick={() => remove(r.id)}
                          className="text-xs text-red-600 hover:underline"
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))
        )}
      </div>
    </main>
  );
}
