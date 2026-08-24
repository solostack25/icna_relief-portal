"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Booking = { id: string; status: string; slot_id: string; booked_at: string; checked_in_at: string | null };
type Slot = { id: string; slot_date: string; start_time: string; end_time: string };
type AvailableSlot = Slot & { capacity: number; booked_count: number };

const statusColor: Record<string, string> = {
  booked: "text-[var(--color-accent)]",
  completed: "text-[var(--color-accent)]",
  missed: "text-amber-600",
  expired: "text-red-600",
  cancelled: "text-[var(--color-text-dim)]",
};

// Ported from Houston_Automation's ClientPickups.tsx, generalized to
// any office via clientOfficeId (was hardcoded to a single office
// there) - client-side filtered to that office's slots since a client
// only picks up from their own assigned office.
export default function HungerPreventionBookings({ clientId, clientOfficeId }: { clientId: string; clientOfficeId: string | null }) {
  const supabase = createClient();

  const [bookings, setBookings] = useState<Booking[]>([]);
  const [slots, setSlots] = useState<Map<string, Slot>>(new Map());
  const [loading, setLoading] = useState(true);
  const [employeeId, setEmployeeId] = useState<string | null>(null);

  const [showBooker, setShowBooker] = useState(false);
  const [availableSlots, setAvailableSlots] = useState<AvailableSlot[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [booking, setBooking] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState<string | null>(null);
  const [confirmingCancel, setConfirmingCancel] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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

  async function loadBookings() {
    setLoading(true);
    const { data: bookingRows } = await supabase
      .from("pickup_bookings")
      .select("id, status, slot_id, booked_at, checked_in_at")
      .eq("client_id", clientId)
      .order("booked_at", { ascending: false });

    const slotIds = (bookingRows ?? []).map((b) => b.slot_id);
    const { data: slotRows } = slotIds.length
      ? await supabase.from("pickup_slots").select("id, slot_date, start_time, end_time").in("id", slotIds)
      : { data: [] as Slot[] };

    setBookings(bookingRows ?? []);
    setSlots(new Map((slotRows ?? []).map((s) => [s.id, s])));
    setLoading(false);
  }

  useEffect(() => {
    loadBookings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId]);

  async function loadAvailableSlots() {
    if (!clientOfficeId) return;
    setLoadingSlots(true);
    const today = new Date().toISOString().slice(0, 10);

    const { data: slotRows } = await supabase
      .from("pickup_slots")
      .select("id, slot_date, start_time, end_time, capacity")
      .eq("office_id", clientOfficeId)
      .gte("slot_date", today)
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

    setAvailableSlots((slotRows ?? []).map((s) => ({ ...s, booked_count: countBySlot.get(s.id) ?? 0 })));
    setLoadingSlots(false);
  }

  function openBooker() {
    setShowBooker(true);
    loadAvailableSlots();
  }

  async function handleBook(slotId: string) {
    setBooking(slotId);
    setError(null);

    const slot = availableSlots.find((s) => s.id === slotId);
    const graceEnds = slot
      ? new Date(new Date(slot.slot_date + "T00:00:00").getTime() + 3 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
      : null;

    const { error: insertError } = await supabase.from("pickup_bookings").insert({
      client_id: clientId,
      slot_id: slotId,
      status: "booked",
      grace_period_ends: graceEnds,
    });

    setBooking(null);
    if (insertError) {
      setError(insertError.message);
      return;
    }
    setShowBooker(false);
    loadBookings();
  }

  async function handleCancel(bookingId: string) {
    setCancelling(bookingId);
    setConfirmingCancel(null);
    await supabase.from("pickup_bookings").update({ status: "cancelled" }).eq("id", bookingId);
    setCancelling(null);
    loadBookings();
  }

  const hasBookingThisMonth = bookings.some((b) => {
    if (b.status !== "booked" && b.status !== "completed") return false;
    const slot = slots.get(b.slot_id);
    if (!slot) return false;
    const now = new Date();
    const slotDate = new Date(slot.slot_date + "T00:00:00");
    return slotDate.getMonth() === now.getMonth() && slotDate.getFullYear() === now.getFullYear();
  });

  const availByDate = new Map<string, AvailableSlot[]>();
  for (const s of availableSlots) {
    const list = availByDate.get(s.slot_date) ?? [];
    list.push(s);
    availByDate.set(s.slot_date, list);
  }

  return (
    <section className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] overflow-hidden mb-6">
      <div className="flex items-center justify-between px-6 pt-6 pb-4">
        <h2 className="text-sm font-medium">Hunger Prevention Pickups</h2>
        {clientOfficeId ? (
          <button
            onClick={showBooker ? () => setShowBooker(false) : openBooker}
            className="text-xs font-medium rounded-lg px-3 py-1.5 border border-[var(--color-accent)] text-[var(--color-accent)] hover:bg-[var(--color-input-bg)]"
          >
            {showBooker ? "Cancel" : "Book Pickup"}
          </button>
        ) : (
          <span className="text-xs text-[var(--color-text-dim)]">No office on file</span>
        )}
      </div>

      {showBooker && (
        <div className="mx-6 mb-4 rounded-lg border border-[var(--color-border)] bg-[var(--color-input-bg)] p-4">
          {hasBookingThisMonth && (
            <p className="text-xs text-amber-700 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 rounded-lg px-3 py-2 mb-3">
              This client already has a booking this month.
            </p>
          )}
          {error && <p className="text-xs text-red-600 mb-3">{error}</p>}
          {loadingSlots ? (
            <p className="text-xs text-[var(--color-text-dim)]">Loading available times…</p>
          ) : availByDate.size === 0 ? (
            <p className="text-xs text-[var(--color-text-dim)]">No upcoming slots for this client&apos;s office.</p>
          ) : (
            <div className="space-y-3 max-h-80 overflow-y-auto">
              {Array.from(availByDate.entries()).map(([date, daySlots]) => (
                <div key={date}>
                  <div className="text-xs font-medium text-[var(--color-text-dim)] mb-1">
                    {new Date(date + "T00:00:00").toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}
                  </div>
                  <div className="space-y-1">
                    {daySlots.map((s) => {
                      const remaining = s.capacity - s.booked_count;
                      return (
                        <button
                          key={s.id}
                          onClick={() => handleBook(s.id)}
                          disabled={booking === s.id}
                          className="w-full flex items-center justify-between rounded-lg border border-[var(--color-border)] px-3 py-2 text-xs hover:border-[var(--color-accent)] disabled:opacity-50"
                        >
                          <span>
                            {s.start_time.slice(0, 5)}–{s.end_time.slice(0, 5)}
                          </span>
                          <span className={remaining <= 0 ? "text-red-600" : "text-[var(--color-text-dim)]"}>
                            {booking === s.id ? "Booking…" : remaining <= 0 ? "Full" : `${remaining} spots left`}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {loading ? (
        <p className="px-6 pb-6 text-sm text-[var(--color-text-dim)]">Loading…</p>
      ) : bookings.length === 0 ? (
        <p className="px-6 pb-6 text-sm text-[var(--color-text-dim)]">No pickup bookings yet.</p>
      ) : (
        <div>
          {bookings.map((b) => {
            const slot = slots.get(b.slot_id);
            const confirming = confirmingCancel === b.id;
            return (
              <div key={b.id} className="px-6 py-3 border-t border-[var(--color-border)]">
                <div className="flex items-center justify-between">
                  <div className="text-sm">
                    {slot ? `${slot.slot_date} · ${slot.start_time.slice(0, 5)}–${slot.end_time.slice(0, 5)}` : "Unknown slot"}
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`text-xs font-medium ${statusColor[b.status] ?? ""}`}>{b.status}</span>
                    {b.status === "booked" && !confirming && (
                      <button onClick={() => setConfirmingCancel(b.id)} className="text-xs text-red-600 hover:underline">
                        Cancel
                      </button>
                    )}
                  </div>
                </div>
                {confirming && (
                  <div className="mt-2 flex items-center gap-2 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 px-3 py-2">
                    <span className="text-xs text-red-700 flex-1">Cancel this pickup booking?</span>
                    <button
                      onClick={() => handleCancel(b.id)}
                      disabled={cancelling === b.id}
                      className="text-xs font-medium rounded-lg px-2.5 py-1 bg-red-600 text-white disabled:opacity-50"
                    >
                      {cancelling === b.id ? "Cancelling…" : "Yes, cancel"}
                    </button>
                    <button
                      onClick={() => setConfirmingCancel(null)}
                      className="text-xs font-medium rounded-lg px-2.5 py-1 border border-[var(--color-border)]"
                    >
                      Never mind
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
