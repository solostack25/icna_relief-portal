"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Office = { id: string; field_office: string };
type MappingRow = { square_location_id: string; location_name: string; office_id: string | null };

const inputStyle: React.CSSProperties = {
  border: "1.5px solid var(--portal-line, rgba(22,48,43,0.12))",
  borderRadius: 10,
  padding: "8px 12px",
  fontSize: 13,
  background: "#fff",
  outline: "none",
};

export default function SquareLocationMapClient({ offices }: { offices: Office[] }) {
  const supabase = createClient();
  const [locations, setLocations] = useState<MappingRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);

  async function loadLocations() {
    setError(null);
    const res = await fetch("/api/admin/square/locations");
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? "Failed to load Square locations");
      return;
    }
    setLocations(data.locations);
  }

  useEffect(() => {
    loadLocations();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function saveMapping(squareLocationId: string, locationName: string, officeId: string) {
    setSaving(squareLocationId);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const { data: employee } = user ? await supabase.from("employees").select("id").eq("auth_user_id", user.id).single() : { data: null };

    await supabase.from("square_location_map").upsert({
      square_location_id: squareLocationId,
      location_name: locationName,
      office_id: officeId || null,
      updated_by: employee?.id ?? null,
      updated_at: new Date().toISOString(),
    });

    setSaving(null);
    setLocations((prev) => (prev ? prev.map((l) => (l.square_location_id === squareLocationId ? { ...l, office_id: officeId || null } : l)) : prev));
  }

  async function runSync() {
    setSyncing(true);
    setSyncMsg(null);
    const res = await fetch("/api/admin/square/sync", { method: "POST" });
    const data = await res.json();
    setSyncing(false);
    setSyncMsg(res.ok ? `Synced ${data.synced} payments.` : data.error ?? "Sync failed");
  }

  if (error) {
    return (
      <p className="text-sm" style={{ color: "#B5566B" }}>
        {error}
      </p>
    );
  }

  return (
    <div>
      {!locations ? (
        <p className="text-sm" style={{ color: "rgba(22,48,43,0.4)" }}>
          Loading Square locations…
        </p>
      ) : locations.length === 0 ? (
        <p className="text-sm" style={{ color: "rgba(22,48,43,0.4)" }}>
          No locations found — check the Access Token above is set.
        </p>
      ) : (
        <div className="space-y-2 mb-4">
          {locations.map((l) => (
            <div key={l.square_location_id} className="flex items-center justify-between gap-3 text-sm">
              <span className="font-semibold">{l.location_name}</span>
              <select
                value={l.office_id ?? ""}
                onChange={(e) => saveMapping(l.square_location_id, l.location_name, e.target.value)}
                disabled={saving === l.square_location_id}
                style={{ ...inputStyle, width: 220 }}
              >
                <option value="">Not mapped</option>
                {offices.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.field_office}
                  </option>
                ))}
              </select>
            </div>
          ))}
        </div>
      )}

      <button
        onClick={runSync}
        disabled={syncing}
        className="text-xs font-bold rounded-full px-4 py-2 text-white cursor-pointer disabled:opacity-50"
        style={{ background: "var(--portal-emerald, #2F6D46)" }}
      >
        {syncing ? "Syncing…" : "Sync Payments Now"}
      </button>
      {syncMsg && (
        <p className="text-xs mt-2" style={{ color: "rgba(22,48,43,0.5)" }}>
          {syncMsg}
        </p>
      )}
      <p className="text-[11px] mt-2" style={{ color: "rgba(22,48,43,0.4)" }}>
        Also syncs automatically every few hours via cron. Only mapped locations flow into the Revenue page.
      </p>
    </div>
  );
}
