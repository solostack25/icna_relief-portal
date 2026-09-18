"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { logAudit } from "@/lib/orlandoAutomation/audit";
import { useLanguage } from "@/lib/orlandoAutomation/i18n";
import { useAlert } from "@/lib/orlandoAutomation/alert";
import { ORLANDO_OFFICE_ID, ORLANDO_OFFICE_LABEL } from "@/lib/orlandoAutomation/config";

type BookingRow = {
  id: string;
  status: string;
  slot_id: string;
  client_id: string;
  checked_in_at: string | null;
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
  start_time: string;
  end_time: string;
};

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export default function AppointmentsPage() {
  const supabase = createClient();
  const { t } = useLanguage();
  const { showAlert } = useAlert();
  const scanRef = useRef<HTMLInputElement>(null);

  const [date, setDate] = useState(todayISO());
  const [loading, setLoading] = useState(true);
  const [employeeId, setEmployeeId] = useState<string | null>(null);

  const [bookings, setBookings] = useState<BookingRow[]>([]);
  const [clients, setClients] = useState<Map<string, ClientRow>>(new Map());
  const [slots, setSlots] = useState<Map<string, SlotRow>>(new Map());

  const [scanValue, setScanValue] = useState("");
  const [scanSuccess, setScanSuccess] = useState<string | null>(null);

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

  async function loadDay() {
    setLoading(true);

    const { data: slotRows } = await supabase
      .from("pickup_slots")
      .select("id, start_time, end_time")
      .eq("office_id", ORLANDO_OFFICE_ID)
      .eq("slot_date", date)
      .order("start_time");

    const slotIds = (slotRows ?? []).map((s) => s.id);
    const slotMap = new Map((slotRows ?? []).map((s) => [s.id, s]));
    setSlots(slotMap);

    if (slotIds.length === 0) {
      setBookings([]);
      setClients(new Map());
      setLoading(false);
      return;
    }

    const { data: bookingRows } = await supabase
      .from("pickup_bookings")
      .select("id, status, slot_id, client_id, checked_in_at")
      .in("slot_id", slotIds)
      .in("status", ["booked", "completed"]);

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
    loadDay();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date]);

  async function checkIn(bookingId: string) {
    const { error } = await supabase
      .from("pickup_bookings")
      .update({
        status: "completed",
        checked_in_at: new Date().toISOString(),
        checked_in_by: employeeId,
      })
      .eq("id", bookingId)
      .eq("status", "booked"); // guard against double check-in

    if (error) {
      showAlert(error.message, "error");
      return;
    }
    await logAudit(supabase, employeeId, "check_in", "pickup_booking", bookingId, { date });
    loadDay();
  }

  async function undoCheckIn(bookingId: string) {
    const { error } = await supabase
      .from("pickup_bookings")
      .update({
        status: "booked",
        checked_in_at: null,
        checked_in_by: null,
      })
      .eq("id", bookingId)
      .eq("status", "completed"); // only undo a real check-in

    if (error) {
      showAlert(error.message, "error");
      return;
    }
    await logAudit(supabase, employeeId, "undo_check_in", "pickup_booking", bookingId, { date });
    loadDay();
  }

  function exportCSV() {
    const header = ["Time", "Name", "Client Number", "Phone", "Status"];
    const rows = sorted.map((b) => {
      const client = clients.get(b.client_id);
      const slot = slots.get(b.slot_id);
      return [
        slot ? `${slot.start_time.slice(0, 5)}-${slot.end_time.slice(0, 5)}` : "",
        client ? `${client.first_name} ${client.last_name}` : "Unknown",
        client?.client_number ?? "",
        client?.phone ?? "",
        b.status,
      ];
    });

    const csv = [header, ...rows]
      .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
      .join("\n");

    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `appointments-${date}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleScanSubmit(e: React.FormEvent) {
    e.preventDefault();
    setScanSuccess(null);

    const term = scanValue.trim();
    if (!term) return;

    // Try matching an already-listed client by client_number first (fast path, no extra query).
    let matchClientId: string | null = null;
    for (const [id, c] of clients.entries()) {
      if (c.client_number && c.client_number.toLowerCase() === term.toLowerCase()) {
        matchClientId = id;
        break;
      }
    }

    // Fall back to a physical ID card number lookup.
    if (!matchClientId) {
      const { data: card } = await supabase
        .from("client_id_cards")
        .select("client_id")
        .eq("card_number", term)
        .eq("is_active", true)
        .maybeSingle();
      if (card?.client_id) matchClientId = card.client_id;
    }

    if (!matchClientId) {
      showAlert(t("appts.scanNoMatch", { term }), "error");
      setScanValue("");
      scanRef.current?.focus();
      return;
    }

    const booking = bookings.find(
      (b) => b.client_id === matchClientId && b.status === "booked"
    );

    if (!booking) {
      const alreadyDone = bookings.find(
        (b) => b.client_id === matchClientId && b.status === "completed"
      );
      showAlert(
        alreadyDone ? t("appts.alreadyReceivedToday") : t("appts.notOnList"),
        "error"
      );
      setScanValue("");
      scanRef.current?.focus();
      return;
    }

    await checkIn(booking.id);
    const client = clients.get(matchClientId);
    setScanSuccess(
      client
        ? t("appts.checkedIn", { name: `${client.first_name} ${client.last_name}` })
        : t("appts.checkedInGeneric")
    );
    setScanValue("");
    scanRef.current?.focus();
  }

  const sorted = bookings.slice().sort((a, b) => {
    const sa = slots.get(a.slot_id)?.start_time ?? "";
    const sb = slots.get(b.slot_id)?.start_time ?? "";
    if (sa !== sb) return sa.localeCompare(sb);
    const ca = clients.get(a.client_id);
    const cb = clients.get(b.client_id);
    return (ca?.last_name ?? "").localeCompare(cb?.last_name ?? "");
  });

  return (
    <main className="min-h-screen px-4 py-12">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-semibold">{t("appts.title")}</h1>
            <p className="text-sm text-[var(--color-text-dim)]">{t("appts.subtitle")}</p>
          </div>
          <Link
            href="/orlando-automation"
            className="text-sm text-[var(--color-text-dim)] hover:text-[var(--color-text)]"
          >
            {t("common.backHome")}
          </Link>
        </div>

        <div className="flex items-center gap-3 mb-4">
          <input
            aria-label={t("appts.subtitle")}
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="rounded-lg border border-[var(--color-border)] bg-[var(--color-input-bg)] px-3 py-2 text-sm outline-none focus:border-[var(--color-accent)]"
          />
          <button
            onClick={exportCSV}
            disabled={sorted.length === 0}
            className="text-xs font-medium rounded-lg px-3 py-2 border border-[var(--color-border)] text-[var(--color-text-dim)] hover:text-[var(--color-text)] disabled:opacity-40"
          >
            {t("appts.exportCsv")}
          </button>
        </div>

        <form
          onSubmit={handleScanSubmit}
          className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 mb-6"
        >
          <label htmlFor="appt-scan" className="block text-xs mb-1 text-[var(--color-text-dim)]">
            {t("appts.scanLabel")}
          </label>
          <input
            id="appt-scan"
            ref={scanRef}
            autoFocus
            value={scanValue}
            onChange={(e) => setScanValue(e.target.value)}
            placeholder={t("appts.scanPlaceholder")}
            className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-input-bg)] px-3 py-2.5 text-sm outline-none focus:border-[var(--color-accent)]"
          />
          {scanSuccess && <p className="text-[var(--color-accent)] text-xs mt-2">{scanSuccess}</p>}
        </form>

        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] overflow-hidden">
          {loading ? (
            <p className="p-6 text-sm text-[var(--color-text-dim)]">{t("common.loading")}</p>
          ) : sorted.length === 0 ? (
            <p className="p-6 text-sm text-[var(--color-text-dim)]">{t("appts.noAppointments")}</p>
          ) : (
            sorted.map((b) => {
              const client = clients.get(b.client_id);
              const slot = slots.get(b.slot_id);
              const done = b.status === "completed";
              return (
                <div
                  key={b.id}
                  className={[
                    "flex items-center justify-between px-4 py-3 border-b border-[var(--color-border)] last:border-0",
                    done ? "opacity-40" : "",
                  ].join(" ")}
                >
                  <div>
                    <div className={`text-sm font-medium ${done ? "line-through" : ""}`}>
                      {client ? `${client.first_name} ${client.last_name}` : "Unknown client"}
                    </div>
                    <div className="text-xs text-[var(--color-text-dim)]">
                      {slot ? `${slot.start_time.slice(0, 5)}–${slot.end_time.slice(0, 5)} · ` : ""}
                      {client?.client_number}
                      {client?.phone ? ` · ${client.phone}` : ""}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => checkIn(b.id)}
                      disabled={done}
                      className={[
                        "text-xs font-medium rounded-lg px-3 py-2 border",
                        done
                          ? "border-[var(--color-border)] text-[var(--color-text-dim)]"
                          : "border-[var(--color-accent)] text-[var(--color-accent)] hover:bg-[var(--color-input-bg)]",
                      ].join(" ")}
                    >
                      {done ? t("appts.received") : t("appts.markReceived")}
                    </button>
                    {done && (
                      <button
                        onClick={() => undoCheckIn(b.id)}
                        className="text-xs text-red-600 hover:underline"
                      >
                        {t("appts.undo")}
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </main>
  );
}
