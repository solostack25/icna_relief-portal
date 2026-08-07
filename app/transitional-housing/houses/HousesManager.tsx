"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

type House = { id: string; name: string; address: string | null; office_id: string | null; is_active: boolean };
type Bed = { id: string; house_id: string; label: string; is_active: boolean };
type Office = { id: string; field_office: string };

export default function HousesManager({
  initialHouses,
  initialBeds,
  occupiedBedIds,
  offices,
}: {
  initialHouses: House[];
  initialBeds: Bed[];
  occupiedBedIds: string[];
  offices: Office[];
}) {
  const supabase = createClient();
  const [houses, setHouses] = useState(initialHouses);
  const [beds, setBeds] = useState(initialBeds);
  const occupied = new Set(occupiedBedIds);

  const [newHouseName, setNewHouseName] = useState("");
  const [newHouseAddress, setNewHouseAddress] = useState("");
  const [newHouseOffice, setNewHouseOffice] = useState("");
  const [savingHouse, setSavingHouse] = useState(false);

  const [newBedLabels, setNewBedLabels] = useState<Record<string, string>>({});
  const [savingBedFor, setSavingBedFor] = useState<string | null>(null);

  async function addHouse(e: React.FormEvent) {
    e.preventDefault();
    if (!newHouseName.trim()) return;
    setSavingHouse(true);

    const { data, error } = await supabase
      .from("th_houses")
      .insert({
        name: newHouseName.trim(),
        address: newHouseAddress.trim() || null,
        office_id: newHouseOffice || null,
      })
      .select("id, name, address, office_id, is_active")
      .single();

    setSavingHouse(false);
    if (!error && data) {
      setHouses((prev) => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)));
      setNewHouseName("");
      setNewHouseAddress("");
      setNewHouseOffice("");
    }
  }

  async function addBed(houseId: string) {
    const label = (newBedLabels[houseId] ?? "").trim();
    if (!label) return;
    setSavingBedFor(houseId);

    const { data, error } = await supabase
      .from("th_beds")
      .insert({ house_id: houseId, label })
      .select("id, house_id, label, is_active")
      .single();

    setSavingBedFor(null);
    if (!error && data) {
      setBeds((prev) => [...prev, data]);
      setNewBedLabels((prev) => ({ ...prev, [houseId]: "" }));
    }
  }

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-[var(--color-border)] p-6">
        <h2 className="text-sm font-medium mb-3">Add a house</h2>
        <form onSubmit={addHouse} className="space-y-2.5">
          <input
            type="text"
            value={newHouseName}
            onChange={(e) => setNewHouseName(e.target.value)}
            placeholder="House name"
            required
            className="w-full rounded-lg border border-[var(--color-border)] px-3.5 py-2.5 text-sm focus:outline-none"
          />
          <input
            type="text"
            value={newHouseAddress}
            onChange={(e) => setNewHouseAddress(e.target.value)}
            placeholder="Address (optional)"
            className="w-full rounded-lg border border-[var(--color-border)] px-3.5 py-2.5 text-sm focus:outline-none"
          />
          <select
            value={newHouseOffice}
            onChange={(e) => setNewHouseOffice(e.target.value)}
            className="w-full rounded-lg border border-[var(--color-border)] px-3.5 py-2.5 text-sm focus:outline-none"
          >
            <option value="">No office assigned</option>
            {offices.map((o) => (
              <option key={o.id} value={o.id}>
                {o.field_office}
              </option>
            ))}
          </select>
          <button
            type="submit"
            disabled={savingHouse}
            className="rounded-lg bg-[var(--color-accent)] text-white text-sm font-medium px-4 py-2 hover:opacity-90 disabled:opacity-50"
          >
            {savingHouse ? "Adding…" : "Add House"}
          </button>
        </form>
      </section>

      {houses.map((house) => {
        const houseBeds = beds.filter((b) => b.house_id === house.id);
        return (
          <section key={house.id} className="rounded-xl border border-[var(--color-border)] p-6">
            <h2 className="text-sm font-medium">{house.name}</h2>
            {house.address && (
              <p className="text-xs text-[var(--color-text-dim)] mb-3">{house.address}</p>
            )}

            <div className="flex flex-wrap gap-1.5 my-3">
              {houseBeds.length === 0 && (
                <p className="text-xs text-[var(--color-text-dim)]">No beds added yet.</p>
              )}
              {houseBeds.map((bed) => (
                <span
                  key={bed.id}
                  className={[
                    "rounded-full text-xs font-medium px-2.5 py-1 border",
                    occupied.has(bed.id)
                      ? "bg-[var(--color-accent-orange)]/10 border-[var(--color-accent-orange)]/40 text-[var(--color-accent-orange)]"
                      : "bg-[var(--color-accent)]/10 border-[var(--color-accent)]/40 text-[var(--color-accent)]",
                  ].join(" ")}
                >
                  {bed.label} · {occupied.has(bed.id) ? "occupied" : "open"}
                </span>
              ))}
            </div>

            <div className="flex gap-2">
              <input
                type="text"
                value={newBedLabels[house.id] ?? ""}
                onChange={(e) =>
                  setNewBedLabels((prev) => ({ ...prev, [house.id]: e.target.value }))
                }
                placeholder="Bed label, e.g. 4B"
                className="flex-1 rounded-lg border border-[var(--color-border)] px-3 py-1.5 text-sm focus:outline-none"
              />
              <button
                onClick={() => addBed(house.id)}
                disabled={savingBedFor === house.id}
                className="rounded-lg border border-[var(--color-border)] text-sm font-medium px-3 py-1.5 hover:border-[var(--color-accent)] disabled:opacity-50"
              >
                {savingBedFor === house.id ? "Adding…" : "Add Bed"}
              </button>
            </div>
          </section>
        );
      })}
    </div>
  );
}
