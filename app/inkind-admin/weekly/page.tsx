"use client";

import { useEffect, useState } from "react";
import {
  fetchCompletedSessions,
  sumProgramTotals,
  type DashboardSession,
} from "@/lib/inkind/fetchSessions";
import ProgramTotals from "@/app/inkind-admin/components/ProgramTotals";
import SessionsTable from "@/app/inkind-admin/components/SessionsTable";

type DayBucket = { label: string; date: Date; sessions: DashboardSession[] };

export default function WeeklyPage() {
  const [sessions, setSessions] = useState<DashboardSession[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const end = new Date();
    end.setHours(24, 0, 0, 0);
    const start = new Date(end);
    start.setDate(start.getDate() - 7);
    const data = await fetchCompletedSessions(start, end);
    setSessions(data);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  function markSynced(sessionId: string) {
    setSessions((prev) =>
      prev.map((s) => (s.id === sessionId ? { ...s, synced_to_salesforce: true } : s))
    );
  }

  const totals = sumProgramTotals(sessions);
  const totalItems = sessions.reduce((a, s) => a + s.totalItems, 0);
  const totalValue = sessions.reduce((a, s) => a + s.totalValue, 0);

  // Bucket into the last 7 calendar days for the mini bar chart
  const days: DayBucket[] = Array.from({ length: 7 }).map((_, i) => {
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() - (6 - i));
    const nextDate = new Date(date);
    nextDate.setDate(nextDate.getDate() + 1);
    const daySessions = sessions.filter((s) => {
      if (!s.completed_at) return false;
      const t = new Date(s.completed_at).getTime();
      return t >= date.getTime() && t < nextDate.getTime();
    });
    return { label: date.toLocaleDateString(undefined, { weekday: "short" }), date, sessions: daySessions };
  });

  const dayMaxItems = Math.max(1, ...days.map((d) => d.sessions.reduce((a, s) => a + s.totalItems, 0)));

  return (
    <main className="p-6">
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-brand-dark">This Week</h1>
        <p className="text-gray-500 text-sm">
          Last 7 days · {sessions.length} donations · {totalItems} items · ${totalValue.toFixed(2)}
        </p>
      </div>

      {loading ? (
        <p className="text-gray-400 text-sm">Loading...</p>
      ) : (
        <>
          <div className="rounded-xl border border-gray-200 bg-white p-4 mb-6 flex items-end gap-3 h-40">
            {days.map((d) => {
              const items = d.sessions.reduce((a, s) => a + s.totalItems, 0);
              const heightPct = Math.max(4, (items / dayMaxItems) * 100);
              return (
                <div key={d.label + d.date.toISOString()} className="flex-1 flex flex-col items-center gap-1">
                  <div className="w-full flex items-end h-28">
                    <div
                      className="w-full rounded-t-md bg-brand"
                      style={{ height: `${heightPct}%` }}
                      title={`${items} items`}
                    />
                  </div>
                  <span className="text-xs text-gray-500">{d.label}</span>
                  <span className="text-xs font-semibold text-brand-dark">{items}</span>
                </div>
              );
            })}
          </div>

          <ProgramTotals totals={totals} />
          <SessionsTable sessions={sessions} onSynced={markSynced} />
        </>
      )}
    </main>
  );
}
