"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import PortalHeader from "@/app/PortalHeader";
import { Card, Eyebrow, PageTitle, PillButton, money, dim, faint, ink, gold, emerald, rose } from "@/components/speaker/ui";
import TicketConfirmationCard from "@/components/TicketConfirmationCard";

// Mileage Tracker - Start Trip / End Trip from the installed portal app.
// Miles are worked out on the server from the driving route between the
// two points (see lib/mileage.ts). While this screen stays open we also
// collect GPS breadcrumbs as a backup/audit figure - an iPhone PWA can't
// read location once the screen locks, which is why the route is the
// number that gets reimbursed.

type Drive = {
  id: string;
  status: "in_progress" | "ready" | "submitted" | "discarded";
  started_at: string;
  ended_at: string | null;
  start_address_line1: string | null;
  start_city: string | null;
  start_state: string | null;
  end_address_line1: string | null;
  end_city: string | null;
  end_state: string | null;
  route_miles: number | null;
  route_provider: string | null;
  gps_miles: number | null;
  round_trip: boolean;
  miles: number | null;
  miles_adjusted: boolean;
  adjusted_reason: string | null;
  purpose: string | null;
  billing_office_id: string | null;
  billing_program: string | null;
  finance_ticket_id: string | null;
  finance_tickets?: { ticket_number: string; status: string } | null;
};
type Office = { id: string; field_office: string };
type State = { active: Drive | null; ready: Drive[]; submitted: Drive[]; offices: Office[]; rate: number; assignedOfficeId: string | null };

const MAX_ACCURACY_M = 50;
const MAX_SPEED_MPH = 110;
const crumbKey = (id: string) => `mileage-crumbs:${id}`;

function place(line1: string | null, city: string | null, state: string | null) {
  return line1 || [city, state].filter(Boolean).join(", ") || "Unknown location";
}
function miles(n: number | null | undefined) {
  return `${Number(n ?? 0).toLocaleString("en-US", { maximumFractionDigits: 1, minimumFractionDigits: 1 })} mi`;
}
function shortWhen(iso: string) {
  return new Date(iso).toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}
function elapsed(fromIso: string, now: number) {
  const s = Math.max(0, Math.floor((now - new Date(fromIso).getTime()) / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}` : `${m}:${String(sec).padStart(2, "0")}`;
}
function haversineMiles(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 3958.8;
  const r = (d: number) => (d * Math.PI) / 180;
  const h = Math.sin(r(b.lat - a.lat) / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(r(b.lng - a.lng) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function getPosition(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      reject(new Error("This device can't share its location with the portal."));
      return;
    }
    navigator.geolocation.getCurrentPosition(resolve, (err) => {
      if (err.code === err.PERMISSION_DENIED) {
        reject(new Error("Location is turned off for the portal. Allow location access in your phone's settings, then try again."));
      } else if (err.code === err.TIMEOUT) {
        reject(new Error("Couldn't get a GPS fix in time. Step outside or wait a moment and try again."));
      } else {
        reject(new Error("Couldn't read your location. Try again."));
      }
    }, { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 });
  });
}

type Crumbs = { miles: number; points: number; last: { lat: number; lng: number; t: number } | null };
function loadCrumbs(id: string): Crumbs {
  try {
    const raw = localStorage.getItem(crumbKey(id));
    if (raw) return JSON.parse(raw);
  } catch {}
  return { miles: 0, points: 0, last: null };
}
function saveCrumbs(id: string, c: Crumbs) {
  try {
    localStorage.setItem(crumbKey(id), JSON.stringify(c));
  } catch {}
}
function clearCrumbs(id: string) {
  try {
    localStorage.removeItem(crumbKey(id));
  } catch {}
}

export default function MileagePage() {
  const [data, setData] = useState<State | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());
  const [sheet, setSheet] = useState<{ drive: Drive; fresh: boolean } | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [done, setDone] = useState<{ id: string; ticket_number: string; title: string; total: number; trips: number; warning?: string } | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/mileage/drives", { cache: "no-store" });
    const d = await res.json();
    if (!res.ok) {
      setError(d.error ?? "Couldn't load your trips");
      return;
    }
    setData(d);
    setSelected((prev) => new Set(Array.from(prev).filter((id) => (d.ready as Drive[]).some((r) => r.id === id && r.purpose))));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const active = data?.active ?? null;

  // ---- ticking clock while a trip runs ----
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [active]);

  // ---- GPS breadcrumbs while the screen is open ----
  const [gps, setGps] = useState<Crumbs>({ miles: 0, points: 0, last: null });
  useEffect(() => {
    if (!active || typeof navigator === "undefined" || !navigator.geolocation) return;
    let crumbs = loadCrumbs(active.id);
    setGps(crumbs);
    const watch = navigator.geolocation.watchPosition(
      (pos) => {
        const { latitude: lat, longitude: lng, accuracy } = pos.coords;
        if (accuracy > MAX_ACCURACY_M) return;
        const p = { lat, lng, t: pos.timestamp };
        if (crumbs.last) {
          const d = haversineMiles(crumbs.last, p);
          const hrs = (p.t - crumbs.last.t) / 3_600_000;
          // Ignore jitter while parked and impossible jumps (bad fix).
          if (d < 0.01) return;
          if (hrs > 0 && d / hrs > MAX_SPEED_MPH) return;
          crumbs = { miles: crumbs.miles + d, points: crumbs.points + 1, last: p };
        } else {
          crumbs = { ...crumbs, points: crumbs.points + 1, last: p };
        }
        saveCrumbs(active.id, crumbs);
        setGps(crumbs);
      },
      () => {},
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 30000 }
    );
    return () => navigator.geolocation.clearWatch(watch);
  }, [active]);

  // ---- keep the screen awake (optional, dash-mount mode) ----
  const [keepAwake, setKeepAwake] = useState(false);
  const lockRef = useRef<{ release: () => Promise<void> } | null>(null);
  const wakeSupported = typeof navigator !== "undefined" && "wakeLock" in navigator;
  useEffect(() => {
    if (!active || !keepAwake || !wakeSupported) return;
    let cancelled = false;
    const acquire = async () => {
      try {
        const lock = await (navigator as unknown as { wakeLock: { request: (t: "screen") => Promise<{ release: () => Promise<void> }> } }).wakeLock.request("screen");
        if (cancelled) lock.release().catch(() => {});
        else lockRef.current = lock;
      } catch {
        setKeepAwake(false);
      }
    };
    const onVis = () => {
      if (document.visibilityState === "visible") acquire();
    };
    acquire();
    document.addEventListener("visibilitychange", onVis);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVis);
      lockRef.current?.release().catch(() => {});
      lockRef.current = null;
    };
  }, [active, keepAwake, wakeSupported]);

  async function startTrip() {
    setError(null);
    setBusy("start");
    try {
      const pos = await getPosition();
      const res = await fetch("/api/mileage/drives", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "Couldn't start the trip");
      saveCrumbs(d.drive.id, { miles: 0, points: 1, last: { lat: pos.coords.latitude, lng: pos.coords.longitude, t: pos.timestamp } });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't start the trip");
    } finally {
      setBusy(null);
    }
  }

  async function endTrip() {
    if (!active) return;
    setError(null);
    setBusy("end");
    try {
      const pos = await getPosition();
      const crumbs = loadCrumbs(active.id);
      const tail = crumbs.last ? haversineMiles(crumbs.last, { lat: pos.coords.latitude, lng: pos.coords.longitude }) : 0;
      const res = await fetch(`/api/mileage/drives/${active.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "end",
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          gps_miles: crumbs.points > 1 ? crumbs.miles + tail : null,
          gps_points: crumbs.points + 1,
        }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "Couldn't end the trip");
      clearCrumbs(active.id);
      setKeepAwake(false);
      await load();
      setSheet({ drive: d.drive, fresh: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't end the trip");
    } finally {
      setBusy(null);
    }
  }

  async function discard(drive: Drive) {
    if (!confirm(drive.status === "in_progress" ? "Cancel this trip? Nothing will be submitted." : "Remove this trip? It won't be reimbursed.")) return;
    setBusy(`discard:${drive.id}`);
    try {
      const res = await fetch(`/api/mileage/drives/${drive.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error((await res.json()).error ?? "Couldn't remove the trip");
      clearCrumbs(drive.id);
      setSheet(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't remove the trip");
    } finally {
      setBusy(null);
    }
  }

  async function submit(ids: string[], title?: string) {
    setError(null);
    setBusy("submit");
    try {
      const res = await fetch("/api/mileage/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ drive_ids: ids, title, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "Couldn't submit");
      setDone({ id: d.ticket.id, ticket_number: d.ticket.ticket_number, title: d.title, total: d.totalAmount, trips: ids.length, warning: d.warning });
      setSelected(new Set());
      setSheet(null);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't submit");
    } finally {
      setBusy(null);
    }
  }

  const rate = data?.rate ?? 0.725;
  const described = (data?.ready ?? []).filter((d) => d.purpose);
  const needsReason = (data?.ready ?? []).filter((d) => !d.purpose);
  const selectedDrives = described.filter((d) => selected.has(d.id));
  const selectedMiles = selectedDrives.reduce((s, d) => s + Number(d.miles ?? 0), 0);

  return (
    <main style={{ minHeight: "100vh", background: "var(--portal-sand)" }}>
      <PortalHeader />
      <div className="max-w-2xl mx-auto px-4 sm:px-8 py-8">
        <Link href="/select-app" className="text-xs" style={{ color: faint }}>
          ← Home
        </Link>
        <PageTitle eyebrow="Finance · Reimbursement" title="Mileage Tracker" right={<PillButton href="/finance-tickets" variant="ghost">My finance tickets</PillButton>} />

        {done ? (
          <div className="grid gap-4">
            <TicketConfirmationCard
              systemLabel="Mileage Reimbursement"
              ticketNumber={done.ticket_number}
              title={`${done.title} · ${done.trips} trip${done.trips === 1 ? "" : "s"} · ${money(done.total)}`}
              note={done.warning ?? "It's been routed for approval automatically, same as any finance ticket."}
              shortcuts={[
                { label: "View This Ticket", href: `/finance-tickets/${done.id}`, primary: true },
                { label: "View All My Tickets", href: "/finance-tickets" },
              ]}
            />
            <PillButton variant="ghost" onClick={() => setDone(null)}>
              Back to Mileage Tracker
            </PillButton>
          </div>
        ) : (
          <>
            {error && (
              <div className="mb-4 rounded-2xl px-4 py-3 text-sm" style={{ background: `${rose}12`, border: `1px solid ${rose}40`, color: rose }}>
                {error}
              </div>
            )}

            {/* ---------- start / live trip ---------- */}
            <Card className="mb-8 text-center !py-8">
              {!data ? (
                <div className="text-sm py-10" style={{ color: dim }}>
                  Loading…
                </div>
              ) : active ? (
                <>
                  <Eyebrow color={gold}>
                    <span className="inline-flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full animate-pulse" style={{ background: gold }} /> Trip in progress
                    </span>
                  </Eyebrow>
                  <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 44, fontWeight: 600, color: ink, letterSpacing: "-0.02em" }}>{elapsed(active.started_at, now)}</div>
                  <div className="text-xs mb-1" style={{ color: dim }}>
                    Started {shortWhen(active.started_at)}
                  </div>
                  <div className="text-xs mb-6" style={{ color: faint }}>
                    {gps.points > 1 ? `≈ ${miles(gps.miles)} tracked while this screen was open` : "Miles will be calculated from your route when you end the trip"}
                  </div>

                  <button
                    onClick={endTrip}
                    disabled={busy === "end"}
                    className="mx-auto flex items-center justify-center rounded-full font-bold text-white transition-transform active:scale-95 disabled:opacity-60"
                    style={{ width: 168, height: 168, background: rose, boxShadow: `0 10px 30px ${rose}55`, fontSize: 20 }}
                  >
                    {busy === "end" ? "Ending…" : "End Trip"}
                  </button>

                  <div className="mt-6 flex flex-col items-center gap-3">
                    {wakeSupported && (
                      <label className="flex items-center gap-2 text-xs" style={{ color: dim }}>
                        <input type="checkbox" checked={keepAwake} onChange={(e) => setKeepAwake(e.target.checked)} />
                        Keep screen on (phone on a dash mount)
                      </label>
                    )}
                    <button onClick={() => discard(active)} className="text-xs underline" style={{ color: faint }}>
                      Cancel this trip
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <button
                    onClick={startTrip}
                    disabled={busy === "start"}
                    className="mx-auto flex flex-col items-center justify-center rounded-full font-bold text-white transition-transform active:scale-95 disabled:opacity-60"
                    style={{ width: 176, height: 176, background: emerald, boxShadow: "0 10px 30px rgba(31,111,84,0.35)", fontSize: 20 }}
                  >
                    <svg viewBox="0 0 24 24" width="34" height="34" fill="none" stroke="currentColor" strokeWidth="2" className="mb-1">
                      <path d="M5 17h14M6 17l1.5-5.5A2 2 0 019.4 10h5.2a2 2 0 011.9 1.5L18 17" />
                      <circle cx="8" cy="17" r="2" />
                      <circle cx="16" cy="17" r="2" />
                    </svg>
                    {busy === "start" ? "Finding you…" : "Start Trip"}
                  </button>
                  <p className="text-xs mt-5 max-w-sm mx-auto" style={{ color: dim }}>
                    Tap when you leave, then tap End Trip when you arrive. You can close the app in between. Miles come from the driving route and pay at {money(rate)}/mile.
                  </p>
                </>
              )}
            </Card>

            {/* ---------- trips needing a reason ---------- */}
            {needsReason.length > 0 && (
              <section className="mb-8">
                <Eyebrow color={gold}>Needs a reason · {needsReason.length}</Eyebrow>
                <div className="grid gap-3">
                  {needsReason.map((d) => (
                    <TripRow key={d.id} drive={d} rate={rate} onOpen={() => setSheet({ drive: d, fresh: false })} badge={<span className="text-xs font-bold" style={{ color: gold }}>Add reason →</span>} />
                  ))}
                </div>
              </section>
            )}

            {/* ---------- ready to submit ---------- */}
            <section className="mb-8">
              <div className="flex items-end justify-between gap-2">
                <Eyebrow>Ready to submit · {described.length}</Eyebrow>
                {described.length > 1 && (
                  <button
                    className="text-xs font-semibold mb-1.5"
                    style={{ color: emerald }}
                    onClick={() => setSelected(selected.size === described.length ? new Set() : new Set(described.map((d) => d.id)))}
                  >
                    {selected.size === described.length ? "Clear" : "Select all"}
                  </button>
                )}
              </div>
              {described.length === 0 ? (
                <Card className="!p-5 text-sm text-center" style={{ color: dim }}>
                  Trips you log show up here. Submit them one at a time or batch them up for the month.
                </Card>
              ) : (
                <div className="grid gap-3">
                  {described.map((d) => (
                    <TripRow
                      key={d.id}
                      drive={d}
                      rate={rate}
                      onOpen={() => setSheet({ drive: d, fresh: false })}
                      checked={selected.has(d.id)}
                      onCheck={(v) =>
                        setSelected((s) => {
                          const n = new Set(s);
                          if (v) n.add(d.id);
                          else n.delete(d.id);
                          return n;
                        })
                      }
                    />
                  ))}
                </div>
              )}
            </section>

            {/* ---------- recently submitted ---------- */}
            {(data?.submitted.length ?? 0) > 0 && (
              <section className="mb-28">
                <Eyebrow color={faint}>Recently submitted</Eyebrow>
                <div className="grid gap-2">
                  {data!.submitted.map((d) => (
                    <Link key={d.id} href={d.finance_ticket_id ? `/finance-tickets/${d.finance_ticket_id}` : "/finance-tickets"} className="flex items-center justify-between gap-3 rounded-xl bg-white px-4 py-3 text-sm" style={{ border: "1px solid var(--portal-line)" }}>
                      <div className="min-w-0">
                        <div className="truncate font-semibold" style={{ color: ink }}>
                          {d.purpose}
                        </div>
                        <div className="text-xs" style={{ color: dim }}>
                          {shortWhen(d.started_at)} · {miles(d.miles)}
                        </div>
                      </div>
                      <span className="text-xs font-bold whitespace-nowrap" style={{ color: emerald }}>
                        {d.finance_tickets?.ticket_number ?? "Ticket"} →
                      </span>
                    </Link>
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </div>

      {/* ---------- batch submit bar ---------- */}
      {!done && selectedDrives.length > 0 && !sheet && (
        <div className="fixed inset-x-0 bottom-0 z-30 px-4 pb-[max(16px,env(safe-area-inset-bottom))] pt-3" style={{ background: "linear-gradient(to top, var(--portal-sand) 70%, transparent)" }}>
          <div className="max-w-2xl mx-auto">
            <button
              onClick={() => submit(selectedDrives.map((d) => d.id))}
              disabled={busy === "submit"}
              className="w-full rounded-full py-4 text-[15px] font-bold text-white disabled:opacity-60"
              style={{ background: emerald, boxShadow: "0 8px 24px rgba(31,111,84,0.35)" }}
            >
              {busy === "submit"
                ? "Submitting…"
                : `Submit ${selectedDrives.length} trip${selectedDrives.length === 1 ? "" : "s"} · ${miles(selectedMiles)} · ${money(Math.round(selectedMiles * rate * 100) / 100)}`}
            </button>
          </div>
        </div>
      )}

      {sheet && data && (
        <TripSheet
          key={sheet.drive.id}
          drive={sheet.drive}
          fresh={sheet.fresh}
          offices={data.offices}
          defaultOfficeId={sheet.drive.billing_office_id ?? data.assignedOfficeId}
          rate={rate}
          busy={busy}
          onClose={() => setSheet(null)}
          onDiscard={() => discard(sheet.drive)}
          onSaved={async (drive, submitNow) => {
            if (submitNow) await submit([drive.id]);
            else {
              setSheet(null);
              await load();
            }
          }}
          setBusy={setBusy}
        />
      )}
    </main>
  );
}

function TripRow({
  drive,
  rate,
  onOpen,
  badge,
  checked,
  onCheck,
}: {
  drive: Drive;
  rate: number;
  onOpen: () => void;
  badge?: React.ReactNode;
  checked?: boolean;
  onCheck?: (v: boolean) => void;
}) {
  return (
    <div className="flex items-stretch gap-3 rounded-2xl bg-white" style={{ border: `1px solid ${checked ? emerald : "var(--portal-line)"}`, boxShadow: "0 1px 2px rgba(22,48,43,0.04)" }}>
      {onCheck && (
        <label className="flex items-center pl-4 cursor-pointer">
          <input type="checkbox" checked={!!checked} onChange={(e) => onCheck(e.target.checked)} className="w-5 h-5 accent-[#1F6F54]" />
        </label>
      )}
      <button onClick={onOpen} className={`flex-1 min-w-0 text-left py-3 pr-4 ${onCheck ? "" : "pl-4"}`}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[15px] font-bold truncate" style={{ color: ink }}>
              {drive.purpose || `${place(drive.start_address_line1, drive.start_city, drive.start_state)} → ${place(drive.end_address_line1, drive.end_city, drive.end_state)}`}
            </div>
            <div className="text-xs mt-0.5 truncate" style={{ color: dim }}>
              {shortWhen(drive.started_at)}
              {drive.purpose && ` · ${place(drive.start_address_line1, drive.start_city, drive.start_state)} → ${place(drive.end_address_line1, drive.end_city, drive.end_state)}`}
            </div>
          </div>
          <div className="text-right whitespace-nowrap">
            <div className="text-sm font-bold" style={{ color: ink }}>
              {miles(drive.miles)}
            </div>
            <div className="text-xs" style={{ color: dim }}>
              {money(Math.round(Number(drive.miles ?? 0) * rate * 100) / 100)}
            </div>
          </div>
        </div>
        {(badge || drive.round_trip || drive.miles_adjusted || drive.route_provider === "straight_line") && (
          <div className="flex flex-wrap gap-2 mt-2 text-[11px]" style={{ color: faint }}>
            {drive.round_trip && <span>Round trip</span>}
            {drive.miles_adjusted && <span style={{ color: gold }}>Miles adjusted</span>}
            {drive.route_provider === "straight_line" && <span style={{ color: gold }}>Estimated distance</span>}
            {badge}
          </div>
        )}
      </button>
    </div>
  );
}

function TripSheet({
  drive,
  fresh,
  offices,
  defaultOfficeId,
  rate,
  busy,
  setBusy,
  onClose,
  onDiscard,
  onSaved,
}: {
  drive: Drive;
  fresh: boolean;
  offices: Office[];
  defaultOfficeId: string | null;
  rate: number;
  busy: string | null;
  setBusy: (b: string | null) => void;
  onClose: () => void;
  onDiscard: () => void;
  onSaved: (d: Drive, submitNow: boolean) => Promise<void>;
}) {
  const [purpose, setPurpose] = useState(drive.purpose ?? "");
  const [officeId, setOfficeId] = useState(defaultOfficeId ?? "");
  const [program, setProgram] = useState(drive.billing_program ?? "");
  const [roundTrip, setRoundTrip] = useState(drive.round_trip);
  const [editMiles, setEditMiles] = useState(drive.miles_adjusted);
  const [milesInput, setMilesInput] = useState(drive.miles_adjusted ? String(drive.miles ?? "") : "");
  const [reason, setReason] = useState(drive.adjusted_reason ?? "");
  const [err, setErr] = useState<string | null>(null);

  const routeMiles = Number(drive.route_miles ?? 0);
  const computed = Math.round(routeMiles * (roundTrip ? 2 : 1) * 100) / 100;
  const claimed = editMiles && milesInput !== "" ? Number(milesInput) : computed;
  const differs = editMiles && milesInput !== "" && Math.abs(Number(milesInput) - computed) >= 0.1;

  async function save(submitNow: boolean) {
    setErr(null);
    if (purpose.trim().length < 3) {
      setErr("Tell Finance why you made this trip.");
      return;
    }
    if (differs && !reason.trim()) {
      setErr("Add a short note on why the miles differ from the tracked route.");
      return;
    }
    setBusy("save");
    try {
      const res = await fetch(`/api/mileage/drives/${drive.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "describe",
          purpose,
          billing_office_id: officeId || null,
          billing_program: program,
          round_trip: roundTrip,
          miles: editMiles && milesInput !== "" ? Number(milesInput) : null,
          adjusted_reason: differs ? reason : null,
        }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "Couldn't save");
      await onSaved(d.drive, submitNow);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn't save");
    } finally {
      setBusy(null);
    }
  }

  const field = "w-full rounded-xl px-3 py-2.5 text-[15px] outline-none bg-white";
  const fieldStyle = { border: "1.5px solid var(--portal-line)", color: ink };

  return (
    <div className="fixed inset-0 z-40 flex items-end sm:items-center justify-center" style={{ background: "rgba(22,48,43,0.35)" }} onClick={onClose}>
      <div
        className="w-full sm:max-w-lg max-h-[92vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl px-5 pt-5 pb-[max(20px,env(safe-area-inset-bottom))]"
        style={{ background: "var(--portal-sand)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-4 h-1 w-10 rounded-full sm:hidden" style={{ background: "rgba(22,48,43,0.2)" }} />
        <Eyebrow>{fresh ? "Trip ended" : "Trip details"}</Eyebrow>
        <div className="flex items-end justify-between gap-3 mb-4">
          <div style={{ fontFamily: "'Fraunces', serif", fontStyle: "italic", fontWeight: 500, fontSize: 32, color: ink, lineHeight: 1 }}>{miles(claimed)}</div>
          <div className="text-right text-sm font-bold" style={{ color: emerald }}>
            {money(Math.round((Number.isFinite(claimed) ? claimed : 0) * rate * 100) / 100)}
            <div className="text-[11px] font-normal" style={{ color: dim }}>
              at {money(rate)}/mi
            </div>
          </div>
        </div>

        <div className="rounded-2xl bg-white p-4 mb-4 text-sm" style={{ border: "1px solid var(--portal-line)" }}>
          <div className="flex gap-3">
            <div className="flex flex-col items-center pt-1.5">
              <span className="w-2.5 h-2.5 rounded-full" style={{ background: emerald }} />
              <span className="w-px flex-1 my-1" style={{ background: "var(--portal-line)" }} />
              <span className="w-2.5 h-2.5 rounded-full" style={{ background: rose }} />
            </div>
            <div className="min-w-0 flex-1 grid gap-3">
              <div>
                <div className="font-semibold truncate" style={{ color: ink }}>
                  {place(drive.start_address_line1, drive.start_city, drive.start_state)}
                </div>
                <div className="text-xs" style={{ color: dim }}>
                  {shortWhen(drive.started_at)}
                </div>
              </div>
              <div>
                <div className="font-semibold truncate" style={{ color: ink }}>
                  {place(drive.end_address_line1, drive.end_city, drive.end_state)}
                </div>
                <div className="text-xs" style={{ color: dim }}>
                  {drive.ended_at ? shortWhen(drive.ended_at) : ""}
                </div>
              </div>
            </div>
          </div>
          <div className="text-[11px] mt-3" style={{ color: faint }}>
            Route: {miles(routeMiles)}
            {drive.gps_miles != null && ` · GPS while open: ${miles(drive.gps_miles)}`}
            {drive.route_provider === "straight_line" && " · route lookup failed, this is an estimate"}
          </div>
        </div>

        <label className="block mb-3">
          <div className="text-[13px] font-semibold mb-1.5" style={{ color: ink }}>
            Why did you make this trip? <span style={{ color: rose }}>*</span>
          </div>
          <textarea
            autoFocus={fresh}
            rows={3}
            value={purpose}
            onChange={(e) => setPurpose(e.target.value)}
            placeholder="e.g. Picked up food bank delivery for Saturday distribution"
            className={field}
            style={fieldStyle}
          />
        </label>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
          <label className="block">
            <div className="text-[13px] font-semibold mb-1.5" style={{ color: ink }}>
              Billing office
            </div>
            <select value={officeId} onChange={(e) => setOfficeId(e.target.value)} className={field} style={fieldStyle}>
              <option value="">Select…</option>
              {offices.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.field_office}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <div className="text-[13px] font-semibold mb-1.5" style={{ color: ink }}>
              Program <span className="font-normal" style={{ color: faint }}>(optional)</span>
            </div>
            <input value={program} onChange={(e) => setProgram(e.target.value)} placeholder="e.g. Hunger Prevention" className={field} style={fieldStyle} />
          </label>
        </div>

        <label className="flex items-center justify-between gap-3 rounded-xl bg-white px-4 py-3 mb-3" style={{ border: "1px solid var(--portal-line)" }}>
          <div>
            <div className="text-sm font-semibold" style={{ color: ink }}>
              Round trip
            </div>
            <div className="text-xs" style={{ color: dim }}>
              Doubles the route miles if you're driving back the same way
            </div>
          </div>
          <input type="checkbox" checked={roundTrip} onChange={(e) => setRoundTrip(e.target.checked)} className="w-5 h-5 accent-[#1F6F54]" />
        </label>

        {!editMiles ? (
          <button className="text-xs underline mb-4" style={{ color: dim }} onClick={() => { setEditMiles(true); setMilesInput(String(computed)); }}>
            Miles look wrong? Adjust them
          </button>
        ) : (
          <div className="grid gap-2 mb-4">
            <label className="block">
              <div className="text-[13px] font-semibold mb-1.5" style={{ color: ink }}>
                Miles to claim
              </div>
              <input type="number" inputMode="decimal" step="0.1" min="0" value={milesInput} onChange={(e) => setMilesInput(e.target.value)} className={field} style={fieldStyle} />
            </label>
            {differs && (
              <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why it differs (e.g. detour for road closure) *" className={field} style={fieldStyle} />
            )}
            <div className="text-[11px]" style={{ color: faint }}>
              Adjusted miles are flagged for Finance with your note.
            </div>
          </div>
        )}

        {err && (
          <div className="mb-3 text-sm" style={{ color: rose }}>
            {err}
          </div>
        )}

        <div className="grid gap-2">
          <button
            onClick={() => save(true)}
            disabled={!!busy}
            className="w-full rounded-full py-3.5 text-[15px] font-bold text-white disabled:opacity-60"
            style={{ background: emerald, boxShadow: "0 6px 18px rgba(31,111,84,0.3)" }}
          >
            {busy === "save" || busy === "submit" ? "Submitting…" : "Submit for reimbursement"}
          </button>
          <button onClick={() => save(false)} disabled={!!busy} className="w-full rounded-full py-3 text-sm font-bold bg-white disabled:opacity-60" style={{ border: "1.5px solid var(--portal-line)", color: ink }}>
            Save and submit later with other trips
          </button>
          <div className="flex justify-between pt-1">
            <button onClick={onClose} className="text-xs" style={{ color: dim }}>
              Close
            </button>
            <button onClick={onDiscard} className="text-xs" style={{ color: rose }}>
              Not a work trip — remove
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
