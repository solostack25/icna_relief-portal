"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type House = { id: string; name: string };
type Bed = { id: string; house_id: string; label: string };

function addMonths(dateStr: string, months: number) {
  const d = new Date(dateStr + "T00:00:00Z");
  d.setUTCMonth(d.getUTCMonth() + months);
  return d.toISOString().slice(0, 10);
}

export default function AdmitToHousingButton({ clientId }: { clientId: string }) {
  const supabase = createClient();
  const router = useRouter();

  const [open, setOpen] = useState(false);
  const [loadingOptions, setLoadingOptions] = useState(true);
  const [houses, setHouses] = useState<House[]>([]);
  const [beds, setBeds] = useState<Bed[]>([]);
  const [houseId, setHouseId] = useState("");
  const [bedId, setBedId] = useState("");
  const [moveInDate, setMoveInDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    if (open) window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open]);

  async function openModal() {
    setOpen(true);
    setLoadingOptions(true);
    setError(null);

    const [{ data: houseRows }, { data: bedRows }, { data: activeStays }] = await Promise.all([
      supabase.from("th_houses").select("id, name").eq("is_active", true).order("name"),
      supabase.from("th_beds").select("id, house_id, label").eq("is_active", true).order("label"),
      supabase.from("th_stays").select("bed_id").eq("status", "active"),
    ]);

    const occupied = new Set((activeStays ?? []).map((s) => s.bed_id));
    setHouses(houseRows ?? []);
    setBeds((bedRows ?? []).filter((b) => !occupied.has(b.id)));
    setLoadingOptions(false);
  }

  function closeModal() {
    setOpen(false);
    setHouseId("");
    setBedId("");
    setError(null);
    setSuccess(false);
  }

  async function handleAdmit(e: React.FormEvent) {
    e.preventDefault();
    if (!bedId || !moveInDate) return;
    setSaving(true);
    setError(null);

    const {
      data: { user },
    } = await supabase.auth.getUser();
    const { data: employee } = user
      ? await supabase.from("employees").select("id").eq("auth_user_id", user.id).single()
      : { data: null };

    const { error: insertError } = await supabase.from("th_stays").insert({
      client_id: clientId,
      bed_id: bedId,
      case_manager_id: employee?.id ?? null,
      move_in_date: moveInDate,
      expected_exit_date: addMonths(moveInDate, 6),
      created_by: employee?.id ?? null,
    });

    setSaving(false);
    if (insertError) {
      setError(
        insertError.message.includes("idx_th_stays_one_active_per_bed")
          ? "That bed was just taken by someone else — pick another."
          : insertError.message
      );
      return;
    }

    setSuccess(true);
  }

  function handleDone() {
    closeModal();
    router.refresh();
  }

  const availableBeds = beds.filter((b) => b.house_id === houseId);

  return (
    <>
      <button
        onClick={openModal}
        className="rounded-lg bg-[var(--color-accent)] text-white text-sm font-medium px-4 py-2 hover:opacity-90"
      >
        Admit to Transitional Housing
      </button>

      {open && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center px-4 z-50">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="admit-housing-modal-title"
            className="relative w-full max-w-md rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6"
          >
            {success ? (
              <div className="text-center py-6">
                <p className="text-base font-medium mb-2">Client admitted.</p>
                <p className="text-xs text-[var(--color-text-dim)] mb-6">
                  Expected exit: {addMonths(moveInDate, 6)} (6 calendar months from move-in).
                </p>
                <button
                  onClick={handleDone}
                  className="rounded-lg bg-[var(--color-accent)] text-white text-sm font-medium px-6 py-2"
                >
                  Done
                </button>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between mb-4">
                  <h3 id="admit-housing-modal-title" className="text-sm font-semibold">
                    Admit to Transitional Housing
                  </h3>
                  <button
                    onClick={closeModal}
                    aria-label="Close"
                    className="text-[var(--color-text-dim)] hover:text-[var(--color-text)] text-sm"
                  >
                    ✕
                  </button>
                </div>

                {loadingOptions ? (
                  <p className="text-sm text-[var(--color-text-dim)]">Loading houses…</p>
                ) : (
                  <form onSubmit={handleAdmit} className="space-y-3">
                    <div>
                      <label
                        htmlFor="admit-house"
                        className="block text-xs text-[var(--color-text-dim)] mb-1"
                      >
                        House
                      </label>
                      <select
                        id="admit-house"
                        value={houseId}
                        onChange={(e) => {
                          setHouseId(e.target.value);
                          setBedId("");
                        }}
                        required
                        className="w-full rounded-lg border border-[var(--color-border)] px-3.5 py-2.5 text-sm focus:outline-none"
                      >
                        <option value="">Select a house…</option>
                        {houses.map((h) => (
                          <option key={h.id} value={h.id}>
                            {h.name}
                          </option>
                        ))}
                      </select>
                      {houses.length === 0 && (
                        <p className="text-xs text-[var(--color-accent-orange)] mt-1">
                          No houses set up yet — add one under Manage houses &amp; beds.
                        </p>
                      )}
                    </div>

                    <div>
                      <label
                        htmlFor="admit-bed"
                        className="block text-xs text-[var(--color-text-dim)] mb-1"
                      >
                        Bed
                      </label>
                      <select
                        id="admit-bed"
                        value={bedId}
                        onChange={(e) => setBedId(e.target.value)}
                        required
                        disabled={!houseId}
                        className="w-full rounded-lg border border-[var(--color-border)] px-3.5 py-2.5 text-sm focus:outline-none disabled:opacity-50"
                      >
                        <option value="">Select an open bed…</option>
                        {availableBeds.map((b) => (
                          <option key={b.id} value={b.id}>
                            {b.label}
                          </option>
                        ))}
                      </select>
                      {houseId && availableBeds.length === 0 && (
                        <p className="text-xs text-[var(--color-accent-orange)] mt-1">
                          No open beds in this house right now.
                        </p>
                      )}
                    </div>

                    <div>
                      <label
                        htmlFor="admit-move-in"
                        className="block text-xs text-[var(--color-text-dim)] mb-1"
                      >
                        Move-in date
                      </label>
                      <input
                        id="admit-move-in"
                        type="date"
                        value={moveInDate}
                        onChange={(e) => setMoveInDate(e.target.value)}
                        required
                        className="w-full rounded-lg border border-[var(--color-border)] px-3.5 py-2.5 text-sm focus:outline-none"
                      />
                      <p className="text-xs text-[var(--color-text-dim)] mt-1">
                        Expected exit: {addMonths(moveInDate, 6)}
                      </p>
                    </div>

                    {error && <p className="text-xs text-red-600">{error}</p>}

                    <div className="flex gap-2 pt-1">
                      <button
                        type="button"
                        onClick={closeModal}
                        className="flex-1 rounded-lg border border-[var(--color-border)] text-sm font-medium px-4 py-2"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        disabled={!bedId || saving}
                        className="flex-1 rounded-lg bg-[var(--color-accent)] text-white text-sm font-medium px-4 py-2 hover:opacity-90 disabled:opacity-50"
                      >
                        {saving ? "Admitting…" : "Admit"}
                      </button>
                    </div>
                  </form>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
