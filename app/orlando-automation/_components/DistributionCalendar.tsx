"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { logAudit } from "@/lib/orlandoAutomation/audit";
import { useAlert } from "@/lib/orlandoAutomation/alert";
import { ORLANDO_OFFICE_ID, ORLANDO_OFFICE_LABEL } from "@/lib/orlandoAutomation/config";

type SlotRow = {
  id: string;
  slot_date: string;
  start_time: string;
  end_time: string;
  capacity: number;
  office: string;
  distribution_type: "halal" | "non_halal" | null;
  booked_count: number;
};

type BlackoutRow = {
  id: string;
  blackout_date: string;
  reason: string | null;
};

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

export default function DistributionCalendar({
  editable = false,
}: {
  editable?: boolean;
}) {
  const supabase = createClient();
  const { showAlert } = useAlert();

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

  const [form, setForm] = useState({
    start_time: "09:00",
    end_time: "11:00",
    capacity: 40,
    distribution_type: "halal" as "halal" | "non_halal",
    repeatWeekly: false,
    repeatWeeks: 4,
  });
  const [saving, setSaving] = useState(false);
  const [employeeId, setEmployeeId] = useState<string | null>(null);

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
      const { data: employee } = await supabase
        .from("employees")
        .select("id")
        .eq("auth_user_id", user.id)
        .single();
      setEmployeeId(employee?.id ?? null);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fetch a wide window so switching between month/week/day doesn't refetch constantly.
  const rangeStart = useMemo(() => toISODate(addDays(anchor, -35)), [anchor]);
  const rangeEnd = useMemo(() => toISODate(addDays(anchor, 90)), [anchor]);

  async function loadData() {
    setLoading(true);

    const { data: slotRows } = await supabase
      .from("pickup_slots")
      .select("id, slot_date, start_time, end_time, capacity, office, distribution_type")
      .eq("office_id", ORLANDO_OFFICE_ID)
      .gte("slot_date", rangeStart)
      .lte("slot_date", rangeEnd)
      .order("slot_date")
      .order("start_time");

    const ids = (slotRows ?? []).map((s) => s.id);
    const { data: bookingRows } = ids.length
      ? await supabase.from("pickup_bookings").select("slot_id, status").in("slot_id", ids)
      : { data: [] as { slot_id: string; status: string }[] };

    const countBySlot = new Map<string, number>();
    (bookingRows ?? [])
      .filter((b) => b.status === "booked" || b.status === "completed")
      .forEach((b) => countBySlot.set(b.slot_id, (countBySlot.get(b.slot_id) ?? 0) + 1));

    setSlots(
      (slotRows ?? []).map((s) => ({ ...s, booked_count: countBySlot.get(s.id) ?? 0 }))
    );

    const { data: blackoutRows } = await supabase
      .from("blackout_days")
      .select("id, blackout_date, reason")
      .eq("office_id", ORLANDO_OFFICE_ID)
      .gte("blackout_date", rangeStart)
      .lte("blackout_date", rangeEnd);

    setBlackouts(blackoutRows ?? []);
    setLoading(false);
  }

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rangeStart, rangeEnd]);

  const slotsByDate = useMemo(() => {
    const map = new Map<string, SlotRow[]>();
    for (const s of slots) {
      const list = map.get(s.slot_date) ?? [];
      list.push(s);
      map.set(s.slot_date, list);
    }
    return map;
  }, [slots]);

  const blackoutDates = useMemo(
    () => new Set(blackouts.map((b) => b.blackout_date)),
    [blackouts]
  );

  async function toggleBlackout(dateISO: string) {
    const existing = blackouts.find((b) => b.blackout_date === dateISO);
    if (existing) {
      await supabase.from("blackout_days").delete().eq("id", existing.id);
      await logAudit(supabase, employeeId, "remove_blackout", "blackout_day", existing.id, {
        date: dateISO,
      });
    } else {
      const { data } = await supabase
        .from("blackout_days")
        .insert({
          office: ORLANDO_OFFICE_LABEL,
          office_id: ORLANDO_OFFICE_ID,
          blackout_date: dateISO,
          reason: "Set from distribution calendar",
          created_by: employeeId,
        })
        .select("id")
        .single();
      await logAudit(supabase, employeeId, "add_blackout", "blackout_day", data?.id ?? null, {
        date: dateISO,
      });
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
    for (let d = start; d <= end; d = addDays(d, 1)) {
      dates.push(toISODate(d));
    }

    const existingDates = new Set(blackouts.map((b) => b.blackout_date));
    const toInsert = dates
      .filter((d) => !existingDates.has(d))
      .map((d) => ({
        office: ORLANDO_OFFICE_LABEL,
        office_id: ORLANDO_OFFICE_ID,
        blackout_date: d,
        reason: "Bulk blackout",
        created_by: employeeId,
      }));

    if (toInsert.length > 0) {
      await supabase.from("blackout_days").insert(toInsert);
      await logAudit(supabase, employeeId, "bulk_add_blackout", "blackout_day", null, {
        start: bulkStart,
        end: bulkEnd,
        count: toInsert.length,
      });
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

    // Build the list of dates to create this slot on — just the selected day,
    // or the selected day plus N following weeks on the same weekday, skipping
    // any that are already marked as a blackout.
    const dates: string[] = [selectedDate];
    if (form.repeatWeekly) {
      const base = new Date(selectedDate + "T00:00:00");
      for (let i = 1; i < form.repeatWeeks; i++) {
        dates.push(toISODate(addDays(base, i * 7)));
      }
    }

    const blackoutSet = blackoutDates;
    const rows = dates
      .filter((d) => !blackoutSet.has(d))
      .map((d) => ({
        office: ORLANDO_OFFICE_LABEL,
        office_id: ORLANDO_OFFICE_ID,
        slot_date: d,
        start_time: form.start_time,
        end_time: form.end_time,
        capacity: form.capacity,
        distribution_type: form.distribution_type,
      }));

    const { error: insertError } = await supabase.from("pickup_slots").insert(rows);

    setSaving(false);
    if (insertError) {
      showAlert(insertError.message, "error");
      return;
    }
    await logAudit(supabase, employeeId, "add_slot", "pickup_slot", null, {
      dates,
      start_time: form.start_time,
      end_time: form.end_time,
      capacity: form.capacity,
      distribution_type: form.distribution_type,
    });
    loadData();
  }

  async function handleDeleteSlot(id: string) {
    await supabase.from("pickup_slots").delete().eq("id", id);
    await logAudit(supabase, employeeId, "delete_slot", "pickup_slot", id);
    loadData();
  }

  const inputClass =
    "w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-input-bg)] px-3 py-2 text-sm outline-none focus:border-[var(--color-accent)]";
  const labelClass = "block text-xs mb-1 text-[var(--color-text-dim)]";

  // ---------- Month view ----------
  function renderMonth() {
    const year = anchor.getFullYear();
    const month = anchor.getMonth();
    const firstOfMonth = new Date(year, month, 1);
    const gridStart = startOfWeek(firstOfMonth);
    const days: Date[] = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));

    return (
      <div>
        <div className="grid grid-cols-7 text-xs text-[var(--color-text-dim)] mb-1">
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
            <div key={d} className="text-center py-1">
              {d}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
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
                className={[
                  "aspect-square rounded-lg border p-1.5 text-left flex flex-col justify-between",
                  inMonth ? "bg-[var(--color-surface)]" : "bg-transparent opacity-40",
                  isSelected
                    ? "border-[var(--color-accent)] ring-1 ring-[var(--color-accent)]"
                    : "border-[var(--color-border)]",
                  isBlackout ? "bg-red-50 dark:bg-red-950/40" : "",
                ].join(" ")}
              >
                <span
                  className={[
                    "text-xs",
                    isToday ? "font-semibold text-[var(--color-accent)]" : "text-[var(--color-text-dim)]",
                  ].join(" ")}
                >
                  {d.getDate()}
                </span>
                {isBlackout ? (
                  <span className="text-[10px] text-red-600 font-medium">Blackout</span>
                ) : daySlots.length > 0 ? (
                  <span className="text-[10px] text-[var(--color-accent)]">
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

  // ---------- Week view ----------
  function renderWeek() {
    const start = startOfWeek(anchor);
    const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));

    return (
      <div className="grid grid-cols-7 gap-1">
        {days.map((d) => {
          const iso = toISODate(d);
          const daySlots = slotsByDate.get(iso) ?? [];
          const isBlackout = blackoutDates.has(iso);
          const isSelected = iso === selectedDate;

          return (
            <button
              key={iso}
              onClick={() => setSelectedDate(iso)}
              className={[
                "rounded-lg border p-2 text-left min-h-[110px]",
                isSelected
                  ? "border-[var(--color-accent)] ring-1 ring-[var(--color-accent)]"
                  : "border-[var(--color-border)]",
                isBlackout ? "bg-red-50 dark:bg-red-950/40" : "bg-[var(--color-surface)]",
              ].join(" ")}
            >
              <div className="text-xs text-[var(--color-text-dim)] mb-1">
                {d.toLocaleDateString(undefined, { weekday: "short", day: "numeric" })}
              </div>
              {isBlackout && <div className="text-[10px] text-red-600 font-medium mb-1">Blackout</div>}
              {daySlots.map((s) => (
                <div key={s.id} className="text-[10px] text-[var(--color-text)] mb-0.5">
                  {s.distribution_type === "halal" ? "🟢" : s.distribution_type === "non_halal" ? "🟠" : ""}{" "}
                  {s.start_time.slice(0, 5)} · {s.booked_count}/{s.capacity}
                </div>
              ))}
            </button>
          );
        })}
      </div>
    );
  }

  // ---------- Day detail panel (shared by all views) ----------
  function renderDayDetail() {
    const daySlots = (slotsByDate.get(selectedDate) ?? []).slice();
    const isBlackout = blackoutDates.has(selectedDate);
    const dateLabel = new Date(selectedDate + "T00:00:00").toLocaleDateString(undefined, {
      weekday: "long",
      month: "long",
      day: "numeric",
    });

    return (
      <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 mt-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold">{dateLabel}</h3>
          {editable && (
            <button
              onClick={() => toggleBlackout(selectedDate)}
              className={[
                "text-xs font-medium rounded-lg px-3 py-1.5 border",
                isBlackout
                  ? "border-red-300 dark:border-red-900 text-red-700 bg-red-50 dark:bg-red-950/40"
                  : "border-[var(--color-border)] text-[var(--color-text-dim)] hover:border-red-300 dark:border-red-900 hover:text-red-700",
              ].join(" ")}
            >
              {isBlackout ? "Remove blackout" : "Mark as blackout day"}
            </button>
          )}
        </div>

        {isBlackout && (
          <p className="text-xs text-red-600 mb-3">
            No pickup times will be offered to clients on this day.
          </p>
        )}

        {daySlots.length === 0 ? (
          <p className="text-sm text-[var(--color-text-dim)] mb-3">No time slots set for this day.</p>
        ) : (
          <div className="space-y-1 mb-4">
            {daySlots.map((s) => (
              <div
                key={s.id}
                className="flex items-center justify-between text-sm bg-[var(--color-input-bg)] rounded-lg border border-[var(--color-border)] px-3 py-2"
              >
                <Link href={`/orlando-automation/slots/${s.id}`} className="hover:underline flex items-center gap-2">
                  {s.start_time.slice(0, 5)}–{s.end_time.slice(0, 5)} · {s.booked_count}/{s.capacity} booked
                  {s.distribution_type && (
                    <span
                      className={[
                        "rounded-full text-[10px] font-medium px-2 py-0.5",
                        s.distribution_type === "halal"
                          ? "bg-[var(--badge-green-bg)] text-[var(--badge-green-fg)]"
                          : "bg-[var(--badge-amber-bg)] text-[var(--badge-amber-fg)]",
                      ].join(" ")}
                    >
                      {s.distribution_type === "halal" ? "Halal" : "Non-Halal"}
                    </span>
                  )}
                </Link>
                {editable && (
                  <button
                    onClick={() => handleDeleteSlot(s.id)}
                    className="text-xs text-red-600 hover:underline"
                  >
                    Remove
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        {editable && !isBlackout && (
          <form onSubmit={handleAddSlot} className="grid grid-cols-3 gap-2 items-end">
            <div>
              <label htmlFor="dc-start" className={labelClass}>Start</label>
              <input
                id="dc-start"
                required
                type="time"
                value={form.start_time}
                onChange={(e) => setForm((f) => ({ ...f, start_time: e.target.value }))}
                className={inputClass}
              />
            </div>
            <div>
              <label htmlFor="dc-end" className={labelClass}>End</label>
              <input
                id="dc-end"
                required
                type="time"
                value={form.end_time}
                onChange={(e) => setForm((f) => ({ ...f, end_time: e.target.value }))}
                className={inputClass}
              />
            </div>
            <div>
              <label htmlFor="dc-capacity" className={labelClass}>Capacity</label>
              <input
                id="dc-capacity"
                required
                type="number"
                min={1}
                value={form.capacity}
                onChange={(e) => setForm((f) => ({ ...f, capacity: Number(e.target.value) }))}
                className={inputClass}
              />
            </div>
            <div>
              <label htmlFor="dc-type" className={labelClass}>Distribution type</label>
              <select
                id="dc-type"
                required
                value={form.distribution_type}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    distribution_type: e.target.value as "halal" | "non_halal",
                  }))
                }
                className={inputClass}
              >
                <option value="halal">Halal</option>
                <option value="non_halal">Non-Halal</option>
              </select>
            </div>
            <div className="col-span-3 flex items-center gap-3">
              <label className="flex items-center gap-2 text-xs text-[var(--color-text-dim)]">
                <input
                  type="checkbox"
                  checked={form.repeatWeekly}
                  onChange={(e) => setForm((f) => ({ ...f, repeatWeekly: e.target.checked }))}
                  className="accent-[var(--color-accent)]"
                />
                Repeat weekly for
              </label>
              <input
                type="number"
                min={1}
                max={26}
                disabled={!form.repeatWeekly}
                value={form.repeatWeeks}
                onChange={(e) => setForm((f) => ({ ...f, repeatWeeks: Number(e.target.value) }))}
                className="w-16 rounded-lg border border-[var(--color-border)] bg-[var(--color-input-bg)] px-2 py-1 text-xs outline-none focus:border-[var(--color-accent)] disabled:opacity-40"
              />
              <span className="text-xs text-[var(--color-text-dim)]">weeks</span>
            </div>
            <div className="col-span-3">
              <button
                type="submit"
                disabled={saving}
                className="w-full rounded-lg bg-[var(--color-accent-solid)] text-white text-sm font-medium px-4 py-2 disabled:opacity-50"
              >
                {saving
                  ? "Adding..."
                  : form.repeatWeekly
                    ? `Add this time slot to ${form.repeatWeeks} weeks`
                    : "Add time slot to this day"}
              </button>
            </div>
          </form>
        )}
      </div>
    );
  }

  function shiftAnchor(dir: 1 | -1) {
    if (view === "month") {
      setAnchor(new Date(anchor.getFullYear(), anchor.getMonth() + dir, 1));
    } else if (view === "week") {
      setAnchor(addDays(anchor, dir * 7));
    } else {
      setAnchor(addDays(anchor, dir));
    }
  }

  const headerLabel =
    view === "month"
      ? anchor.toLocaleDateString(undefined, { month: "long", year: "numeric" })
      : view === "week"
        ? `Week of ${startOfWeek(anchor).toLocaleDateString(undefined, { month: "short", day: "numeric" })}`
        : new Date(selectedDate + "T00:00:00").toLocaleDateString(undefined, {
            weekday: "long",
            month: "long",
            day: "numeric",
          });

  return (
    <div>
      {editable && (
        <div className="mb-4">
          {!showBulkBlackout ? (
            <button
              onClick={() => setShowBulkBlackout(true)}
              className="text-xs text-[var(--color-text-dim)] hover:text-red-600"
            >
              Block off a range of days (holidays, closures)
            </button>
          ) : (
            <form
              onSubmit={handleBulkBlackout}
              className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-3 flex items-end gap-2 flex-wrap"
            >
              <div>
                <label htmlFor="dc-bulk-from" className={labelClass}>From</label>
                <input
                  id="dc-bulk-from"
                  required
                  type="date"
                  value={bulkStart}
                  onChange={(e) => setBulkStart(e.target.value)}
                  className={inputClass}
                />
              </div>
              <div>
                <label htmlFor="dc-bulk-through" className={labelClass}>Through</label>
                <input
                  id="dc-bulk-through"
                  required
                  type="date"
                  value={bulkEnd}
                  onChange={(e) => setBulkEnd(e.target.value)}
                  className={inputClass}
                />
              </div>
              <button
                type="submit"
                disabled={bulkSaving}
                className="text-xs font-medium rounded-lg px-3 py-2 bg-red-600 text-white disabled:opacity-50"
              >
                {bulkSaving ? "Blocking…" : "Block these days"}
              </button>
              <button
                type="button"
                onClick={() => setShowBulkBlackout(false)}
                className="text-xs text-[var(--color-text-dim)] px-2 py-2"
              >
                Cancel
              </button>
            </form>
          )}
        </div>
      )}

      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <button
            onClick={() => shiftAnchor(-1)}
            className="rounded-lg border border-[var(--color-border)] w-8 h-8 text-sm hover:bg-[var(--color-input-bg)]"
          >
            ‹
          </button>
          <h2 className="text-sm font-medium min-w-[180px] text-center">{headerLabel}</h2>
          <button
            onClick={() => shiftAnchor(1)}
            className="rounded-lg border border-[var(--color-border)] w-8 h-8 text-sm hover:bg-[var(--color-input-bg)]"
          >
            ›
          </button>
        </div>

        <div className="flex rounded-lg border border-[var(--color-border)] overflow-hidden text-xs">
          {(["month", "week", "day"] as ViewMode[]).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={[
                "px-3 py-1.5 capitalize",
                view === v ? "bg-[var(--color-accent-solid)] text-white" : "bg-[var(--color-input-bg)] hover:bg-[var(--color-surface)]",
              ].join(" ")}
            >
              {v}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-[var(--color-text-dim)]">Loading calendar…</p>
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
