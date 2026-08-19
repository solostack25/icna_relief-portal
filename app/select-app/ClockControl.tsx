"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type OpenEntry = { id: string; clock_in_at: string } | null;

function formatElapsed(clockInAt: string): string {
  const diffMs = Date.now() - new Date(clockInAt).getTime();
  const totalMinutes = Math.max(0, Math.floor(diffMs / 60000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes}m`;
  return `${hours}h ${minutes}m`;
}

export default function ClockControl({
  employeeId,
  initialOpenEntry,
}: {
  employeeId: string;
  initialOpenEntry: OpenEntry;
}) {
  const supabase = createClient();
  const [openEntry, setOpenEntry] = useState<OpenEntry>(initialOpenEntry);
  const [elapsed, setElapsed] = useState(() => (initialOpenEntry ? formatElapsed(initialOpenEntry.clock_in_at) : ""));
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!openEntry) return;
    setElapsed(formatElapsed(openEntry.clock_in_at));
    const interval = setInterval(() => {
      setElapsed(formatElapsed(openEntry.clock_in_at));
    }, 30_000);
    return () => clearInterval(interval);
  }, [openEntry]);

  async function handleClockIn() {
    setBusy(true);
    const { data, error } = await supabase
      .from("time_clock_entries")
      .insert({ employee_id: employeeId, source: "portal" })
      .select("id, clock_in_at")
      .single();
    setBusy(false);
    if (!error && data) setOpenEntry(data);
  }

  async function handleClockOut() {
    if (!openEntry) return;
    setBusy(true);
    const { error } = await supabase
      .from("time_clock_entries")
      .update({ clock_out_at: new Date().toISOString() })
      .eq("id", openEntry.id);
    setBusy(false);
    if (!error) setOpenEntry(null);
  }

  return (
    <div className="flex items-center gap-3">
      <span
        className="inline-flex items-center gap-1.5 text-sm"
        style={{ color: openEntry ? "var(--portal-gold-soft)" : "rgba(251,247,239,0.6)" }}
      >
        <span
          className="w-2 h-2 rounded-full"
          style={{
            background: openEntry ? "#4ADE80" : "rgba(251,247,239,0.35)",
            boxShadow: openEntry ? "0 0 0 3px rgba(74,222,128,0.25)" : "none",
          }}
        />
        {openEntry ? `Clocked in for ${elapsed}` : "Not clocked in"}
      </span>
      <button
        onClick={openEntry ? handleClockOut : handleClockIn}
        disabled={busy}
        className="text-xs font-medium px-3 py-1.5 rounded-full transition-colors disabled:opacity-50"
        style={
          openEntry
            ? { background: "rgba(251,247,239,0.12)", border: "1px solid rgba(251,247,239,0.25)", color: "#fbf7ef" }
            : { background: "var(--portal-gold-soft)", color: "#16302b" }
        }
      >
        {busy ? "..." : openEntry ? "Clock Out" : "Clock In"}
      </button>
    </div>
  );
}
