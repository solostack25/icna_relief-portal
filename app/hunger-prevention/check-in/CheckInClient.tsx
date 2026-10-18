"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { logAudit } from "@/lib/hungerPrevention/audit";
import { foodTotals, pricePackage, HP_FOOD_CATEGORIES } from "@/lib/bulkDistributions";
import FoodFields, { foodInputFrom, useFoodPrices, type FoodInput } from "@/components/bulk/FoodFields";

type BookingRow = { id: string; status: string; slot_id: string; client_id: string; checked_in_at: string | null };
type ClientRow = { id: string; first_name: string; last_name: string; client_number: string | null; phone: string | null };
type SlotRow = { id: string; start_time: string; end_time: string };

const cardStyle: React.CSSProperties = { background: "#fff", borderRadius: 24, boxShadow: "0 3px 12px rgba(22,48,43,0.06)" };
const inputStyle: React.CSSProperties = {
  border: "1.5px solid var(--portal-line, rgba(22,48,43,0.12))",
  borderRadius: 10,
  padding: "10px 14px",
  fontSize: 14,
  background: "#fff",
  outline: "none",
};

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export default function CheckInClient({ officeId }: { officeId: string }) {
  const supabase = createClient();
  const scanRef = useRef<HTMLInputElement>(null);

  const [date, setDate] = useState(todayISO());
  const [loading, setLoading] = useState(true);
  const [employeeId, setEmployeeId] = useState<string | null>(null);

  const [bookings, setBookings] = useState<BookingRow[]>([]);
  const [clients, setClients] = useState<Map<string, ClientRow>>(new Map());
  const [slots, setSlots] = useState<Map<string, SlotRow>>(new Map());

  const [scanValue, setScanValue] = useState("");
  const [scanMsg, setScanMsg] = useState<{ text: string; ok: boolean } | null>(null);

  // Today's food package: what each pickup household receives. Completing
  // a pickup records it on the client (hp_food_distributions); undo removes it.
  const { prices } = useFoodPrices();
  const [pkg, setPkg] = useState<FoodInput>({});
  const [pkgSaved, setPkgSaved] = useState<Partial<Record<string, { qty: number }>> | null>(null);
  const [editingPkg, setEditingPkg] = useState(false);
  const [pkgSaving, setPkgSaving] = useState(false);
  const [recorded, setRecorded] = useState<Set<string>>(new Set());
  const [applying, setApplying] = useState(false);

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

  async function loadPackage() {
    const { data } = await supabase
      .from("hp_daily_packages")
      .select("food")
      .eq("office_id", officeId)
      .eq("package_date", date)
      .maybeSingle();
    const food = (data?.food ?? null) as Partial<Record<string, { qty: number }>> | null;
    const hasAny = !!food && Object.values(food).some((f) => Number(f?.qty) > 0);
    setPkgSaved(hasAny ? food : null);
    setPkg(foodInputFrom(food));
    setEditingPkg(!hasAny);
  }

  async function loadDay() {
    setLoading(true);
    loadPackage();

    const { data: slotRows } = await supabase
      .from("pickup_slots")
      .select("id, start_time, end_time")
      .eq("office_id", officeId)
      .eq("slot_date", date)
      .order("start_time");

    const slotIds = (slotRows ?? []).map((s) => s.id);
    setSlots(new Map((slotRows ?? []).map((s) => [s.id, s])));

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
      ? await supabase.from("clients").select("id, first_name, last_name, client_number, phone").in("id", clientIds)
      : { data: [] as ClientRow[] };

    const bookingIds = (bookingRows ?? []).map((b) => b.id);
    const { data: foodRows } = bookingIds.length
      ? await supabase.from("hp_food_distributions").select("source_id").in("source_id", bookingIds)
      : { data: [] as { source_id: string }[] };
    setRecorded(new Set((foodRows ?? []).map((r) => r.source_id)));

    setBookings(bookingRows ?? []);
    setClients(new Map((clientRows ?? []).map((c) => [c.id, c])));
    setLoading(false);
  }

  useEffect(() => {
    loadDay();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, officeId]);

  async function checkIn(bookingId: string) {
    const { error } = await supabase
      .from("pickup_bookings")
      .update({ status: "completed", checked_in_at: new Date().toISOString(), checked_in_by: employeeId })
      .eq("id", bookingId)
      .eq("status", "booked");
    if (error) {
      setScanMsg({ text: error.message, ok: false });
      return;
    }
    await logAudit(supabase, employeeId, "check_in", "pickup_booking", bookingId, { date });
    await recordPackage(bookingId);
    loadDay();
  }

  async function recordPackage(bookingId: string, pkgFood = pkgSaved) {
    if (!pkgFood) return;
    const booking = bookings.find((b) => b.id === bookingId);
    if (!booking) return;
    const food = pricePackage(pkgFood, prices);
    if (Object.keys(food).length === 0) return;
    const totals = foodTotals(food);
    const { data: client } = await supabase.from("clients").select("household_key").eq("id", booking.client_id).maybeSingle();
    let individuals = 1;
    if (client?.household_key) {
      const { count } = await supabase
        .from("clients")
        .select("id", { count: "exact", head: true })
        .eq("household_key", client.household_key);
      individuals = Math.max(1, count ?? 1);
    }
    await supabase.from("hp_food_distributions").upsert(
      {
        client_id: booking.client_id,
        office_id: officeId,
        distributed_on: date,
        individuals_served: individuals,
        food,
        total_lbs: totals.lbs,
        total_value: totals.value,
        source: "pickup",
        source_id: bookingId,
        created_by: employeeId,
      },
      { onConflict: "source_id", ignoreDuplicates: true }
    );
  }

  async function savePackage() {
    setPkgSaving(true);
    const food: Record<string, { qty: number }> = {};
    for (const c of HP_FOOD_CATEGORIES) {
      const q = Number(pkg[c.key]?.qty || 0);
      const v = Number(pkg[c.key]?.value || 0);
      if (q > 0) food[c.key] = prices[c.key] != null ? { qty: q } : ({ qty: q, value: v } as { qty: number });
    }
    const { error } = await supabase.from("hp_daily_packages").upsert({
      office_id: officeId,
      package_date: date,
      food,
      updated_by: employeeId,
      updated_at: new Date().toISOString(),
    });
    setPkgSaving(false);
    if (error) return setScanMsg({ text: error.message, ok: false });
    const hasAny = Object.keys(food).length > 0;
    setPkgSaved(hasAny ? food : null);
    setEditingPkg(!hasAny);
  }

  async function applyToEarlier() {
    if (!pkgSaved) return;
    setApplying(true);
    for (const b of bookings.filter((x) => x.status === "completed" && !recorded.has(x.id))) {
      await recordPackage(b.id, pkgSaved);
    }
    setApplying(false);
    loadDay();
  }

  async function undoCheckIn(bookingId: string) {
    await supabase.from("pickup_bookings").update({ status: "booked", checked_in_at: null, checked_in_by: null }).eq("id", bookingId).eq("status", "completed");
    await supabase.from("hp_food_distributions").delete().eq("source_id", bookingId).eq("source", "pickup");
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
    const csv = [header, ...rows].map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `checkin-${date}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleScanSubmit(e: React.FormEvent) {
    e.preventDefault();
    setScanMsg(null);
    const term = scanValue.trim();
    if (!term) return;

    let matchClientId: string | null = null;
    for (const [id, c] of clients.entries()) {
      if (c.client_number && c.client_number.toLowerCase() === term.toLowerCase()) {
        matchClientId = id;
        break;
      }
    }

    if (!matchClientId) {
      const { data: card } = await supabase.from("client_id_cards").select("client_id").eq("card_number", term).eq("is_active", true).maybeSingle();
      if (card?.client_id) matchClientId = card.client_id;
    }

    if (!matchClientId) {
      setScanMsg({ text: `No client found matching "${term}".`, ok: false });
      setScanValue("");
      scanRef.current?.focus();
      return;
    }

    const booking = bookings.find((b) => b.client_id === matchClientId && b.status === "booked");
    if (!booking) {
      const alreadyDone = bookings.find((b) => b.client_id === matchClientId && b.status === "completed");
      setScanMsg({ text: alreadyDone ? "Already checked in today." : "Not on today's list.", ok: false });
      setScanValue("");
      scanRef.current?.focus();
      return;
    }

    await checkIn(booking.id);
    const client = clients.get(matchClientId);
    setScanMsg({ text: `Checked in: ${client ? `${client.first_name} ${client.last_name}` : "client"}`, ok: true });
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
    <div>
      <div className="flex items-center gap-3 mb-4">
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={inputStyle} />
        <button
          onClick={exportCSV}
          disabled={sorted.length === 0}
          className="text-xs font-bold rounded-full px-4 py-2.5 disabled:opacity-40 cursor-pointer"
          style={{ background: "#F4F3EE", color: "rgba(22,48,43,0.6)" }}
        >
          Export CSV
        </button>
      </div>

      {(() => {
        const pkgFood = pricePackage(pkgSaved, prices);
        const t = foodTotals(pkgFood);
        const missing = bookings.filter((b) => b.status === "completed" && !recorded.has(b.id)).length;
        return (
          <div style={{ ...cardStyle, padding: "18px 20px", marginBottom: 16 }}>
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-xs font-bold" style={{ color: "rgba(22,48,43,0.5)" }}>
                  Food package for {date === todayISO() ? "today" : date}
                </div>
                {pkgSaved && !editingPkg ? (
                  <div className="text-sm mt-1">
                    {HP_FOOD_CATEGORIES.filter((c) => pkgFood[c.key])
                      .map((c) => `${pkgFood[c.key]!.qty} ${c.unit === "lbs" ? "lb" : c.unit} ${c.label.toLowerCase()}`)
                      .join(" · ")}
                    <span style={{ color: "rgba(22,48,43,0.5)" }}>
                      {" "}= {t.lbs} lbs · ${t.value.toFixed(2)} per household
                    </span>
                  </div>
                ) : (
                  <div className="text-xs mt-1" style={{ color: "#A57420" }}>
                    Set what each household gets — every pickup you mark received is recorded with this food.
                  </div>
                )}
              </div>
              {pkgSaved && !editingPkg && (
                <button onClick={() => setEditingPkg(true)} className="text-xs font-semibold" style={{ color: "var(--portal-emerald, #2F6D46)" }}>
                  Edit
                </button>
              )}
            </div>
            {editingPkg && (
              <div className="mt-3 space-y-3">
                <FoodFields value={pkg} onChange={setPkg} prices={prices} />
                <div className="flex gap-2">
                  <button
                    onClick={savePackage}
                    disabled={pkgSaving}
                    className="text-xs font-bold rounded-full px-4 py-2 disabled:opacity-50"
                    style={{ background: "var(--portal-emerald, #2F6D46)", color: "#fff" }}
                  >
                    {pkgSaving ? "Saving…" : "Save package"}
                  </button>
                  {pkgSaved && (
                    <button onClick={() => { setPkg(foodInputFrom(pkgSaved)); setEditingPkg(false); }} className="text-xs font-semibold" style={{ color: "rgba(22,48,43,0.5)" }}>
                      Cancel
                    </button>
                  )}
                </div>
                <p className="text-[11px]" style={{ color: "rgba(22,48,43,0.45)" }}>
                  Changing the package only affects pickups received after you save. A household that got something different can be
                  adjusted on the client&apos;s profile.
                </p>
              </div>
            )}
            {pkgSaved && missing > 0 && (
              <button
                onClick={applyToEarlier}
                disabled={applying}
                className="mt-3 text-xs font-semibold underline disabled:opacity-50"
                style={{ color: "#A57420" }}
              >
                {applying ? "Recording…" : `Record this package for ${missing} pickup${missing === 1 ? "" : "s"} already received without food`}
              </button>
            )}
          </div>
        );
      })()}

      <form onSubmit={handleScanSubmit} style={{ ...cardStyle, padding: "18px 20px", marginBottom: 24 }}>
        <label className="block text-xs font-bold mb-1.5" style={{ color: "rgba(22,48,43,0.5)" }}>
          Scan ID card or type client number
        </label>
        <input
          ref={scanRef}
          autoFocus
          value={scanValue}
          onChange={(e) => setScanValue(e.target.value)}
          placeholder="Scan or type…"
          className="w-full"
          style={{ ...inputStyle, fontSize: 16 }}
        />
        {scanMsg && (
          <p className="text-xs mt-2 font-semibold" style={{ color: scanMsg.ok ? "var(--portal-emerald, #2F6D46)" : "#B5566B" }}>
            {scanMsg.text}
          </p>
        )}
      </form>

      <div style={{ ...cardStyle, overflow: "hidden" }}>
        {loading ? (
          <p className="p-6 text-sm" style={{ color: "rgba(22,48,43,0.4)" }}>
            Loading…
          </p>
        ) : sorted.length === 0 ? (
          <p className="p-6 text-sm" style={{ color: "rgba(22,48,43,0.4)" }}>
            No appointments for this date.
          </p>
        ) : (
          sorted.map((b, i) => {
            const client = clients.get(b.client_id);
            const slot = slots.get(b.slot_id);
            const done = b.status === "completed";
            return (
              <div
                key={b.id}
                className="flex items-center justify-between px-5 py-3.5"
                style={{ borderTop: i === 0 ? "none" : "1px solid var(--portal-line, rgba(22,48,43,0.06))", opacity: done ? 0.55 : 1 }}
              >
                <div>
                  <div className="text-sm font-bold" style={{ textDecoration: done ? "line-through" : "none" }}>
                    {client ? `${client.first_name} ${client.last_name}` : "Unknown client"}
                  </div>
                  <div className="text-xs" style={{ color: "rgba(22,48,43,0.45)" }}>
                    {slot ? `${slot.start_time.slice(0, 5)}–${slot.end_time.slice(0, 5)} · ` : ""}
                    {client?.client_number}
                    {client?.phone ? ` · ${client.phone}` : ""}
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button
                    onClick={() => checkIn(b.id)}
                    disabled={done}
                    className="text-xs font-bold rounded-full px-4 py-2 cursor-pointer disabled:cursor-default hover:scale-105 active:scale-95 transition-transform duration-150"
                    style={{
                      background: done ? "#F4F3EE" : "var(--portal-emerald, #2F6D46)",
                      color: done ? "rgba(22,48,43,0.4)" : "#fff",
                    }}
                  >
                    {done ? "Received" : "Mark Received"}
                  </button>
                  {done && (
                    <button onClick={() => undoCheckIn(b.id)} className="text-xs font-semibold" style={{ color: "#B5566B" }}>
                      Undo
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
