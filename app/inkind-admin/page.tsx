"use client";

import { useEffect, useState } from "react";
import {
  fetchCompletedSessions,
  sumProgramTotals,
  type DashboardSession,
} from "@/lib/inkind/fetchSessions";
import ProgramTotals from "@/app/inkind-admin/components/ProgramTotals";
import SessionsTable from "@/app/inkind-admin/components/SessionsTable";

export default function TodayPage() {
  const [sessions, setSessions] = useState<DashboardSession[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
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

  return (
    <main className="p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold text-brand-dark">Today</h1>
          <p className="text-gray-500 text-sm">
            {new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}
            {" · "}
            {sessions.length} donation{sessions.length === 1 ? "" : "s"} · {totalItems} items · $
            {totalValue.toFixed(2)}
          </p>
        </div>
        <a
          href="/inkind"
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-white hover:opacity-90"
        >
          Open Scanning Kiosk →
        </a>
      </div>

      {loading ? (
        <p className="text-gray-400 text-sm">Loading...</p>
      ) : (
        <>
          <ProgramTotals totals={totals} />
          <SessionsTable sessions={sessions} onSynced={markSynced} />
        </>
      )}
    </main>
  );
}
