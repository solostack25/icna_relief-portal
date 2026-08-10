"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import DonorSessionView from "@/app/inkind/components/DonorSessionView";
import Logo from "@/app/inkind/components/Logo";

// This is the URL the mounted, stand-fixed donor tablet sits on all
// day — not tied to any one donation. It automatically finds whichever
// donation the employee is currently working on and follows it live,
// then resets back to this idle screen after the donor submits, ready
// for the next one. No QR code, no manual handoff — the tablet just
// works, which matters a lot for donors who wouldn't know what to do
// with a QR code.
//
// Picks the most recently created session that's still in progress
// (active or awaiting_signature). This assumes a single scanning
// station — if a second, independent scanning station is ever added,
// this will need a way to pair a specific kiosk tablet to a specific
// station instead of just picking "the newest one."
export default function DonorKioskScreen() {
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [checking, setChecking] = useState(true);

  const findActiveSession = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from("sessions")
      .select("id")
      .in("status", ["active", "awaiting_signature"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    setActiveSessionId(data?.id ?? null);
    setChecking(false);
  }, []);

  useEffect(() => {
    findActiveSession();

    const supabase = createClient();
    // Realtime should catch a new session the instant it's created, but
    // same resilience pattern as everywhere else in this app — poll as
    // a fallback in case realtime doesn't connect on this network.
    const pollInterval = setInterval(findActiveSession, 3000);

    const channel = supabase
      .channel("donor-kiosk-watch")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "sessions" },
        (payload) => {
          const row = payload.new as { id: string; status: string };
          if (row.status === "active") setActiveSessionId(row.id);
        }
      )
      .subscribe();

    return () => {
      clearInterval(pollInterval);
      supabase.removeChannel(channel);
    };
  }, [findActiveSession]);

  function handleSessionComplete() {
    setActiveSessionId(null);
    setChecking(true);
    findActiveSession();
  }

  if (activeSessionId) {
    return <DonorSessionView sessionId={activeSessionId} onSessionComplete={handleSessionComplete} />;
  }

  return (
    <main className="min-h-screen flex flex-col items-center justify-center gap-4 p-6 text-center">
      <Logo className="h-12 w-auto mb-2" />
      <h1 className="text-2xl font-bold text-brand-dark">Welcome!</h1>
      <p className="text-gray-500 max-w-xs">
        {checking ? "Loading..." : "Please see a staff member to begin your donation."}
      </p>
    </main>
  );
}
