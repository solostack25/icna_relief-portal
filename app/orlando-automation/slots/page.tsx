"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useAlert } from "@/lib/orlandoAutomation/alert";
import { ORLANDO_OFFICE_ID, ORLANDO_OFFICE_LABEL } from "@/lib/orlandoAutomation/config";

type SlotRow = {
  id: string;
  slot_date: string;
  start_time: string;
  end_time: string;
  capacity: number;
  office: string;
  booked_count: number;
};

export default function SlotsPage() {
  const supabase = createClient();
  const { showAlert } = useAlert();

  const [slots, setSlots] = useState<SlotRow[] | null>(null);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    slot_date: "",
    start_time: "09:00",
    end_time: "11:00",
    capacity: 40,
  });

  async function loadSlots() {
    const { data: slotRows } = await supabase
      .from("pickup_slots")
      .select("id, slot_date, start_time, end_time, capacity, office")
      .eq("office_id", ORLANDO_OFFICE_ID)
      .gte("slot_date", new Date().toISOString().slice(0, 10))
      .order("slot_date")
      .order("start_time");

    if (!slotRows) {
      setSlots([]);
      return;
    }

    const { data: bookings } = await supabase
      .from("pickup_bookings")
      .select("slot_id, status")
      .in("slot_id", slotRows.map((s) => s.id));

    const countBySlot = new Map<string, number>();
    (bookings ?? [])
      .filter((b) => b.status === "booked" || b.status === "completed")
      .forEach((b) => {
        countBySlot.set(b.slot_id, (countBySlot.get(b.slot_id) ?? 0) + 1);
      });

    setSlots(
      slotRows.map((s) => ({ ...s, booked_count: countBySlot.get(s.id) ?? 0 }))
    );
  }

  useEffect(() => {
    loadSlots();
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);

    const { error: insertError } = await supabase.from("pickup_slots").insert({
      office: ORLANDO_OFFICE_LABEL,
      office_id: ORLANDO_OFFICE_ID,
      slot_date: form.slot_date,
      start_time: form.start_time,
      end_time: form.end_time,
      capacity: form.capacity,
    });

    setSaving(false);

    if (insertError) {
      showAlert(insertError.message, "error");
      return;
    }

    setForm((f) => ({ ...f, slot_date: "" }));
    loadSlots();
  }

  const inputClass =
    "w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-input-bg)] px-3 py-2 text-sm outline-none focus:border-[var(--color-accent)]";
  const labelClass = "block text-sm mb-1 text-[var(--color-text-dim)]";

  return (
    <main className="min-h-screen px-4 py-12">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-xl font-semibold">Pickup Calendar</h1>
            <p className="text-sm text-[var(--color-text-dim)]">
              Orlando office — upcoming slots
            </p>
          </div>
          <Link
            href="/orlando-automation"
            className="text-sm text-[var(--color-text-dim)] hover:text-[var(--color-text)]"
          >
            ← Home
          </Link>
        </div>

        <form
          onSubmit={handleCreate}
          className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 mb-8 space-y-4"
        >
          <h2 className="text-sm font-medium">Add a new time slot</h2>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="slot-date" className={labelClass}>Date</label>
              <input
                id="slot-date"
                required
                type="date"
                value={form.slot_date}
                onChange={(e) => setForm((f) => ({ ...f, slot_date: e.target.value }))}
                className={inputClass}
              />
            </div>
            <div>
              <label htmlFor="slot-capacity" className={labelClass}>Capacity</label>
              <input
                id="slot-capacity"
                required
                type="number"
                min={1}
                value={form.capacity}
                onChange={(e) =>
                  setForm((f) => ({ ...f, capacity: Number(e.target.value) }))
                }
                className={inputClass}
              />
            </div>
            <div>
              <label htmlFor="slot-start" className={labelClass}>Start Time</label>
              <input
                id="slot-start"
                required
                type="time"
                value={form.start_time}
                onChange={(e) => setForm((f) => ({ ...f, start_time: e.target.value }))}
                className={inputClass}
              />
            </div>
            <div>
              <label htmlFor="slot-end" className={labelClass}>End Time</label>
              <input
                id="slot-end"
                required
                type="time"
                value={form.end_time}
                onChange={(e) => setForm((f) => ({ ...f, end_time: e.target.value }))}
                className={inputClass}
              />
            </div>
          </div>
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-[var(--color-accent-solid)] text-white text-sm font-medium px-5 py-2.5 disabled:opacity-50"
          >
            {saving ? "Adding..." : "Add Slot"}
          </button>
        </form>

        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] overflow-hidden">
          {slots === null ? (
            <p className="p-6 text-sm text-[var(--color-text-dim)]">Loading…</p>
          ) : slots.length === 0 ? (
            <p className="p-6 text-sm text-[var(--color-text-dim)]">
              No upcoming slots yet — add one above.
            </p>
          ) : (
            slots.map((s) => (
              <Link
                key={s.id}
                href={`/orlando-automation/slots/${s.id}`}
                className="flex items-center justify-between px-4 py-3 border-b border-[var(--color-border)] last:border-0 hover:bg-[var(--color-input-bg)]"
              >
                <div>
                  <div className="text-sm font-medium">
                    {new Date(s.slot_date).toLocaleDateString(undefined, {
                      weekday: "long",
                      month: "short",
                      day: "numeric",
                    })}
                  </div>
                  <div className="text-xs text-[var(--color-text-dim)]">
                    {s.start_time.slice(0, 5)}–{s.end_time.slice(0, 5)}
                  </div>
                </div>
                <div className="text-sm text-[var(--color-text-dim)]">
                  {s.booked_count} / {s.capacity} booked
                </div>
              </Link>
            ))
          )}
        </div>
      </div>
    </main>
  );
}
