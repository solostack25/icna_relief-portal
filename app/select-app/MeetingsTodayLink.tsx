import Link from "next/link";
import { getTodayCalendarView } from "@/lib/msgraph";

// Rendered inside its own <Suspense> boundary in select-app/page.tsx,
// separate from MyMeetingsCard's boundary below the hero — same Graph
// call, but this one is small enough it shouldn't block on the other
// one's render, and Next dedupes the underlying fetch() within a
// single request anyway.
export default async function MeetingsTodayLink({ email }: { email: string }) {
  let count = 0;
  try {
    const events = await getTodayCalendarView(email);
    count = events.length;
  } catch {
    // Calendars.Read isn't granted/consented yet — say nothing here
    // rather than showing a broken or misleading count in the hero.
    return null;
  }

  const label = count === 0 ? "No meetings today" : `You have ${count} meeting${count === 1 ? "" : "s"} today`;

  return (
    <Link
      href="/calendar"
      className="inline-flex items-center gap-1.5 text-sm hover:underline underline-offset-2"
      style={{ color: "var(--portal-gold-soft)" }}
    >
      {label}
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" width="12" height="12">
        <path d="M5 12h14M13 6l6 6-6 6" />
      </svg>
    </Link>
  );
}

export function MeetingsTodayLinkSkeleton() {
  return (
    <span className="text-sm" style={{ color: "rgba(251,247,239,0.4)" }}>
      …
    </span>
  );
}
