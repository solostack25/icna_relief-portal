"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { ORLANDO_OFFICE_ID, ORLANDO_OFFICE_LABEL } from "@/lib/orlandoAutomation/config";

type Stats = {
  completedThisMonth: number;
  missedThisMonth: number;
  bookedUpcoming: number;
  waitlistOpen: number;
  noShowRatePct: number | null;
};

function monthStartISO() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
}

export default function StatsPage() {
  const supabase = createClient();
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const monthStart = monthStartISO();

      const { data: slotRows } = await supabase
        .from("pickup_slots")
        .select("id, slot_date")
        .eq("office_id", ORLANDO_OFFICE_ID)
        .gte("slot_date", monthStart);

      const slotIds = (slotRows ?? []).map((s) => s.id);

      const { data: bookingRows } = slotIds.length
        ? await supabase.from("pickup_bookings").select("status").in("slot_id", slotIds)
        : { data: [] as { status: string }[] };

      const today = new Date().toISOString().slice(0, 10);
      const { data: upcomingSlotRows } = await supabase
        .from("pickup_slots")
        .select("id")
        .eq("office_id", ORLANDO_OFFICE_ID)
        .gte("slot_date", today);
      const upcomingSlotIds = (upcomingSlotRows ?? []).map((s) => s.id);

      const { count: upcomingCount } = upcomingSlotIds.length
        ? await supabase
            .from("pickup_bookings")
            .select("id", { count: "exact", head: true })
            .eq("status", "booked")
            .in("slot_id", upcomingSlotIds)
        : { count: 0 };

      const { count: waitlistCount } = await supabase
        .from("pickup_waitlist")
        .select("id", { count: "exact", head: true })
        .eq("office_id", ORLANDO_OFFICE_ID)
        .is("notified_at", null);

      const completed = (bookingRows ?? []).filter((b) => b.status === "completed").length;
      const missed = (bookingRows ?? []).filter(
        (b) => b.status === "missed" || b.status === "expired"
      ).length;
      const resolved = completed + missed;

      setStats({
        completedThisMonth: completed,
        missedThisMonth: missed,
        bookedUpcoming: upcomingCount ?? 0,
        waitlistOpen: waitlistCount ?? 0,
        noShowRatePct: resolved > 0 ? Math.round((missed / resolved) * 100) : null,
      });
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const cards = stats
    ? [
        { label: "Completed this month", value: stats.completedThisMonth },
        { label: "Missed this month", value: stats.missedThisMonth },
        {
          label: "No-show rate this month",
          value: stats.noShowRatePct === null ? "—" : `${stats.noShowRatePct}%`,
        },
        { label: "Upcoming booked pickups", value: stats.bookedUpcoming },
        { label: "Open waitlist entries", value: stats.waitlistOpen },
      ]
    : [];

  return (
    <main className="min-h-screen px-4 py-12">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-xl font-semibold">Stats</h1>
            <p className="text-sm text-[var(--color-text-dim)]">
              A quick look at distribution activity this month
            </p>
          </div>
          <Link
            href="/orlando-automation"
            className="text-sm text-[var(--color-text-dim)] hover:text-[var(--color-text)]"
          >
            ← Home
          </Link>
        </div>

        {loading ? (
          <p className="text-sm text-[var(--color-text-dim)]">Loading…</p>
        ) : (
          <div className="grid grid-cols-2 gap-4">
            {cards.map((c) => (
              <div
                key={c.label}
                className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5"
              >
                <div className="text-2xl font-semibold">{c.value}</div>
                <div className="text-xs text-[var(--color-text-dim)] mt-1">{c.label}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
