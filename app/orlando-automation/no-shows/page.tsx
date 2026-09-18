"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { ORLANDO_OFFICE_ID, ORLANDO_OFFICE_LABEL } from "@/lib/orlandoAutomation/config";

type BookingRow = {
  id: string;
  status: string;
  client_id: string;
  slot_id: string;
};

type ClientRow = {
  id: string;
  first_name: string;
  last_name: string;
  client_number: string | null;
  phone: string | null;
};

type SlotRow = {
  id: string;
  slot_date: string;
  start_time: string;
};

function daysAgoISO(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

export default function NoShowsPage() {
  const supabase = createClient();

  const [bookings, setBookings] = useState<BookingRow[]>([]);
  const [clients, setClients] = useState<Map<string, ClientRow>>(new Map());
  const [slots, setSlots] = useState<Map<string, SlotRow>>(new Map());
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);

    const cutoff = daysAgoISO(30);

    const { data: slotRows } = await supabase
      .from("pickup_slots")
      .select("id, slot_date, start_time")
      .eq("office_id", ORLANDO_OFFICE_ID)
      .gte("slot_date", cutoff)
      .order("slot_date", { ascending: false });

    const slotMap = new Map((slotRows ?? []).map((s) => [s.id, s]));
    setSlots(slotMap);

    const slotIds = (slotRows ?? []).map((s) => s.id);
    const { data: bookingRows } = slotIds.length
      ? await supabase
          .from("pickup_bookings")
          .select("id, status, client_id, slot_id")
          .in("slot_id", slotIds)
          .in("status", ["missed", "expired"])
      : { data: [] as BookingRow[] };

    const clientIds = (bookingRows ?? []).map((b) => b.client_id);
    const { data: clientRows } = clientIds.length
      ? await supabase
          .from("clients")
          .select("id, first_name, last_name, client_number, phone")
          .in("id", clientIds)
      : { data: [] as ClientRow[] };

    setBookings(bookingRows ?? []);
    setClients(new Map((clientRows ?? []).map((c) => [c.id, c])));
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sorted = bookings.slice().sort((a, b) => {
    const da = slots.get(a.slot_id)?.slot_date ?? "";
    const db = slots.get(b.slot_id)?.slot_date ?? "";
    return db.localeCompare(da);
  });

  return (
    <main className="min-h-screen px-4 py-12">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-semibold">No-Shows</h1>
            <p className="text-sm text-[var(--color-text-dim)]">
              Missed pickups in the last 30 days
            </p>
          </div>
          <Link
            href="/orlando-automation"
            className="text-sm text-[var(--color-text-dim)] hover:text-[var(--color-text)]"
          >
            ← Home
          </Link>
        </div>

        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] overflow-hidden">
          {loading ? (
            <p className="p-6 text-sm text-[var(--color-text-dim)]">Loading…</p>
          ) : sorted.length === 0 ? (
            <p className="p-6 text-sm text-[var(--color-text-dim)]">
              No missed pickups in the last 30 days.
            </p>
          ) : (
            sorted.map((b) => {
              const client = clients.get(b.client_id);
              const slot = slots.get(b.slot_id);
              return (
                <div
                  key={b.id}
                  className="flex items-center justify-between px-4 py-3 border-b border-[var(--color-border)] last:border-0"
                >
                  <div>
                    <div className="text-sm font-medium">
                      {client ? `${client.first_name} ${client.last_name}` : "Unknown client"}
                    </div>
                    <div className="text-xs text-[var(--color-text-dim)]">
                      {slot ? new Date(slot.slot_date + "T00:00:00").toLocaleDateString() : ""} ·{" "}
                      {client?.client_number}
                      {client?.phone ? (
                        <>
                          {" · "}
                          <a href={`tel:${client.phone}`} className="text-[var(--color-accent)]">
                            {client.phone}
                          </a>
                        </>
                      ) : null}
                    </div>
                  </div>
                  <span
                    className={[
                      "text-xs font-medium rounded-full px-2.5 py-1 shrink-0",
                      b.status === "expired"
                        ? "bg-red-50 dark:bg-red-950/40 text-red-600"
                        : "bg-amber-50 dark:bg-amber-950/40 text-amber-700",
                    ].join(" ")}
                  >
                    {b.status}
                  </span>
                </div>
              );
            })
          )}
        </div>
      </div>
    </main>
  );
}
