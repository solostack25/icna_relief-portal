"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import PortalHeader from "@/app/PortalHeader";
import MobileTabBar from "@/components/MobileTabBar";
import {
  LEAVE_COLORS,
  LEAVE_LABEL,
  LEAVE_TYPES,
  STATUS_STYLE,
  addDays,
  adpStatusLabel,
  defaultHours,
  formatHours,
  formatRange,
  shortDate,
  workdaysBetween,
  type LeaveType,
  type RequestStatus,
  type WeekRow,
} from "@/lib/timeOffShared";

export type MyRequest = {
  id: string;
  leave_type: LeaveType;
  start_date: string;
  end_date: string;
  hours: number;
  note: string | null;
  status: RequestStatus;
  approver_email: string | null;
  adp_sync_status: string;
  created_at: string;
  decision_note: string | null;
};

type Balance = { leave_type: LeaveType; hours: number; as_of: string; source: string };

const card = { background: "#fff", border: "1px solid var(--portal-line)", boxShadow: "0 1px 2px rgba(22,48,43,0.04)" } as const;
const dim = { color: "rgba(22,48,43,0.68)" } as const;
const heading = { fontFamily: "'Fraunces', serif", fontStyle: "italic", fontWeight: 500 } as const;

export default function TimeClient({
  firstName,
  requests: initialRequests,
  balances,
  week,
  today,
  approverName,
  isManager,
  teamWaiting,
  adpConnected,
  isAdmin,
}: {
  firstName: string;
  requests: MyRequest[];
  balances: Balance[];
  week: WeekRow;
  today: string;
  approverName: string | null;
  isManager: boolean;
  teamWaiting: number;
  adpConnected: boolean;
  isAdmin: boolean;
}) {
  const [requests, setRequests] = useState<MyRequest[]>(initialRequests);
  const [type, setType] = useState<LeaveType>("vacation");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [hoursText, setHoursText] = useState("");
  const [hoursEdited, setHoursEdited] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null | undefined>(undefined);

  const balanceBy = useMemo(() => new Map(balances.map((b) => [b.leave_type, b])), [balances]);
  const autoHours = start && end ? defaultHours(start, end) : 0;
  const hours = hoursEdited ? Number(hoursText) : autoHours;
  const days = start && end ? workdaysBetween(start, end) : 0;
  const bal = balanceBy.get(type);
  const pendingSameType = requests.filter((r) => r.leave_type === type && r.status === "pending").reduce((s, r) => s + Number(r.hours), 0);
  const left = bal ? bal.hours - pendingSameType - (hours || 0) : null;

  function setDates(s: string, e: string) {
    setStart(s);
    setEnd(e && s && e < s ? s : e);
    if (!hoursEdited) setHoursText("");
  }

  async function submit() {
    setError(null);
    if (!start || !end) return setError("Pick a start and end date.");
    if (!hours || hours <= 0) return setError("Enter how many hours.");
    setBusy(true);
    const res = await fetch("/api/time-off", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ leave_type: type, start_date: start, end_date: end, hours, note }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setError(data.error ?? "Couldn't send the request.");
    setRequests((r) => [data.request as MyRequest, ...r].sort((a, b) => (a.start_date < b.start_date ? 1 : -1)));
    setSentTo(data.routedTo ?? null);
    setStart("");
    setEnd("");
    setNote("");
    setHoursText("");
    setHoursEdited(false);
  }

  async function cancel(id: string) {
    const res = await fetch(`/api/time-off/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "cancel" }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return alert(data.error ?? "Couldn't cancel.");
    setRequests((r) => r.map((x) => (x.id === id ? { ...x, status: "cancelled" } : x)));
  }

  const upcoming = requests.filter((r) => r.end_date >= today && r.status !== "cancelled");
  const past = requests.filter((r) => r.end_date < today || r.status === "cancelled");

  return (
    <main style={{ minHeight: "100vh", background: "var(--portal-sand)" }}>
      <PortalHeader />
      <div className="max-w-4xl mx-auto px-4 sm:px-10 py-6 sm:py-10">
        <div className="flex flex-wrap items-end justify-between gap-3 mb-6">
          <div>
            <Link href="/select-app" className="hidden sm:inline-block text-sm mb-2" style={{ color: "var(--portal-emerald)" }}>
              ← Home
            </Link>
            <h1 className="m-0" style={{ ...heading, fontSize: "clamp(28px, 5vw, 38px)", color: "var(--portal-ink)" }}>
              Time off
            </h1>
            <p className="text-sm mt-1 mb-0" style={dim}>
              {approverName ? `Requests go to ${approverName} for approval.` : "Requests go to your supervisor for approval."}
            </p>
          </div>
          <span
            className="inline-flex items-center gap-1.5 text-xs font-semibold rounded-full px-3 py-1.5"
            style={adpConnected ? { color: "#1F6F54", background: "#EAF3EF" } : { color: "#7A5A12", background: "#FBF0DC" }}
          >
            {adpConnected ? "Connected to ADP" : "ADP not connected yet: approved time off is saved and sent once it is"}
          </span>
        </div>

        {isManager && (
          <Link
            href="/time/team"
            className="flex items-center justify-between gap-3 rounded-2xl px-5 py-4 mb-6 transition-transform hover:-translate-y-0.5"
            style={{ background: "var(--portal-emerald)", color: "var(--portal-sand)" }}
          >
            <span>
              <span className="block text-[15px] font-semibold">Team time</span>
              <span className="block text-[13px]" style={{ color: "rgba(251,247,239,0.78)" }}>
                Approve time off and weekly timesheets
              </span>
            </span>
            <span className="flex items-center gap-2 text-sm font-semibold">
              {teamWaiting > 0 && (
                <span className="rounded-full px-2.5 py-0.5" style={{ background: "var(--portal-gold-soft)", color: "var(--portal-ink)" }}>
                  {teamWaiting} waiting
                </span>
              )}
              →
            </span>
          </Link>
        )}

        {/* Balances */}
        <div className="grid grid-cols-3 gap-2.5 mb-2">
          {LEAVE_TYPES.map((lt, i) => {
            const b = balanceBy.get(lt.key);
            const first = i === 0;
            return (
              <div
                key={lt.key}
                className="rounded-2xl px-4 py-3"
                style={first ? { background: "var(--portal-emerald)", color: "var(--portal-sand)" } : card}
              >
                <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 22, fontWeight: 500 }}>{b ? `${formatHours(b.hours)}h` : "—"}</div>
                <div className="text-xs" style={first ? { color: "rgba(251,247,239,0.75)" } : dim}>
                  {lt.label}
                </div>
              </div>
            );
          })}
        </div>
        <p className="text-xs mb-8" style={dim}>
          {balances.length
            ? `Balances as of ${new Date(Math.max(...balances.map((b) => new Date(b.as_of).getTime()))).toLocaleDateString("en-US", { month: "short", day: "numeric" })}${balances.some((b) => b.source === "adp") ? " from ADP" : ""}.`
            : "Your balances will show here once ADP is connected. You can still send requests."}
        </p>

        <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)] items-start">
          {/* New request */}
          <section aria-labelledby="new-req" className="rounded-3xl p-5" style={card}>
            <h2 id="new-req" className="text-base font-semibold m-0 mb-4" style={{ color: "var(--portal-ink)" }}>
              New request
            </h2>

            {sentTo !== undefined && (
              <div role="status" className="rounded-2xl px-4 py-3 mb-4 text-sm" style={{ background: "#EAF3EF", border: "1px solid #CFE0D7", color: "var(--portal-ink)" }}>
                <strong className="block mb-0.5">Request sent</strong>
                {sentTo
                  ? `${approverName ?? sentTo} will get an email. Once approved, it goes to ADP and your balance updates.`
                  : "There's no supervisor on file for you yet, so an admin will review it. Ask IT to set your manager in Microsoft 365."}
              </div>
            )}

            <div role="group" aria-label="Type of time off" className="flex gap-1 rounded-full p-1 mb-4" style={{ background: "var(--portal-sand)" }}>
              {LEAVE_TYPES.map((lt) => {
                const on = type === lt.key;
                return (
                  <button
                    key={lt.key}
                    type="button"
                    aria-pressed={on}
                    onClick={() => setType(lt.key)}
                    className="flex-1 rounded-full text-sm font-semibold"
                    style={{
                      minHeight: 40,
                      background: on ? "#fff" : "transparent",
                      color: on ? "var(--portal-emerald)" : "rgba(22,48,43,0.68)",
                      boxShadow: on ? "0 2px 8px rgba(22,48,43,0.10)" : "none",
                    }}
                  >
                    {lt.label}
                  </button>
                );
              })}
            </div>

            <div className="grid grid-cols-2 gap-3 mb-3">
              <Field label="From" id="to-start">
                <input id="to-start" type="date" value={start} min={addDays(today, -30)} onChange={(e) => setDates(e.target.value, end || e.target.value)} className="to-input" />
              </Field>
              <Field label="To" id="to-end">
                <input id="to-end" type="date" value={end} min={start || undefined} onChange={(e) => setDates(start || e.target.value, e.target.value)} className="to-input" />
              </Field>
            </div>

            <div className="grid grid-cols-[120px_minmax(0,1fr)] gap-3 items-end mb-3">
              <Field label="Hours" id="to-hours">
                <input
                  id="to-hours"
                  type="number"
                  inputMode="decimal"
                  min={0.5}
                  step={0.5}
                  value={hoursEdited ? hoursText : autoHours || ""}
                  onChange={(e) => {
                    setHoursEdited(true);
                    setHoursText(e.target.value);
                  }}
                  className="to-input"
                />
              </Field>
              <div className="rounded-xl px-3 py-2.5 text-sm" style={{ background: "var(--portal-sand)", color: "var(--portal-ink)", minHeight: 44 }}>
                {days > 0 ? `${days} workday${days === 1 ? "" : "s"}` : "Pick dates"}
                {left !== null && days > 0 && (
                  <span className="block text-xs" style={left < 0 ? { color: "#9A3412" } : dim}>
                    {left >= 0 ? `Leaves ${formatHours(left)}h of ${LEAVE_LABEL[type].toLowerCase()}` : `${formatHours(-left)}h more than your balance (would be unpaid)`}
                  </span>
                )}
              </div>
            </div>

            <Field label="Note for your supervisor (optional)" id="to-note">
              <input id="to-note" type="text" maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Family trip" className="to-input" />
            </Field>

            {error && (
              <p role="alert" className="text-sm mt-3 mb-0" style={{ color: "#A4262C" }}>
                {error}
              </p>
            )}

            <button
              type="button"
              onClick={submit}
              disabled={busy}
              className="w-full rounded-full text-[15px] font-semibold mt-4 disabled:opacity-60"
              style={{ minHeight: 48, background: "var(--portal-emerald)", color: "#fff" }}
            >
              {busy ? "Sending…" : approverName ? `Send to ${approverName.split(" ")[0]}` : "Send request"}
            </button>
          </section>

          <div className="flex flex-col gap-6">
            {/* This week */}
            <section aria-labelledby="this-week" className="rounded-3xl p-5" style={card}>
              <div className="flex items-baseline justify-between gap-3 mb-3">
                <h2 id="this-week" className="text-base font-semibold m-0" style={{ color: "var(--portal-ink)" }}>
                  This week
                </h2>
                <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 18, color: "var(--portal-ink)" }}>{formatHours(week.totalHours)}h</span>
              </div>
              <div className="grid grid-cols-7 gap-1 text-center">
                {week.days.map((d) => (
                  <div key={d.date} className="flex flex-col gap-1">
                    <span className="text-[11px]" style={dim}>
                      {shortDate(d.date).split(",")[0]}
                    </span>
                    <span
                      className="rounded-lg py-1.5 text-xs"
                      style={{
                        fontFamily: "'IBM Plex Mono', monospace",
                        background: d.missedPunch ? "#FCE7DD" : d.timeOff ? LEAVE_COLORS[d.timeOff].bg : d.date === today ? "#EAF3EF" : "var(--portal-sand)",
                        color: d.missedPunch ? "#9A3412" : "var(--portal-ink)",
                      }}
                      title={d.missedPunch ? "Missed punch: you didn't clock out" : d.timeOff ? `${LEAVE_LABEL[d.timeOff]} time off` : undefined}
                    >
                      {d.missedPunch ? "?" : d.open ? "•" : d.hours + d.timeOffHours > 0 ? formatHours(Math.round((d.hours + d.timeOffHours) * 10) / 10) : "–"}
                    </span>
                  </div>
                ))}
              </div>
              {week.missedPunch && (
                <p className="text-xs mt-3 mb-0" style={{ color: "#9A3412" }}>
                  You have a missed punch this week. Let your supervisor know the right time so your timesheet can be approved.
                </p>
              )}
            </section>

            {/* My requests */}
            <section aria-labelledby="my-reqs">
              <h2 id="my-reqs" className="text-base font-semibold m-0 mb-3" style={{ color: "var(--portal-ink)" }}>
                My requests
              </h2>
              {upcoming.length === 0 && past.length === 0 && (
                <p className="text-sm m-0" style={dim}>
                  No requests yet.
                </p>
              )}
              <div className="flex flex-col gap-2">
                {[...upcoming, ...past.slice(0, 8)].map((r) => {
                  const st = STATUS_STYLE[r.status];
                  const adp = r.status === "approved" ? adpStatusLabel(r.adp_sync_status) : "";
                  return (
                    <div key={r.id} className="rounded-2xl px-4 py-3 flex items-center justify-between gap-3" style={{ ...card, opacity: r.status === "cancelled" ? 0.7 : 1 }}>
                      <div className="min-w-0">
                        <div className="text-[15px] font-semibold" style={{ color: "var(--portal-ink)" }}>
                          {formatRange(r.start_date, r.end_date)}
                        </div>
                        <div className="text-[13px]" style={dim}>
                          {LEAVE_LABEL[r.leave_type]} · {formatHours(Number(r.hours))} hours
                          {adp && ` · ${adp}`}
                        </div>
                        {r.decision_note && (
                          <div className="text-[13px] mt-0.5" style={dim}>
                            “{r.decision_note}”
                          </div>
                        )}
                      </div>
                      <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                        <span className="text-xs font-semibold rounded-full px-2.5 py-1" style={{ color: st.fg, background: st.bg }}>
                          {st.label}
                        </span>
                        {r.status === "pending" && (
                          <button type="button" onClick={() => cancel(r.id)} className="text-xs underline" style={dim}>
                            Cancel
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          </div>
        </div>

        {isAdmin && !adpConnected && (
          <p className="text-xs mt-8" style={dim}>
            Admin: add ADP credentials under{" "}
            <Link href="/admin/connectors#adp" className="underline">
              Admin › Connectors › ADP
            </Link>
            .
          </p>
        )}
      </div>

      <MobileTabBar active="time" showAdmin={isAdmin} />

      <style jsx>{`
        :global(.to-input) {
          width: 100%;
          min-height: 44px;
          box-sizing: border-box;
          border: 1px solid var(--portal-line);
          border-radius: 12px;
          padding: 9px 12px;
          font: inherit;
          font-size: 16px;
          color: var(--portal-ink);
          background: #fff;
        }
        :global(.to-input:focus) {
          outline: 2px solid var(--portal-emerald);
          outline-offset: 1px;
        }
      `}</style>
    </main>
  );
}

function Field({ label, id, children }: { label: string; id: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-[13px] font-semibold" style={{ color: "rgba(22,48,43,0.8)" }}>
        {label}
      </label>
      {children}
    </div>
  );
}
