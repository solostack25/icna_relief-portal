"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type WaitlistRow = { id: string; client_id: string; requested_date: string; created_at: string; notified_at: string | null };
type ClientRow = { id: string; first_name: string; last_name: string; client_number: string | null; phone: string | null };

const cardStyle: React.CSSProperties = { background: "#fff", borderRadius: 24, boxShadow: "0 3px 12px rgba(22,48,43,0.06)" };

export default function WaitlistClient({ officeId }: { officeId: string }) {
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
      .eq("office_id", officeId)
      .order("requested_date");

    const clientIds = (waitlistRows ?? []).map((w) => w.client_id);
    const { data: clientRows } = clientIds.length
      ? await supabase.from("clients").select("id, first_name, last_name, client_number, phone").in("id", clientIds)
      : { data: [] as ClientRow[] };

    setRows(waitlistRows ?? []);
    setClients(new Map((clientRows ?? []).map((c) => [c.id, c])));
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [officeId]);

  async function markNotified(id: string) {
    await supabase.from("pickup_waitlist").update({ notified_at: new Date().toISOString() }).eq("id", id);
    load();
  }

  async function remove(id: string) {
    await supabase.from("pickup_waitlist").delete().eq("id", id);
    load();
  }

  const visible = rows.filter((r) => (showResolved ? true : !r.notified_at));
  const byDate = new Map<string, WaitlistRow[]>();
  for (const r of visible) {
    const list = byDate.get(r.requested_date) ?? [];
    list.push(r);
    byDate.set(r.requested_date, list);
  }

  if (loading) {
    return (
      <p className="text-sm" style={{ color: "rgba(22,48,43,0.4)" }}>
        Loading…
      </p>
    );
  }

  return (
    <div>
      <label className="flex items-center gap-2 text-sm mb-5" style={{ color: "rgba(22,48,43,0.55)" }}>
        <input type="checkbox" checked={showResolved} onChange={(e) => setShowResolved(e.target.checked)} />
        Show already-notified entries
      </label>

      {byDate.size === 0 ? (
        <p className="text-sm" style={{ color: "rgba(22,48,43,0.4)" }}>
          Nobody&apos;s currently on the waitlist.
        </p>
      ) : (
        Array.from(byDate.entries()).map(([date, entries]) => (
          <div key={date} className="mb-6">
            <h2 className="text-sm font-bold mb-2">
              {new Date(date + "T00:00:00").toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}{" "}
              <span className="font-normal" style={{ color: "rgba(22,48,43,0.45)" }}>
                ({entries.length} waiting)
              </span>
            </h2>
            <div style={{ ...cardStyle, overflow: "hidden" }}>
              {entries.map((r, i) => {
                const client = clients.get(r.client_id);
                return (
                  <div
                    key={r.id}
                    className="flex items-center justify-between px-5 py-3.5"
                    style={{ borderTop: i === 0 ? "none" : "1px solid var(--portal-line, rgba(22,48,43,0.06))", opacity: r.notified_at ? 0.5 : 1 }}
                  >
                    <div>
                      <div className="text-sm font-bold">{client ? `${client.first_name} ${client.last_name}` : "Unknown client"}</div>
                      <div className="text-xs" style={{ color: "rgba(22,48,43,0.45)" }}>
                        {client?.client_number}
                        {client?.phone ? (
                          <>
                            {" · "}
                            <a href={`tel:${client.phone}`} style={{ color: "var(--portal-emerald, #2F6D46)" }}>
                              {client.phone}
                            </a>
                          </>
                        ) : null}{" "}
                        · joined {new Date(r.created_at).toLocaleDateString()}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {r.notified_at ? (
                        <span className="text-xs" style={{ color: "rgba(22,48,43,0.4)" }}>
                          Notified
                        </span>
                      ) : (
                        <button
                          onClick={() => markNotified(r.id)}
                          className="text-xs font-bold rounded-full px-4 py-2 cursor-pointer hover:scale-105 active:scale-95 transition-transform duration-150"
                          style={{ background: "#EAF5EE", color: "var(--portal-emerald, #2F6D46)" }}
                        >
                          Mark notified
                        </button>
                      )}
                      <button onClick={() => remove(r.id)} className="text-xs font-semibold" style={{ color: "#B5566B" }}>
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
  );
}
