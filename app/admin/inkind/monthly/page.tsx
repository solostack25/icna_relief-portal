"use client";

import { useEffect, useState } from "react";
import {
  fetchCompletedSessions,
  sumProgramTotals,
  type DashboardSession,
} from "@/lib/inkind/fetchSessions";
import ProgramTotals from "@/app/admin/inkind/components/ProgramTotals";
import SessionsTable from "@/app/admin/inkind/components/SessionsTable";

export default function MonthlyPage() {
  const [sessions, setSessions] = useState<DashboardSession[]>([]);
  const [loading, setLoading] = useState(true);

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();

  async function load() {
    setLoading(true);
    const data = await fetchCompletedSessions(monthStart, monthEnd);
    setSessions(data);
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function markSynced(sessionId: string) {
    setSessions((prev) =>
      prev.map((s) => (s.id === sessionId ? { ...s, synced_to_salesforce: true } : s))
    );
  }

  const totals = sumProgramTotals(sessions);
  const totalItems = sessions.reduce((a, s) => a + s.totalItems, 0);
  const totalValue = sessions.reduce((a, s) => a + s.totalValue, 0);

  const dailyItems: number[] = Array.from({ length: daysInMonth }).map((_, i) => {
    const dayStart = new Date(now.getFullYear(), now.getMonth(), i + 1);
    const dayEnd = new Date(now.getFullYear(), now.getMonth(), i + 2);
    return sessions
      .filter((s) => {
        if (!s.completed_at) return false;
        const t = new Date(s.completed_at).getTime();
        return t >= dayStart.getTime() && t < dayEnd.getTime();
      })
      .reduce((a, s) => a + s.totalItems, 0);
  });
  const dayMax = Math.max(1, ...dailyItems);

  return (
    <main className="p-6">
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-brand-dark">
          {now.toLocaleDateString(undefined, { month: "long", year: "numeric" })}
        </h1>
        <p className="text-gray-500 text-sm">
          {sessions.length} donations · {totalItems} items · ${totalValue.toFixed(2)}
        </p>
      </div>

      {loading ? (
        <p className="text-gray-400 text-sm">Loading...</p>
      ) : (
        <>
          <div className="rounded-xl border border-gray-200 bg-white p-4 mb-6 flex items-end gap-1 h-32 overflow-x-auto">
            {dailyItems.map((items, i) => (
              <div key={i} className="flex-1 min-w-[6px] flex flex-col items-center gap-1 h-full justify-end">
                <div
                  className="w-full rounded-t-sm bg-brand"
                  style={{ height: `${Math.max(3, (items / dayMax) * 100)}%` }}
                  title={`Day ${i + 1}: ${items} items`}
                />
              </div>
            ))}
          </div>
          <p className="text-xs text-gray-400 -mt-4 mb-6">Day 1 → {daysInMonth} of the month, by items received</p>

          <ProgramTotals totals={totals} />
          <SessionsTable sessions={sessions} onSynced={markSynced} />
        </>
      )}
    </main>
  );
}
