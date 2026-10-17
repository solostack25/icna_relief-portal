"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { formatTimeInTz, utcIsoToZonedLocal, zonedLocalToUtcIso } from "@/lib/volunteer";

export type RosterAttendance = {
  id: string;
  checked_in_at: string;
  checked_out_at: string | null;
  checkin_method: string;
  checkout_method: string | null;
  hours: number | null;
};

export type RosterRow = {
  key: string;
  volunteer_id: string | null;
  name: string;
  contact: string;
  slots: string[];
  signup_ids: string[];
  walk_in: boolean;
  waiver_on_file: boolean;
  profile_complete: boolean;
  attendance: RosterAttendance[];
};

export default function AttendanceRoster({
  eventId,
  timezone,
  rows,
  ended,
}: {
  eventId: string;
  timezone: string;
  rows: RosterRow[];
  ended: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<{ id: string; inAt: string; outAt: string } | null>(null);
  const [showWalkIn, setShowWalkIn] = useState(false);
  const [walkIn, setWalkIn] = useState({ first_name: "", last_name: "", contact: "", paper_waiver: false });

  async function act(key: string, payload: Record<string, unknown>) {
    setBusy(key);
    setError(null);
    const res = await fetch(`/api/volunteer/events/${eventId}/attendance`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(null);
    if (!res.ok) {
      setError(data.error ?? "Something went wrong.");
      return false;
    }
    router.refresh();
    return true;
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => r.name.toLowerCase().includes(q) || r.contact.toLowerCase().includes(q));
  }, [rows, query]);

  const t = (iso: string | null) => (iso ? formatTimeInTz(iso, timezone) : "");
  const methodLabel = (m: string | null) => (m === "auto" ? " (auto)" : m === "staff" ? " (staff)" : "");

  const inputClass =
    "w-full rounded-lg border border-[var(--color-border)] bg-white px-3 py-2 text-sm outline-none focus:border-[var(--color-accent)]";

  return (
    <section className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6">
      <div className="flex items-center justify-between gap-3 mb-4">
        <h2 className="text-sm font-medium">Attendance</h2>
        <button onClick={() => setShowWalkIn((v) => !v)} className="text-sm text-[var(--color-accent)] font-medium">
          {showWalkIn ? "Cancel" : "+ Add walk-in"}
        </button>
      </div>

      {showWalkIn && (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            const ok = await act("walkin", { action: "walk_in", ...walkIn });
            if (ok) {
              setWalkIn({ first_name: "", last_name: "", contact: "", paper_waiver: false });
              setShowWalkIn(false);
            }
          }}
          className="mb-5 space-y-3 rounded-lg border border-[var(--color-border)] p-4"
        >
          <p className="text-xs text-[var(--color-text-dim)]">
            For someone without a phone. Anyone with a phone can scan the check-in code themselves (that also collects their
            waiver and details).
          </p>
          <div className="grid grid-cols-2 gap-3">
            <input required placeholder="First name" value={walkIn.first_name} onChange={(e) => setWalkIn({ ...walkIn, first_name: e.target.value })} className={inputClass} />
            <input required placeholder="Last name" value={walkIn.last_name} onChange={(e) => setWalkIn({ ...walkIn, last_name: e.target.value })} className={inputClass} />
          </div>
          <input required placeholder="Email or phone" value={walkIn.contact} onChange={(e) => setWalkIn({ ...walkIn, contact: e.target.value })} className={inputClass} />
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={walkIn.paper_waiver} onChange={(e) => setWalkIn({ ...walkIn, paper_waiver: e.target.checked })} className="h-4 w-4 accent-[var(--color-accent)]" />
            They signed a paper waiver
          </label>
          <button type="submit" disabled={busy === "walkin"} className="w-full rounded-lg bg-[var(--color-accent)] text-white font-medium py-2 text-sm disabled:opacity-50">
            {busy === "walkin" ? "Adding..." : "Add & check in"}
          </button>
        </form>
      )}

      {rows.length > 6 && (
        <input placeholder="Search name, email or phone" value={query} onChange={(e) => setQuery(e.target.value)} className={inputClass + " mb-3"} />
      )}

      {error && <p className="text-sm text-[#B55139] mb-3">{error}</p>}

      {filtered.length === 0 ? (
        <p className="text-sm text-[var(--color-text-dim)]">No one has signed up or checked in yet.</p>
      ) : (
        <div className="divide-y divide-[var(--color-border)]">
          {filtered.map((r) => {
            const open = r.attendance.find((a) => !a.checked_out_at) ?? null;
            const totalHours = r.attendance.reduce((s, a) => s + (a.hours ?? 0), 0);
            return (
              <div key={r.key} className="py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-medium flex flex-wrap items-center gap-1.5">
                      {r.name}
                      {open && <span className="rounded-full bg-green-600/10 px-2 py-0.5 text-[11px] text-green-800">Here</span>}
                      {r.walk_in && <span className="rounded-full bg-black/5 px-2 py-0.5 text-[11px] text-[var(--color-text-dim)]">Walk-in</span>}
                      {!r.waiver_on_file && <span className="rounded-full bg-[#B55139]/10 px-2 py-0.5 text-[11px] text-[#B55139]">No waiver</span>}
                    </div>
                    <div className="text-xs text-[var(--color-text-dim)] truncate">
                      {r.contact}
                      {r.slots.length ? ` · ${r.slots.join(", ")}` : ""}
                    </div>
                    {r.attendance.map((a) => (
                      <div key={a.id} className="text-xs mt-1">
                        {editing?.id === a.id ? (
                          <div className="flex flex-wrap items-center gap-2 mt-1">
                            <input type="datetime-local" value={editing.inAt} onChange={(e) => setEditing({ ...editing, inAt: e.target.value })} className="rounded border border-[var(--color-border)] px-2 py-1 text-xs" />
                            <span>→</span>
                            <input type="datetime-local" value={editing.outAt} onChange={(e) => setEditing({ ...editing, outAt: e.target.value })} className="rounded border border-[var(--color-border)] px-2 py-1 text-xs" />
                            <button
                              disabled={busy === a.id}
                              onClick={async () => {
                                const ok = await act(a.id, {
                                  action: "adjust",
                                  attendance_id: a.id,
                                  checked_in_at: zonedLocalToUtcIso(editing.inAt, timezone),
                                  checked_out_at: editing.outAt ? zonedLocalToUtcIso(editing.outAt, timezone) : null,
                                });
                                if (ok) setEditing(null);
                              }}
                              className="rounded bg-[var(--color-accent)] px-2 py-1 text-white"
                            >
                              Save
                            </button>
                            <button onClick={() => setEditing(null)} className="text-[var(--color-text-dim)]">Cancel</button>
                          </div>
                        ) : (
                          <span className="text-[var(--color-text-dim)]">
                            In {t(a.checked_in_at)}{methodLabel(a.checkin_method === "staff" ? "staff" : null)}
                            {a.checked_out_at ? ` → out ${t(a.checked_out_at)}${methodLabel(a.checkout_method)}` : " → still here"}
                            {a.hours !== null ? ` · ${a.hours.toFixed(2)} h` : ""}
                            {" · "}
                            <button
                              onClick={() =>
                                setEditing({
                                  id: a.id,
                                  inAt: utcIsoToZonedLocal(a.checked_in_at, timezone),
                                  outAt: utcIsoToZonedLocal(a.checked_out_at, timezone),
                                })
                              }
                              className="underline"
                            >
                              edit
                            </button>
                            {" · "}
                            <button
                              onClick={() => confirm("Remove this check-in? Use this only for mistakes.") && act(a.id, { action: "delete", attendance_id: a.id })}
                              className="underline text-[#B55139]"
                            >
                              remove
                            </button>
                          </span>
                        )}
                      </div>
                    ))}
                    {r.attendance.length > 1 && (
                      <div className="text-xs mt-1 font-medium">Total {totalHours.toFixed(2)} h</div>
                    )}
                  </div>

                  <div className="shrink-0 flex flex-col items-end gap-1.5">
                    {open ? (
                      <button
                        disabled={busy === r.key}
                        onClick={() => act(r.key, { action: "check_out", attendance_id: open.id })}
                        className="rounded-full border border-[var(--color-border)] px-3 py-1.5 text-xs font-medium disabled:opacity-50"
                      >
                        Check out
                      </button>
                    ) : r.volunteer_id && !ended ? (
                      <button
                        disabled={busy === r.key}
                        onClick={() => act(r.key, { action: "check_in", volunteer_id: r.volunteer_id, signup_id: r.signup_ids[0] ?? null })}
                        className="rounded-full bg-[var(--color-accent)] px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
                      >
                        {r.attendance.length ? "Check in again" : "Check in"}
                      </button>
                    ) : null}
                    {r.attendance.length === 0 && r.signup_ids.length > 0 && (
                      <button
                        onClick={() =>
                          confirm(`Cancel ${r.name}'s sign-up? This frees their spot.`) &&
                          Promise.all(r.signup_ids.map((id) => act(r.key, { action: "cancel_signup", signup_id: id })))
                        }
                        className="text-[11px] text-[var(--color-text-dim)] underline"
                      >
                        Cancel sign-up
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
