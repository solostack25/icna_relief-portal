"use client";

import Link from "next/link";
import DistributionCalendar from "@/app/orlando-automation/_components/DistributionCalendar";

export default function NewDistributionPage() {
  return (
    <main className="min-h-screen px-4 py-12">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-xl font-semibold">Create a New Distribution</h1>
            <p className="text-sm text-[var(--color-text-dim)]">
              Set the pickup times clients can choose from, or block off a day entirely
            </p>
          </div>
          <Link
            href="/orlando-automation"
            className="text-sm text-[var(--color-text-dim)] hover:text-[var(--color-text)]"
          >
            ← Home
          </Link>
        </div>

        <p className="text-xs text-[var(--color-text-dim)] mb-4">
          Pick a day below, then add one or more pickup windows. Clients choose from these
          exact windows when they schedule on the client-side app. Marking a day as a
          blackout hides it from clients entirely.
        </p>

        <DistributionCalendar editable />
      </div>
    </main>
  );
}
