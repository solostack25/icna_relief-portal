"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

type SlotRow = {
  id: string;
  slot_date: string;
  start_time: string;
  end_time: string;
  capacity: number;
  booked_count: number;
};

const cardStyle: React.CSSProperties = { background: "#fff", borderRadius: 24, boxShadow: "0 3px 12px rgba(22,48,43,0.06)" };
const inputStyle: React.CSSProperties = {
  border: "1.5px solid var(--portal-line, rgba(22,48,43,0.12))",
  borderRadius: 10,
  padding: "9px 12px",
  fontSize: 14,
  background: "#fff",
  outline: "none",
};

export default function SlotsClient({ officeId }: { officeId: string }) {
  const supabase = createClient();
  const [slots, setSlots] = useState<SlotRow[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ slot_date: "", start_time: "09:00", end_time: "11:00", capacity: 40 });

  async function loadSlots() {
    const { data: slotRows } = await supabase
      .from("pickup_slots")
      .select("id, slot_date, start_time, end_time, capacity")
      .eq("office_id", officeId)
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
      .forEach((b) => countBySlot.set(b.slot_id, (countBySlot.get(b.slot_id) ?? 0) + 1));

    setSlots(slotRows.map((s) => ({ ...s, booked_count: countBySlot.get(s.id) ?? 0 })));
  }

  useEffect(() => {
    loadSlots();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [officeId]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);

    const { error: insertError } = await supabase.from("pickup_slots").insert({
      office_id: officeId,
      slot_date: form.slot_date,
      start_time: form.start_time,
      end_time: form.end_time,
      capacity: form.capacity,
    });

    setSaving(false);
    if (insertError) {
      setError(insertError.message);
      return;
    }
    setForm((f) => ({ ...f, slot_date: "" }));
    loadSlots();
  }

  return (
    <div>
      <form onSubmit={handleCreate} style={{ ...cardStyle, padding: "22px 24px", marginBottom: 28 }} className="space-y-4">
        <h2 className="text-sm font-bold" style={{ color: "#2F4A3E" }}>
          Add a new time slot
        </h2>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold mb-1.5" style={{ color: "rgba(22,48,43,0.5)" }}>
              Date
            </label>
            <input
              required
              type="date"
              value={form.slot_date}
              onChange={(e) => setForm((f) => ({ ...f, slot_date: e.target.value }))}
              className="w-full"
              style={inputStyle}
            />
          </div>
          <div>
            <label className="block text-xs font-semibold mb-1.5" style={{ color: "rgba(22,48,43,0.5)" }}>
              Capacity
            </label>
            <input
              required
              type="number"
              min={1}
              value={form.capacity}
              onChange={(e) => setForm((f) => ({ ...f, capacity: Number(e.target.value) }))}
              className="w-full"
              style={inputStyle}
            />
          </div>
          <div>
            <label className="block text-xs font-semibold mb-1.5" style={{ color: "rgba(22,48,43,0.5)" }}>
              Start Time
            </label>
            <input
              required
              type="time"
              value={form.start_time}
              onChange={(e) => setForm((f) => ({ ...f, start_time: e.target.value }))}
              className="w-full"
              style={inputStyle}
            />
          </div>
          <div>
            <label className="block text-xs font-semibold mb-1.5" style={{ color: "rgba(22,48,43,0.5)" }}>
              End Time
            </label>
            <input
              required
              type="time"
              value={form.end_time}
              onChange={(e) => setForm((f) => ({ ...f, end_time: e.target.value }))}
              className="w-full"
              style={inputStyle}
            />
          </div>
        </div>
        {error && (
          <p className="text-sm" style={{ color: "#B5566B" }}>
            {error}
          </p>
        )}
        <button
          type="submit"
          disabled={saving}
          className="rounded-full text-white text-sm font-bold px-5 py-2.5 disabled:opacity-50 cursor-pointer hover:scale-105 active:scale-95 transition-transform duration-150"
          style={{ background: "var(--portal-emerald, #2F6D46)", boxShadow: "0 3px 10px rgba(31,111,84,0.3)" }}
        >
          {saving ? "Adding…" : "Add Slot"}
        </button>
      </form>

      <div style={{ ...cardStyle, overflow: "hidden" }}>
        {slots === null ? (
          <p className="p-6 text-sm" style={{ color: "rgba(22,48,43,0.4)" }}>
            Loading…
          </p>
        ) : slots.length === 0 ? (
          <p className="p-6 text-sm" style={{ color: "rgba(22,48,43,0.4)" }}>
            No upcoming slots yet — add one above.
          </p>
        ) : (
          slots.map((s, i) => (
            <Link
              key={s.id}
              href={`/hunger-prevention/slots/${s.id}?office=${officeId}`}
              className="flex items-center justify-between px-5 py-3.5"
              style={{ borderTop: i === 0 ? "none" : "1px solid var(--portal-line, rgba(22,48,43,0.06))" }}
            >
              <div>
                <div className="text-sm font-bold">
                  {new Date(s.slot_date + "T00:00:00").toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" })}
                </div>
                <div className="text-xs" style={{ color: "rgba(22,48,43,0.45)" }}>
                  {s.start_time.slice(0, 5)}–{s.end_time.slice(0, 5)}
                </div>
              </div>
              <div className="text-sm" style={{ color: "rgba(22,48,43,0.5)" }}>
                {s.booked_count} / {s.capacity} booked
              </div>
            </Link>
          ))
        )}
      </div>
    </div>
  );
}
