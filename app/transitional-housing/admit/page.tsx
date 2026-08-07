"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

type ClientResult = {
  id: string;
  client_number: string;
  first_name: string;
  last_name: string;
};

type Bed = { id: string; house_id: string; label: string };
type House = { id: string; name: string };

export default function AdmitPage() {
  const supabase = createClient();

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ClientResult[] | null>(null);
  const [selected, setSelected] = useState<ClientResult | null>(null);
  const [checking, setChecking] = useState(false);
  const [priorStayCount, setPriorStayCount] = useState<number | null>(null);

  const [houses, setHouses] = useState<House[]>([]);
  const [beds, setBeds] = useState<Bed[]>([]);
  const [houseId, setHouseId] = useState("");
  const [bedId, setBedId] = useState("");
  const [moveInDate, setMoveInDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    const term = query.trim();
    const { data } = await supabase
      .from("clients")
      .select("id, client_number, first_name, last_name")
      .or(`first_name.ilike.%${term}%,last_name.ilike.%${term}%,client_number.ilike.%${term}%`)
      .limit(20);
    setResults(data ?? []);
  }

  async function selectClient(client: ClientResult) {
    setSelected(client);
    setChecking(true);
    setSuccess(false);

    const { count } = await supabase
      .from("th_stays")
      .select("id", { count: "exact", head: true })
      .eq("client_id", client.id);
    setPriorStayCount(count ?? 0);

    const [{ data: houseRows }, { data: bedRows }, { data: activeStays }] = await Promise.all([
      supabase.from("th_houses").select("id, name").eq("is_active", true).order("name"),
      supabase.from("th_beds").select("id, house_id, label").eq("is_active", true).order("label"),
      supabase.from("th_stays").select("bed_id").eq("status", "active"),
    ]);

    const occupied = new Set((activeStays ?? []).map((s) => s.bed_id));
    setHouses(houseRows ?? []);
    setBeds((bedRows ?? []).filter((b) => !occupied.has(b.id)));
    setChecking(false);
  }

  function addMonths(dateStr: string, months: number) {
    const d = new Date(dateStr + "T00:00:00Z");
    d.setUTCMonth(d.getUTCMonth() + months);
    return d.toISOString().slice(0, 10);
  }

  async function handleAdmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selected || !bedId || !moveInDate) return;
    setSaving(true);

    const {
      data: { user },
    } = await supabase.auth.getUser();
    const { data: employee } = user
      ? await supabase.from("employees").select("id").eq("auth_user_id", user.id).single()
      : { data: null };

    const { error } = await supabase.from("th_stays").insert({
      client_id: selected.id,
      bed_id: bedId,
      case_manager_id: employee?.id ?? null,
      move_in_date: moveInDate,
      expected_exit_date: addMonths(moveInDate, 6),
      created_by: employee?.id ?? null,
    });

    setSaving(false);
    if (!error) {
      setSuccess(true);
      setSelected(null);
      setResults(null);
      setQuery("");
    }
  }

  return (
    <main className="min-h-screen px-4 py-12">
      <div className="max-w-2xl mx-auto">
        <Link
          href="/transitional-housing"
          className="text-sm text-[var(--color-text-dim)] hover:text-[var(--color-text)]"
        >
          ← Transitional Housing
        </Link>
        <h1 className="text-xl font-semibold mt-4 mb-6">Admit Client</h1>

        {success && (
          <div className="mb-6 rounded-lg border border-[var(--color-accent)]/40 bg-[var(--color-accent)]/10 px-4 py-3 text-sm text-[var(--color-accent)]">
            Client admitted. Expected exit date was calculated automatically (6 calendar
            months from move-in).
          </div>
        )}

        {!selected && (
          <form onSubmit={handleSearch} className="mb-6">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by name or client number…"
              className="w-full rounded-lg border border-[var(--color-border)] px-3.5 py-2.5 text-sm focus:outline-none"
            />
            {results && (
              <ul className="mt-3 space-y-1.5">
                {results.length === 0 && (
                  <p className="text-sm text-[var(--color-text-dim)]">No clients found.</p>
                )}
                {results.map((c) => (
                  <li key={c.id}>
                    <button
                      type="button"
                      onClick={() => selectClient(c)}
                      className="w-full text-left rounded-lg border border-[var(--color-border)] px-3.5 py-2.5 text-sm hover:border-[var(--color-accent)]"
                    >
                      {c.first_name} {c.last_name}{" "}
                      <span className="text-[var(--color-text-dim)]">{c.client_number}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </form>
        )}

        {selected && checking && (
          <p className="text-sm text-[var(--color-text-dim)]">Checking stay history…</p>
        )}

        {selected && !checking && priorStayCount !== null && priorStayCount > 0 && (
          <div className="rounded-xl border border-[var(--color-accent-orange)]/40 bg-[var(--color-accent-orange)]/10 p-6">
            <p className="text-sm font-medium text-[var(--color-accent-orange)] mb-1">
              {selected.first_name} {selected.last_name} has a prior Transitional Housing stay.
            </p>
            <p className="text-sm text-[var(--color-text-dim)] mb-4">
              Any admission after a client&apos;s first stay requires an approved readmission
              request. This isn&apos;t optional here — direct admission is disabled for this
              client.
            </p>
            <Link
              href={`/transitional-housing/readmissions/new?client=${selected.id}`}
              className="inline-block rounded-lg bg-[var(--color-accent-orange)] text-white text-sm font-medium px-4 py-2 hover:opacity-90"
            >
              File a Readmission Request
            </Link>
          </div>
        )}

        {selected && !checking && priorStayCount === 0 && (
          <form
            onSubmit={handleAdmit}
            className="rounded-xl border border-[var(--color-border)] p-6 space-y-3"
          >
            <p className="text-sm font-medium mb-1">
              Admitting {selected.first_name} {selected.last_name}
            </p>

            <select
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

            <select
              value={bedId}
              onChange={(e) => setBedId(e.target.value)}
              required
              disabled={!houseId}
              className="w-full rounded-lg border border-[var(--color-border)] px-3.5 py-2.5 text-sm focus:outline-none disabled:opacity-50"
            >
              <option value="">Select an open bed…</option>
              {beds
                .filter((b) => b.house_id === houseId)
                .map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.label}
                  </option>
                ))}
            </select>
            {houseId && beds.filter((b) => b.house_id === houseId).length === 0 && (
              <p className="text-xs text-[var(--color-accent-orange)]">
                No open beds in this house right now.
              </p>
            )}

            <div>
              <label htmlFor="moveIn" className="block text-xs text-[var(--color-text-dim)] mb-1">
                Move-in date
              </label>
              <input
                id="moveIn"
                type="date"
                value={moveInDate}
                onChange={(e) => setMoveInDate(e.target.value)}
                required
                className="w-full rounded-lg border border-[var(--color-border)] px-3.5 py-2.5 text-sm focus:outline-none"
              />
              <p className="text-xs text-[var(--color-text-dim)] mt-1">
                Expected exit: {addMonths(moveInDate, 6)} (6 calendar months from move-in)
              </p>
            </div>

            <button
              type="submit"
              disabled={!bedId || saving}
              className="w-full rounded-lg bg-[var(--color-accent)] text-white text-sm font-medium px-4 py-2.5 hover:opacity-90 disabled:opacity-50"
            >
              {saving ? "Admitting…" : "Admit Client"}
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
