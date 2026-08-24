"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { logAudit } from "@/lib/hungerPrevention/audit";

type SlotRow = {
  id: string;
  slot_date: string;
  start_time: string;
  end_time: string;
  capacity: number;
  distribution_type: "halal" | "non_halal" | null;
  booked_count: number;
};

type BlackoutRow = { id: string; blackout_date: string; reason: string | null };
type ViewMode = "month" | "week" | "day";

function toISODate(d: Date) {
  return d.toISOString().slice(0, 10);
}
function startOfWeek(d: Date) {
  const copy = new Date(d);
  copy.setDate(copy.getDate() - copy.getDay());
  copy.setHours(0, 0, 0, 0);
  return copy;
}
function addDays(d: Date, n: number) {
  const copy = new Date(d);
  copy.setDate(copy.getDate() + n);
  return copy;
}

const inputStyle: React.CSSProperties = {
  border: "1.5px solid var(--portal-line, rgba(22,48,43,0.12))",
  borderRadius: 10,
  padding: "8px 12px",
  fontSize: 13,
  background: "#fff",
  outline: "none",
};
const cardStyle: React.CSSProperties = { background: "#fff", borderRadius: 24, boxShadow: "0 3px 12px rgba(22,48,43,0.06)" };

export default function HungerCalendarClient({ officeId }: { officeId: string }) {
  const supabase = createClient();

  const [view, setView] = useState<ViewMode>("month");
  const [anchor, setAnchor] = useState<Date>(() => {
    const t = new Date();
    t.setHours(0, 0, 0, 0);
    return t;
  });
  const [selectedDate, setSelectedDate] = useState<string>(toISODate(new Date()));

  const [slots, setSlots] = useState<SlotRow[]>([]);
  const [blackouts, setBlackouts] = useState<BlackoutRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [employeeId, setEmployeeId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    start_time: "09:00",
    end_time: "11:00",
    capacity: 40,
    distribution_type: "halal" as "halal" | "non_halal",
    repeatWeekly: false,
    repeatWeeks: 4,
  });
  const [saving, setSaving] = useState(false);

  const [bulkStart, setBulkStart] = useState("");
  const [bulkEnd, setBulkEnd] = useState("");
  const [bulkSaving, setBulkSaving] = useState(false);
  const [showBulkBlackout, setShowBulkBlackout] = useState(false);

  useEffect(() => {
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      const { data: employee } = await supabase.from("employees").select("id").eq("auth_user_id", user.id).single();
      setEmployeeId(employee?.id ?? null);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const rangeStart = useMemo(() => toISODate(addDays(anchor, -35)), [anchor]);
  const rangeEnd = useMemo(() => toISODate(addDays(anchor, 90)), [anchor]);

  async function loadData() {
    setLoading(true);

    const { data: slotRows } = await supabase
      .from("pickup_slots")
      .select("id, slot_date, start_time, end_time, capacity, distribution_type")
      .eq("office_id", officeId)
      .gte("slot_date", rangeStart)
      .lte("slot_date", rangeEnd)
      .order("slot_date")
      .order("start_time");

    const ids = (slotRows ?? []).map((s) => s.id);
    const { data: bookingRows } = ids.length
      ? await supabase.from("pickup_bookings").select("slot_id, status").in("slot_id", ids)
      : { data: [] as { slot_id: string; status: string }[] };

    const countBySlot = new Map<string, number>();
    (bookingRows ?? []).filter((b) => b.status === "booked" || b.status === "completed").forEach((b) => countBySlot.set(b.slot_id, (countBySlot.get(b.slot_id) ?? 0) + 1));

    setSlots((slotRows ?? []).map((s) => ({ ...s, booked_count: countBySlot.get(s.id) ?? 0 })));

    const { data: blackoutRows } = await supabase
      .from("blackout_days")
      .select("id, blackout_date, reason")
      .eq("office_id", officeId)
      .gte("blackout_date", rangeStart)
      .lte("blackout_date", rangeEnd);

    setBlackouts(blackoutRows ?? []);
    setLoading(false);
  }

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rangeStart, rangeEnd, officeId]);

  const slotsByDate = useMemo(() => {
    const map = new Map<string, SlotRow[]>();
    for (const s of slots) {
      const list = map.get(s.slot_date) ?? [];
      list.push(s);
      map.set(s.slot_date, list);
    }
    return map;
  }, [slots]);

  const blackoutDates = useMemo(() => new Set(blackouts.map((b) => b.blackout_date)), [blackouts]);

  async function toggleBlackout(dateISO: string) {
    const existing = blackouts.find((b) => b.blackout_date === dateISO);
    if (existing) {
      await supabase.from("blackout_days").delete().eq("id", existing.id);
      await logAudit(supabase, employeeId, "remove_blackout", "blackout_day", existing.id, { date: dateISO });
    } else {
      const { data } = await supabase
        .from("blackout_days")
        .insert({ office_id: officeId, blackout_date: dateISO, reason: "Set from calendar", created_by: employeeId })
        .select("id")
        .single();
      await logAudit(supabase, employeeId, "add_blackout", "blackout_day", data?.id ?? null, { date: dateISO });
    }
    loadData();
  }

  async function handleBulkBlackout(e: React.FormEvent) {
    e.preventDefault();
    if (!bulkStart || !bulkEnd) return;
    setBulkSaving(true);

    const start = new Date(bulkStart + "T00:00:00");
    const end = new Date(bulkEnd + "T00:00:00");
    const dates: string[] = [];
    for (let d = start; d <= end; d = addDays(d, 1)) dates.push(toISODate(d));

    const existingDates = new Set(blackouts.map((b) => b.blackout_date));
    const toInsert = dates.filter((d) => !existingDates.has(d)).map((d) => ({ office_id: officeId, blackout_date: d, reason: "Bulk blackout", created_by: employeeId }));

    if (toInsert.length > 0) {
      await supabase.from("blackout_days").insert(toInsert);
      await logAudit(supabase, employeeId, "bulk_add_blackout", "blackout_day", null, { start: bulkStart, end: bulkEnd, count: toInsert.length });
    }

    setBulkSaving(false);
    setBulkStart("");
    setBulkEnd("");
    setShowBulkBlackout(false);
    loadData();
  }

  async function handleAddSlot(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);

    const dates: string[] = [selectedDate];
    if (form.repeatWeekly) {
      const base = new Date(selectedDate + "T00:00:00");
      for (let i = 1; i < form.repeatWeeks; i++) dates.push(toISODate(addDays(base, i * 7)));
    }

    const rows = dates
      .filter((d) => !blackoutDates.has(d))
      .map((d) => ({
        office_id: officeId,
        slot_date: d,
        start_time: form.start_time,
        end_time: form.end_time,
        capacity: form.capacity,
        distribution_type: form.distribution_type,
      }));

    const { error: insertError } = await supabase.from("pickup_slots").insert(rows);

    setSaving(false);
    if (insertError) {
      setError(insertError.message);
      return;
    }
    await logAudit(supabase, employeeId, "add_slot", "pickup_slot", null, { dates, ...form });
    loadData();
  }

  async function handleDeleteSlot(id: string) {
    await supabase.from("pickup_slots").delete().eq("id", id);
    await logAudit(supabase, employeeId, "delete_slot", "pickup_slot", id);
    loadData();
  }

  function renderMonth() {
    const year = anchor.getFullYear();
    const month = anchor.getMonth();
    const gridStart = startOfWeek(new Date(year, month, 1));
    const days: Date[] = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));

    return (
      <div>
        <div className="grid grid-cols-7 text-xs mb-1" style={{ color: "rgba(22,48,43,0.4)" }}>
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
            <div key={d} className="text-center py-1">
              {d}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1.5">
          {days.map((d) => {
            const iso = toISODate(d);
            const inMonth = d.getMonth() === month;
            const daySlots = slotsByDate.get(iso) ?? [];
            const isBlackout = blackoutDates.has(iso);
            const isSelected = iso === selectedDate;
            const isToday = iso === toISODate(new Date());
            return (
              <button
                key={iso}
                onClick={() => setSelectedDate(iso)}
                className="aspect-square rounded-xl p-1.5 text-left flex flex-col justify-between transition-all duration-150 hover:scale-105"
                style={{
                  background: isBlackout ? "#FBE9EC" : "#fff",
                  opacity: inMonth ? 1 : 0.35,
                  boxShadow: isSelected ? "0 0 0 2px var(--portal-emerald, #2F6D46)" : "0 1px 4px rgba(22,48,43,0.06)",
                }}
              >
                <span className="text-xs" style={{ fontWeight: isToday ? 700 : 400, color: isToday ? "var(--portal-emerald, #2F6D46)" : "rgba(22,48,43,0.5)" }}>
                  {d.getDate()}
                </span>
                {isBlackout ? (
                  <span className="text-[10px] font-bold" style={{ color: "#B5566B" }}>
                    Blackout
                  </span>
                ) : daySlots.length > 0 ? (
                  <span className="text-[10px] font-bold" style={{ color: "var(--portal-emerald, #2F6D46)" }}>
                    {daySlots.length} slot{daySlots.length > 1 ? "s" : ""}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  function renderWeek() {
    const start = startOfWeek(anchor);
    const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
    return (
      <div className="grid grid-cols-7 gap-1.5">
        {days.map((d) => {
          const iso = toISODate(d);
          const daySlots = slotsByDate.get(iso) ?? [];
          const isBlackout = blackoutDates.has(iso);
          const isSelected = iso === selectedDate;
          return (
            <button
              key={iso}
              onClick={() => setSelectedDate(iso)}
              className="rounded-xl p-2 text-left transition-all duration-150"
              style={{ minHeight: 110, background: isBlackout ? "#FBE9EC" : "#fff", boxShadow: isSelected ? "0 0 0 2px var(--portal-emerald, #2F6D46)" : "0 1px 4px rgba(22,48,43,0.06)" }}
            >
              <div className="text-xs mb-1" style={{ color: "rgba(22,48,43,0.45)" }}>
                {d.toLocaleDateString(undefined, { weekday: "short", day: "numeric" })}
              </div>
              {isBlackout && (
                <div className="text-[10px] font-bold mb-1" style={{ color: "#B5566B" }}>
                  Blackout
                </div>
              )}
              {daySlots.map((s) => (
                <div key={s.id} className="text-[10px] mb-0.5">
                  {s.distribution_type === "halal" ? "🟢" : s.distribution_type === "non_halal" ? "🟠" : ""} {s.start_time.slice(0, 5)} · {s.booked_count}/{s.capacity}
                </div>
              ))}
            </button>
          );
        })}
      </div>
    );
  }

  function renderDayDetail() {
    const daySlots = (slotsByDate.get(selectedDate) ?? []).slice();
    const isBlackout = blackoutDates.has(selectedDate);
    const dateLabel = new Date(selectedDate + "T00:00:00").toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });

    return (
      <div style={{ ...cardStyle, padding: "22px 24px", marginTop: 16 }}>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-bold">{dateLabel}</h3>
          <button
            onClick={() => toggleBlackout(selectedDate)}
            className="text-xs font-bold rounded-full px-4 py-2 cursor-pointer"
            style={{ background: isBlackout ? "#FBE9EC" : "#F4F3EE", color: isBlackout ? "#B5566B" : "rgba(22,48,43,0.5)" }}
          >
            {isBlackout ? "Remove blackout" : "Mark as blackout day"}
          </button>
        </div>

        {isBlackout && (
          <p className="text-xs mb-3" style={{ color: "#B5566B" }}>
            No pickup times will be offered to clients on this day.
          </p>
        )}

        {daySlots.length === 0 ? (
          <p className="text-sm mb-3" style={{ color: "rgba(22,48,43,0.4)" }}>
            No time slots set for this day.
          </p>
        ) : (
          <div className="space-y-1.5 mb-4">
            {daySlots.map((s) => (
              <div key={s.id} className="flex items-center justify-between text-sm rounded-xl px-3.5 py-2.5" style={{ background: "#F4F3EE" }}>
                <Link href={`/hunger-prevention/slots/${s.id}?office=${officeId}`} className="flex items-center gap-2">
                  {s.start_time.slice(0, 5)}–{s.end_time.slice(0, 5)} · {s.booked_count}/{s.capacity} booked
                  {s.distribution_type && (
                    <span
                      className="rounded-full text-[10px] font-bold px-2 py-0.5"
                      style={{ background: s.distribution_type === "halal" ? "#EAF5EE" : "#FCEFDD", color: s.distribution_type === "halal" ? "var(--portal-emerald, #2F6D46)" : "#A57420" }}
                    >
                      {s.distribution_type === "halal" ? "Halal" : "Non-Halal"}
                    </span>
                  )}
                </Link>
                <button onClick={() => handleDeleteSlot(s.id)} className="text-xs font-semibold" style={{ color: "#B5566B" }}>
                  Remove
                </button>
              </div>
            ))}
          </div>
        )}

        {!isBlackout && (
          <form onSubmit={handleAddSlot} className="grid grid-cols-2 gap-2.5 items-end">
            <div>
              <label className="block text-xs font-semibold mb-1" style={{ color: "rgba(22,48,43,0.5)" }}>
                Start
              </label>
              <input required type="time" value={form.start_time} onChange={(e) => setForm((f) => ({ ...f, start_time: e.target.value }))} className="w-full" style={inputStyle} />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1" style={{ color: "rgba(22,48,43,0.5)" }}>
                End
              </label>
              <input required type="time" value={form.end_time} onChange={(e) => setForm((f) => ({ ...f, end_time: e.target.value }))} className="w-full" style={inputStyle} />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1" style={{ color: "rgba(22,48,43,0.5)" }}>
                Capacity
              </label>
              <input required type="number" min={1} value={form.capacity} onChange={(e) => setForm((f) => ({ ...f, capacity: Number(e.target.value) }))} className="w-full" style={inputStyle} />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1" style={{ color: "rgba(22,48,43,0.5)" }}>
                Distribution type
              </label>
              <select
                required
                value={form.distribution_type}
                onChange={(e) => setForm((f) => ({ ...f, distribution_type: e.target.value as "halal" | "non_halal" }))}
                className="w-full"
                style={inputStyle}
              >
                <option value="halal">Halal</option>
                <option value="non_halal">Non-Halal</option>
              </select>
            </div>
            <div className="col-span-2 flex items-center gap-2.5">
              <label className="flex items-center gap-1.5 text-xs" style={{ color: "rgba(22,48,43,0.5)" }}>
                <input type="checkbox" checked={form.repeatWeekly} onChange={(e) => setForm((f) => ({ ...f, repeatWeekly: e.target.checked }))} />
                Repeat weekly for
              </label>
              <input
                type="number"
                min={1}
                max={26}
                disabled={!form.repeatWeekly}
                value={form.repeatWeeks}
                onChange={(e) => setForm((f) => ({ ...f, repeatWeeks: Number(e.target.value) }))}
                className="w-16"
                style={{ ...inputStyle, padding: "6px 8px", opacity: form.repeatWeekly ? 1 : 0.4 }}
              />
              <span className="text-xs" style={{ color: "rgba(22,48,43,0.5)" }}>
                weeks
              </span>
            </div>
            {error && (
              <p className="col-span-2 text-sm" style={{ color: "#B5566B" }}>
                {error}
              </p>
            )}
            <div className="col-span-2">
              <button
                type="submit"
                disabled={saving}
                className="w-full rounded-full text-white text-sm font-bold px-4 py-2.5 disabled:opacity-50 cursor-pointer hover:scale-[1.02] active:scale-95 transition-transform duration-150"
                style={{ background: "var(--portal-emerald, #2F6D46)", boxShadow: "0 3px 10px rgba(31,111,84,0.3)" }}
              >
                {saving ? "Adding…" : form.repeatWeekly ? `Add to ${form.repeatWeeks} weeks` : "Add time slot to this day"}
              </button>
            </div>
          </form>
        )}
      </div>
    );
  }

  function shiftAnchor(dir: 1 | -1) {
    if (view === "month") setAnchor(new Date(anchor.getFullYear(), anchor.getMonth() + dir, 1));
    else if (view === "week") setAnchor(addDays(anchor, dir * 7));
    else setAnchor(addDays(anchor, dir));
  }

  const headerLabel =
    view === "month"
      ? anchor.toLocaleDateString(undefined, { month: "long", year: "numeric" })
      : view === "week"
        ? `Week of ${startOfWeek(anchor).toLocaleDateString(undefined, { month: "short", day: "numeric" })}`
        : new Date(selectedDate + "T00:00:00").toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });

  return (
    <div>
      <div className="mb-4">
        {!showBulkBlackout ? (
          <button onClick={() => setShowBulkBlackout(true)} className="text-xs font-semibold" style={{ color: "rgba(22,48,43,0.45)" }}>
            Block off a range of days (holidays, closures)
          </button>
        ) : (
          <form onSubmit={handleBulkBlackout} style={{ ...cardStyle, padding: "14px 16px" }} className="flex items-end gap-2.5 flex-wrap">
            <div>
              <label className="block text-xs font-semibold mb-1" style={{ color: "rgba(22,48,43,0.5)" }}>
                From
              </label>
              <input required type="date" value={bulkStart} onChange={(e) => setBulkStart(e.target.value)} style={inputStyle} />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1" style={{ color: "rgba(22,48,43,0.5)" }}>
                Through
              </label>
              <input required type="date" value={bulkEnd} onChange={(e) => setBulkEnd(e.target.value)} style={inputStyle} />
            </div>
            <button type="submit" disabled={bulkSaving} className="text-xs font-bold rounded-full px-4 py-2.5 text-white disabled:opacity-50 cursor-pointer" style={{ background: "#B5566B" }}>
              {bulkSaving ? "Blocking…" : "Block these days"}
            </button>
            <button type="button" onClick={() => setShowBulkBlackout(false)} className="text-xs font-semibold px-2 py-2.5" style={{ color: "rgba(22,48,43,0.45)" }}>
              Cancel
            </button>
          </form>
        )}
      </div>

      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <button onClick={() => shiftAnchor(-1)} className="rounded-full w-8 h-8 text-sm cursor-pointer" style={{ background: "#fff", boxShadow: "0 1px 4px rgba(22,48,43,0.1)" }}>
            ‹
          </button>
          <h2 className="text-sm font-bold min-w-[180px] text-center">{headerLabel}</h2>
          <button onClick={() => shiftAnchor(1)} className="rounded-full w-8 h-8 text-sm cursor-pointer" style={{ background: "#fff", boxShadow: "0 1px 4px rgba(22,48,43,0.1)" }}>
            ›
          </button>
        </div>
        <div className="flex rounded-full overflow-hidden text-xs" style={{ background: "#fff", boxShadow: "0 1px 4px rgba(22,48,43,0.1)" }}>
          {(["month", "week", "day"] as ViewMode[]).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className="px-3.5 py-2 capitalize font-semibold"
              style={{ background: view === v ? "var(--portal-emerald, #2F6D46)" : "transparent", color: view === v ? "#fff" : "rgba(22,48,43,0.5)" }}
            >
              {v}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <p className="text-sm" style={{ color: "rgba(22,48,43,0.4)" }}>
          Loading calendar…
        </p>
      ) : (
        <>
          {view === "month" && renderMonth()}
          {view === "week" && renderWeek()}
          {renderDayDetail()}
        </>
      )}
    </div>
  );
}
