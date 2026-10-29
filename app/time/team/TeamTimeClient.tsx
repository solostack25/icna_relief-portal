"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import PortalHeader from "@/app/PortalHeader";
import MobileTabBar from "@/components/MobileTabBar";
import {
  LEAVE_COLORS,
  LEAVE_LABEL,
  OVERTIME_HOURS,
  STATUS_STYLE,
  addDays,
  adpStatusLabel,
  formatHours,
  formatRange,
  shortDate,
  weekDays,
  type LeaveType,
  type RequestStatus,
  type WeekRow,
} from "@/lib/timeOffShared";

export type TeamRequest = {
  id: string;
  employeeName: string;
  jobTitle: string | null;
  leave_type: LeaveType;
  start_date: string;
  end_date: string;
  hours: number;
  note: string | null;
  status: RequestStatus;
  adp_sync_status: string;
  balanceLeft: number | null;
  clashes: string[];
  noApprover: boolean;
};

export type OutItem = { id: string; name: string; start_date: string; end_date: string; pending: boolean };

export type SheetRow = {
  employeeId: string;
  name: string;
  jobTitle: string | null;
  week: WeekRow;
  approved: { total: number; adp: string } | null;
};

const card = { background: "#fff", border: "1px solid var(--portal-line)", boxShadow: "0 1px 2px rgba(22,48,43,0.04)" } as const;
const dim = { color: "rgba(22,48,43,0.68)" } as const;

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
}

export default function TeamTimeClient({
  tab,
  requests: initialRequests,
  out,
  weekStart,
  thisWeekStart,
  today,
  sheetRows,
  teamSize,
  allStaff,
  adpConnected,
  isAdmin,
}: {
  tab: "timeoff" | "timesheets";
  requests: TeamRequest[];
  out: OutItem[];
  weekStart: string;
  thisWeekStart: string;
  today: string;
  sheetRows: SheetRow[];
  teamSize: number;
  allStaff: boolean;
  adpConnected: boolean;
  isAdmin: boolean;
}) {
  const router = useRouter();
  const [requests, setRequests] = useState(initialRequests);
  const [approved, setApproved] = useState<Record<string, { total: number; adp: string } | null>>(
    Object.fromEntries(sheetRows.map((r) => [r.employeeId, r.approved]))
  );
  const [busy, setBusy] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  const pending = requests.filter((r) => r.status === "pending");
  const decided = requests.filter((r) => r.status !== "pending");

  async function decide(id: string, action: "approve" | "deny" | "reopen") {
    let note: string | null = null;
    if (action === "deny") {
      note = window.prompt("Reason for denying (optional, sent to them):") ?? null;
    }
    setBusy(id);
    const res = await fetch(`/api/time-off/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, note }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(null);
    if (!res.ok) return setFlash(data.error ?? "That didn't go through.");
    setRequests((rs) => rs.map((r) => (r.id === id ? { ...r, status: data.status, adp_sync_status: data.adp_sync_status ?? "not_sent" } : r)));
  }

  async function sheets(action: "approve" | "undo", ids: string[]) {
    if (!ids.length) return;
    setBusy(`ts:${ids.join(",")}`);
    const res = await fetch("/api/timesheets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, week_start: weekStart, employee_ids: ids }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(null);
    if (!res.ok) return setFlash(data.error ?? "That didn't go through.");
    setApproved((a) => {
      const next = { ...a };
      if (action === "approve") {
        for (const id of data.approved as string[]) {
          const row = sheetRows.find((r) => r.employeeId === id);
          next[id] = { total: row?.week.totalHours ?? 0, adp: "queued" };
        }
      } else {
        for (const id of data.undone as string[]) next[id] = null;
      }
      return next;
    });
    if (data.skipped?.length) setFlash(`${data.skipped.length} skipped: fix the missed punch first.`);
  }

  const cleanIds = sheetRows.filter((r) => !approved[r.employeeId] && !r.week.missedPunch && r.week.overtimeHours === 0 && r.week.totalHours > 0).map((r) => r.employeeId);
  const flagged = sheetRows.filter((r) => !approved[r.employeeId] && (r.week.missedPunch || r.week.overtimeHours > 0)).length;
  const approvedCount = sheetRows.filter((r) => approved[r.employeeId]).length;
  const goWeek = (w: string) => router.push(`/time/team?tab=timesheets&week=${w}`);

  return (
    <main style={{ minHeight: "100vh", background: "var(--portal-sand)" }}>
      <PortalHeader />
      <div className="max-w-6xl mx-auto px-4 sm:px-10 py-6 sm:py-10">
        <div className="flex flex-wrap items-end justify-between gap-3 mb-5">
          <div>
            <Link href="/time" className="hidden sm:inline-block text-sm mb-2" style={{ color: "var(--portal-emerald)" }}>
              ← My time off
            </Link>
            <h1 className="m-0" style={{ fontFamily: "'Fraunces', serif", fontStyle: "italic", fontWeight: 500, fontSize: "clamp(28px, 5vw, 38px)", color: "var(--portal-ink)" }}>
              Team time
            </h1>
            <p className="text-sm mt-1 mb-0" style={dim}>
              {allStaff ? "Showing all staff (admin view: no one reports to you in Microsoft 365)." : `${teamSize} ${teamSize === 1 ? "person reports" : "people report"} to you`}
            </p>
          </div>
          {!adpConnected && (
            <span className="inline-flex items-center gap-2 text-xs font-semibold rounded-full px-3 py-1.5" style={{ color: "#7A5A12", background: "#FBF0DC" }}>
              ADP not connected yet. Approvals are saved and sync once credentials are added.
            </span>
          )}
        </div>

        <nav aria-label="Team time sections" className="flex flex-wrap gap-2 mb-5">
          <TabLink href="/time/team" on={tab === "timeoff"} label="Time off" count={pending.length} />
          <TabLink href={`/time/team?tab=timesheets&week=${weekStart}`} on={tab === "timesheets"} label="Timesheets" count={flagged} />
        </nav>

        {flash && (
          <div role="alert" className="rounded-2xl px-4 py-3 mb-4 text-sm flex items-center justify-between gap-3" style={{ background: "#FCE7DD", color: "#9A3412" }}>
            {flash}
            <button type="button" onClick={() => setFlash(null)} className="underline text-xs">
              Dismiss
            </button>
          </div>
        )}

        {tab === "timeoff" ? (
          <div className="flex flex-wrap gap-6 items-start">
            <section aria-label="Time off requests" className="flex flex-col gap-3.5" style={{ flex: "999 1 520px", minWidth: 0 }}>
              {pending.length === 0 && (
                <div className="rounded-3xl px-5 py-8 text-center text-sm" style={{ ...card, ...dim }}>
                  Nothing waiting on you.
                </div>
              )}
              {[...pending, ...decided].map((r) => {
                const tc = LEAVE_COLORS[r.leave_type];
                const st = STATUS_STYLE[r.status];
                const isPending = r.status === "pending";
                return (
                  <article key={r.id} className="rounded-3xl px-5 py-4 flex flex-col gap-3" style={{ ...card, borderColor: isPending ? "var(--portal-line)" : r.status === "approved" ? "#CFE0D7" : "#EAD9D0" }}>
                    <div className="flex items-start gap-3.5">
                      <span aria-hidden className="w-11 h-11 rounded-full flex items-center justify-center text-sm font-semibold flex-shrink-0" style={{ background: "#EAF3EF", color: "var(--portal-emerald)" }}>
                        {initials(r.employeeName)}
                      </span>
                      <div className="flex-1 min-w-0 flex flex-col gap-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-base font-semibold" style={{ color: "var(--portal-ink)" }}>
                            {r.employeeName}
                          </span>
                          {r.jobTitle && (
                            <span className="text-[13px]" style={dim}>
                              {r.jobTitle}
                            </span>
                          )}
                          <span className="text-xs font-semibold rounded-full px-2.5 py-0.5" style={{ color: tc.fg, background: tc.bg }}>
                            {LEAVE_LABEL[r.leave_type]}
                          </span>
                        </div>
                        <span className="text-[15px]" style={{ color: "var(--portal-ink)" }}>
                          {formatRange(r.start_date, r.end_date)} · {formatHours(r.hours)} hours
                        </span>
                        {r.note && (
                          <span className="text-sm" style={dim}>
                            “{r.note}”
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      {r.balanceLeft !== null && (
                        <span className="text-[13px] rounded-full px-3 py-1" style={r.balanceLeft < 0 ? { color: "#9A3412", background: "#FCE7DD" } : { color: "var(--portal-ink)", background: "var(--portal-sand)" }}>
                          {r.balanceLeft >= 0 ? `Leaves ${formatHours(r.balanceLeft)}h of ${LEAVE_LABEL[r.leave_type].toLowerCase()}` : `${formatHours(-r.balanceLeft)} hours would be unpaid`}
                        </span>
                      )}
                      {r.clashes.length > 0 && (
                        <span className="text-[13px] rounded-full px-3 py-1" style={{ color: "#9A3412", background: "#FCE7DD" }}>
                          Also out: {r.clashes.join(", ")}
                        </span>
                      )}
                      {r.noApprover && (
                        <span className="text-[13px] rounded-full px-3 py-1" style={{ color: "#7A5A12", background: "#FBF0DC" }}>
                          No supervisor on file
                        </span>
                      )}
                    </div>

                    {isPending ? (
                      <div className="flex justify-end gap-2.5">
                        <button
                          type="button"
                          disabled={busy === r.id}
                          onClick={() => decide(r.id, "deny")}
                          className="rounded-full bg-white px-5 text-[15px] font-semibold disabled:opacity-60"
                          style={{ minHeight: 44, border: "1px solid var(--portal-line)", color: "var(--portal-ink)" }}
                        >
                          Deny
                        </button>
                        <button
                          type="button"
                          disabled={busy === r.id}
                          onClick={() => decide(r.id, "approve")}
                          className="rounded-full px-6 text-[15px] font-semibold disabled:opacity-60"
                          style={{ minHeight: 44, background: "var(--portal-emerald)", color: "#fff" }}
                        >
                          Approve
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between gap-3 pt-3" style={{ borderTop: "1px solid rgba(22,48,43,0.08)" }}>
                        <span className="text-sm font-semibold" style={{ color: st.fg }}>
                          {st.label}
                          {r.status === "approved" && adpStatusLabel(r.adp_sync_status) ? ` · ${adpStatusLabel(r.adp_sync_status)}` : ""}
                        </span>
                        {r.adp_sync_status !== "sent" && r.status !== "cancelled" && (
                          <button
                            type="button"
                            disabled={busy === r.id}
                            onClick={() => decide(r.id, "reopen")}
                            className="rounded-full bg-white px-3.5 text-sm"
                            style={{ minHeight: 40, border: "1px solid var(--portal-line)", color: "rgba(22,48,43,0.8)" }}
                          >
                            Undo
                          </button>
                        )}
                      </div>
                    )}
                  </article>
                );
              })}
            </section>

            <aside aria-labelledby="who-out" className="rounded-3xl px-5 py-5" style={{ ...card, flex: "1 1 280px" }}>
              <h2 id="who-out" className="text-base font-semibold m-0" style={{ color: "var(--portal-ink)" }}>
                Who is out
              </h2>
              <p className="text-[13px] mt-1 mb-4" style={dim}>
                Approved and pending, next 6 weeks
              </p>
              {out.length === 0 ? (
                <p className="text-sm m-0" style={dim}>
                  No one.
                </p>
              ) : (
                <ul className="flex flex-col gap-3 m-0 p-0 list-none">
                  {out.map((o) => (
                    <li key={o.id} className="flex items-center gap-3">
                      <span className="text-xs font-semibold rounded-lg text-center py-1.5 flex-shrink-0" style={{ width: 64, color: "var(--portal-emerald)", background: "#EAF3EF" }}>
                        {shortDate(o.start_date, false).toUpperCase()}
                      </span>
                      <span className="text-sm" style={{ color: "var(--portal-ink)" }}>
                        {o.name}
                        {o.start_date !== o.end_date && <span style={dim}> to {shortDate(o.end_date, false)}</span>}
                        {o.pending && <span style={{ color: "#7A5A12" }}> · pending</span>}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </aside>
          </div>
        ) : (
          <section aria-labelledby="ts-week" className="rounded-3xl px-4 sm:px-5 py-5" style={card}>
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              <div className="flex items-center gap-2">
                <button type="button" aria-label="Previous week" onClick={() => goWeek(addDays(weekStart, -7))} className="w-10 h-10 rounded-full bg-white flex items-center justify-center" style={{ border: "1px solid var(--portal-line)" }}>
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="M15 6l-6 6 6 6" />
                  </svg>
                </button>
                <h2 id="ts-week" className="text-[17px] font-semibold m-0" style={{ color: "var(--portal-ink)" }}>
                  Week of {shortDate(weekStart, false)} – {shortDate(addDays(weekStart, 6), false)}
                  {weekStart === thisWeekStart && <span className="text-sm font-normal" style={dim}> (this week)</span>}
                </h2>
                <button
                  type="button"
                  aria-label="Next week"
                  disabled={weekStart >= thisWeekStart}
                  onClick={() => goWeek(addDays(weekStart, 7))}
                  className="w-10 h-10 rounded-full bg-white flex items-center justify-center disabled:opacity-40"
                  style={{ border: "1px solid var(--portal-line)" }}
                >
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="M9 6l6 6-6 6" />
                  </svg>
                </button>
              </div>
              <div className="flex items-center gap-3 flex-wrap">
                <span className="text-sm" style={dim}>
                  {approvedCount} of {sheetRows.length} approved
                </span>
                <button
                  type="button"
                  disabled={cleanIds.length === 0 || !!busy}
                  onClick={() => sheets("approve", cleanIds)}
                  className="rounded-full px-5 text-[15px] font-semibold disabled:opacity-50"
                  style={{ minHeight: 44, background: "var(--portal-emerald)", color: "#fff" }}
                >
                  Approve all clean ({cleanIds.length})
                </button>
              </div>
            </div>

            {sheetRows.length === 0 ? (
              <p className="text-sm m-0 py-6 text-center" style={dim}>
                No one reports to you yet in Microsoft 365.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm" style={{ minWidth: 900, borderCollapse: "collapse" }}>
                  <thead>
                    <tr className="text-left text-xs uppercase tracking-wide" style={dim}>
                      <th scope="col" className="py-2.5 px-2 font-semibold">
                        Employee
                      </th>
                      {weekDays(weekStart).map((d) => (
                        <th key={d} scope="col" className="py-2.5 px-1.5 font-semibold text-center">
                          {shortDate(d)}
                        </th>
                      ))}
                      <th scope="col" className="py-2.5 px-2 font-semibold text-right">
                        Total
                      </th>
                      <th scope="col" className="py-2.5 px-2 font-semibold">
                        Status
                      </th>
                      <th scope="col" className="py-2.5 px-2">
                        <span className="sr-only">Action</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {sheetRows.map((r) => {
                      const a = approved[r.employeeId];
                      const w = r.week;
                      let status: { label: string; fg: string; bg: string };
                      if (a) status = { label: adpStatusLabel(a.adp) ? `Approved · ${adpStatusLabel(a.adp)}` : "Approved", fg: "#1F6F54", bg: "#EAF3EF" };
                      else if (w.missedPunch) status = { label: "Missed punch", fg: "#9A3412", bg: "#FCE7DD" };
                      else if (w.overtimeHours > 0) status = { label: `Overtime ${formatHours(w.overtimeHours)}h`, fg: "#7A5A12", bg: "#FBF0DC" };
                      else if (w.totalHours === 0) status = { label: "No hours", fg: "#5F6E68", bg: "#EEF1EF" };
                      else status = { label: "Ready", fg: "#16302B", bg: "var(--portal-sand)" };
                      const rowBusy = busy === `ts:${r.employeeId}`;
                      return (
                        <tr key={r.employeeId} style={{ borderTop: "1px solid rgba(22,48,43,0.08)" }}>
                          <th scope="row" className="py-3 px-2 text-left font-semibold whitespace-nowrap" style={{ color: "var(--portal-ink)" }}>
                            {r.name}
                            {r.jobTitle && <span className="block text-xs font-normal" style={dim}>{r.jobTitle}</span>}
                          </th>
                          {w.days.map((d) => {
                            const total = Math.round((d.hours + d.timeOffHours) * 100) / 100;
                            let style: React.CSSProperties = { color: "var(--portal-ink)" };
                            let text = total > 0 ? formatHours(total) : "–";
                            let title: string | undefined;
                            if (d.missedPunch) {
                              style = { color: "#9A3412", background: "#FCE7DD", fontWeight: 600 };
                              text = "?";
                              title = "Missed punch: clocked in but never out";
                            } else if (d.timeOff) {
                              style = { color: LEAVE_COLORS[d.timeOff].fg, background: LEAVE_COLORS[d.timeOff].bg };
                              text = `${formatHours(total)} ${d.timeOff === "sick" ? "SICK" : "PTO"}`;
                              title = `${LEAVE_LABEL[d.timeOff]} time off`;
                            } else if (d.open) {
                              text = total > 0 ? `${formatHours(total)}+` : "in";
                              title = "Clocked in now";
                            } else if (total === 0) {
                              style = { color: "rgba(22,48,43,0.4)" };
                            }
                            return (
                              <td key={d.date} className="py-2 px-1.5 text-center">
                                <span className="inline-flex justify-center rounded-lg px-1 py-1.5" title={title} style={{ minWidth: 44, fontFamily: "'IBM Plex Mono', monospace", fontSize: 13, ...style }}>
                                  {text}
                                </span>
                              </td>
                            );
                          })}
                          <td className="py-3 px-2 text-right font-semibold" style={{ fontFamily: "'IBM Plex Mono', monospace", color: w.overtimeHours > 0 && !a ? "#7A5A12" : "var(--portal-ink)" }}>
                            {formatHours(w.totalHours)}
                            {w.missedPunch ? "+" : ""}
                          </td>
                          <td className="py-3 px-2">
                            <span className="text-xs font-semibold rounded-full px-2.5 py-1 whitespace-nowrap" style={{ color: status.fg, background: status.bg }}>
                              {status.label}
                            </span>
                          </td>
                          <td className="py-3 px-2 text-right">
                            {a ? (
                              a.adp !== "sent" && (
                                <button type="button" disabled={rowBusy} onClick={() => sheets("undo", [r.employeeId])} className="text-sm px-2.5" style={{ minHeight: 40, ...dim }}>
                                  Undo
                                </button>
                              )
                            ) : w.missedPunch ? (
                              <span className="text-xs" style={dim}>
                                Fix punch first
                              </span>
                            ) : (
                              <button
                                type="button"
                                disabled={rowBusy || w.totalHours === 0}
                                onClick={() => sheets("approve", [r.employeeId])}
                                className="rounded-full bg-white px-3.5 text-sm font-semibold disabled:opacity-40"
                                style={{ minHeight: 40, border: "1px solid #CFE0D7", color: "var(--portal-emerald)" }}
                              >
                                Approve
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            <div className="flex flex-wrap gap-4 mt-4 pt-3.5 text-[13px]" style={{ borderTop: "1px solid rgba(22,48,43,0.08)", ...dim }}>
              <Legend color="#FCE7DD" label="Missed punch" />
              <Legend color="#FBF0DC" label={`Over ${OVERTIME_HOURS} hours`} />
              <Legend color="#EAF3EF" label="Approved time off" />
              <span className="sm:ml-auto">Hours come from portal clock in/out. Approved timesheets go to ADP for payroll.</span>
            </div>
            {weekStart === thisWeekStart && (
              <p className="text-xs mt-2 mb-0" style={dim}>
                This week isn&apos;t over yet ({shortDate(today)}). You can approve, but most managers approve last week.
              </p>
            )}
          </section>
        )}
      </div>
      <MobileTabBar active="time" showAdmin={isAdmin} />
    </main>
  );
}

function TabLink({ href, on, label, count }: { href: string; on: boolean; label: string; count: number }) {
  return (
    <Link
      href={href}
      aria-current={on ? "page" : undefined}
      className="inline-flex items-center gap-2 rounded-full px-4 text-[15px] font-semibold"
      style={on ? { minHeight: 44, background: "var(--portal-emerald)", color: "#fff" } : { minHeight: 44, background: "#fff", border: "1px solid var(--portal-line)", color: "var(--portal-ink)" }}
    >
      {label}
      {count > 0 && (
        <span className="text-xs rounded-full px-2 py-0.5" style={on ? { background: "rgba(255,255,255,0.2)" } : { background: "#FBF0DC", color: "#7A5A12" }}>
          {count}
        </span>
      )}
    </Link>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span aria-hidden className="w-3 h-3 rounded" style={{ background: color }} />
      {label}
    </span>
  );
}
