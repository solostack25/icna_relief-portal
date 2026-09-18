"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Check } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useLanguage } from "@/lib/orlandoAutomation/i18n";
import { INTL_LOCALE } from "@/lib/orlandoAutomation/translations";
import { ORLANDO_OFFICE_ID, ORLANDO_OFFICE_LABEL } from "@/lib/orlandoAutomation/config";

type Stats = {
  expected: number;
  checkedIn: number;
  noShows30d: number;
  waitlist: number;
};

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function daysAgoISO(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

const REFRESH_MS = 30_000;

export default function DashboardStats() {
  const supabase = createClient();
  const { t, locale } = useLanguage();

  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  async function load() {
    const today = todayISO();

    const { data: todaySlots } = await supabase
      .from("pickup_slots")
      .select("id")
      .eq("office_id", ORLANDO_OFFICE_ID)
      .eq("slot_date", today);
    const todaySlotIds = (todaySlots ?? []).map((s) => s.id);

    const { data: recentSlots } = await supabase
      .from("pickup_slots")
      .select("id")
      .eq("office_id", ORLANDO_OFFICE_ID)
      .gte("slot_date", daysAgoISO(30));
    const recentSlotIds = (recentSlots ?? []).map((s) => s.id);

    const [expectedRes, checkedInRes, noShowRes, waitlistRes] = await Promise.all([
      todaySlotIds.length
        ? supabase
            .from("pickup_bookings")
            .select("id", { count: "exact", head: true })
            .in("slot_id", todaySlotIds)
            .in("status", ["booked", "completed"])
        : Promise.resolve({ count: 0 }),
      todaySlotIds.length
        ? supabase
            .from("pickup_bookings")
            .select("id", { count: "exact", head: true })
            .in("slot_id", todaySlotIds)
            .eq("status", "completed")
        : Promise.resolve({ count: 0 }),
      recentSlotIds.length
        ? supabase
            .from("pickup_bookings")
            .select("id", { count: "exact", head: true })
            .in("slot_id", recentSlotIds)
            .in("status", ["missed", "expired"])
        : Promise.resolve({ count: 0 }),
      supabase
        .from("pickup_waitlist")
        .select("id", { count: "exact", head: true })
        .eq("office_id", ORLANDO_OFFICE_ID)
        .is("notified_at", null),
    ]);

    setStats({
      expected: expectedRes.count ?? 0,
      checkedIn: checkedInRes.count ?? 0,
      noShows30d: noShowRes.count ?? 0,
      waitlist: waitlistRes.count ?? 0,
    });
    setLastUpdated(new Date());
    setLoading(false);
  }

  useEffect(() => {
    load();
    const interval = setInterval(load, REFRESH_MS);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const chips = [
    {
      label: t("dash.expectedToday"),
      value: stats?.expected,
      href: "/orlando-automation/appointments",
      highlight: false,
    },
    {
      label: t("dash.checkedIn"),
      value: stats?.checkedIn,
      href: "/orlando-automation/appointments",
      highlight: true,
    },
    {
      label: t("dash.noShows30"),
      value: stats?.noShows30d,
      href: "/orlando-automation/no-shows",
      highlight: false,
    },
    {
      label: t("dash.onWaitlist"),
      value: stats?.waitlist,
      href: "/orlando-automation/waitlist",
      highlight: false,
    },
  ];

  return (
    <div className="mb-8">
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs text-[var(--color-text-dim)]">
          {loading
            ? t("dash.loadingNumbers")
            : lastUpdated
            ? t("dash.updated", {
                time: lastUpdated.toLocaleTimeString(INTL_LOCALE[locale], {
                  hour: "numeric",
                  minute: "2-digit",
                }),
              })
            : ""}
        </p>
        <button
          onClick={load}
          className="text-xs text-[var(--color-text-dim)] hover:text-[var(--color-text)]"
        >
          {t("dash.refresh")}
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        {chips.map((c) => (
          <Link
            key={c.label}
            href={c.href}
            className={[
              "inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 transition-opacity hover:opacity-80",
              c.highlight
                ? "bg-[var(--badge-green-bg)] text-[var(--badge-green-fg)]"
                : "bg-[var(--color-surface)] text-[var(--color-text)]",
            ].join(" ")}
          >
            {c.highlight && <Check size={14} strokeWidth={2.5} aria-hidden="true" />}
            <span className="text-[15px] font-medium tabular-nums">{c.value ?? "—"}</span>
            <span
              className={[
                "text-xs",
                c.highlight ? "text-[var(--badge-green-fg)]" : "text-[var(--color-text-dim)]",
              ].join(" ")}
            >
              {c.label}
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
