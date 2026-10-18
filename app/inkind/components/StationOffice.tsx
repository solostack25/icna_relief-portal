"use client";

import { useEffect, useState } from "react";

const KEY = "inkind_station_office";

type Office = { id: string; name: string; state: string };

// Which office this scanning station belongs to. Signed-in staff are fixed
// to their own office; admins and signed-out kiosks pick one, remembered on
// the device so it's a one-time setup.
export function useStationOffice() {
  const [offices, setOffices] = useState<Office[]>([]);
  const [officeId, setOfficeIdState] = useState<string | null>(null);
  const [locked, setLocked] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    fetch("/api/inkind/offices")
      .then((r) => r.json())
      .then((d: { offices: Office[]; lockedOfficeId: string | null; defaultOfficeId: string | null }) => {
        setOffices(d.offices ?? []);
        let saved: string | null = null;
        try {
          saved = localStorage.getItem(KEY);
        } catch {}
        const valid = (id: string | null) => (id && d.offices.some((o) => o.id === id) ? id : null);
        if (d.lockedOfficeId) {
          setLocked(true);
          setOfficeIdState(valid(d.lockedOfficeId));
        } else {
          setOfficeIdState(valid(saved) ?? valid(d.defaultOfficeId));
        }
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, []);

  function setOfficeId(id: string) {
    setOfficeIdState(id);
    try {
      localStorage.setItem(KEY, id);
    } catch {}
  }

  const office = offices.find((o) => o.id === officeId) ?? null;
  return { offices, office, officeId, setOfficeId, locked, loaded };
}

export default function StationOfficeBar({ station }: { station: ReturnType<typeof useStationOffice> }) {
  const [picking, setPicking] = useState(false);
  const { offices, office, setOfficeId, locked, loaded } = station;

  if (!loaded) return null;

  if (!office || picking) {
    return (
      <div className="w-full max-w-md rounded-2xl border-2 border-brand/30 bg-white p-4 text-left">
        <label className="block text-sm font-semibold text-brand-dark mb-2">
          {office ? "Change this station's office" : "Which office is this station at?"}
        </label>
        <select
          autoFocus
          defaultValue={office?.id ?? ""}
          onChange={(e) => {
            if (e.target.value) {
              setOfficeId(e.target.value);
              setPicking(false);
            }
          }}
          className="w-full rounded-xl border border-gray-300 px-3 py-3 text-base"
        >
          <option value="">Select office…</option>
          {offices.map((o) => (
            <option key={o.id} value={o.id}>
              {o.state} – {o.name}
            </option>
          ))}
        </select>
        <p className="text-xs text-gray-500 mt-2">Saved on this device — you won&apos;t be asked again.</p>
        {office && (
          <button onClick={() => setPicking(false)} className="text-xs text-gray-500 underline mt-2">
            Cancel
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="text-sm text-gray-500">
      Office: <span className="font-semibold text-brand-dark">{office.name}</span>
      {!locked && (
        <button onClick={() => setPicking(true)} className="ml-2 underline">
          change
        </button>
      )}
    </div>
  );
}
