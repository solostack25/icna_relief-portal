"use client";

import Link from "next/link";
import DistributionCalendar from "@/app/orlando-automation/_components/DistributionCalendar";

export default function CalendarViewPage() {
  return (
    <main className="min-h-screen px-4 py-12">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-xl font-semibold">Calendar View</h1>
            <p className="text-sm text-[var(--color-text-dim)]">
              Overview of all upcoming distributions and bookings
            </p>
          </div>
          <Link
            href="/orlando-automation"
            className="text-sm text-[var(--color-text-dim)] hover:text-[var(--color-text)]"
          >
            ← Home
          </Link>
        </div>

        <DistributionCalendar />
      </div>
    </main>
  );
}
