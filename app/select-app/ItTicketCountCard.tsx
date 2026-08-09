import { getOpenItTicketCountForTechnician } from "@/lib/sharepoint";
import { Card } from "./DayAtAGlance";

// Rendered inside a <Suspense> boundary in select-app/page.tsx --
// this is the ONLY thing that's slow (a full paginated fetch through
// the 2,662-item SharePoint list via Graph), so it's isolated into
// its own component rather than being awaited inline in the page.
// That lets the rest of the dashboard render and reach the browser
// immediately; this card streams in and replaces its skeleton
// whenever the SharePoint fetch actually finishes.
export default async function ItTicketCountCard({ fullName }: { fullName: string }) {
  try {
    const count = await getOpenItTicketCountForTechnician(fullName);
    return <Card label="My Open Help Desk Tickets" value={count} connected />;
  } catch {
    return <Card label="My Open Help Desk Tickets" value="—" connected={false} />;
  }
}

export function ItTicketCountSkeleton() {
  return (
    <div className="rounded-xl border border-dashed border-[var(--color-border)] bg-[var(--color-surface)]/50 p-4 animate-pulse">
      <div className="text-2xl font-semibold text-[var(--color-text-dim)]">…</div>
      <div className="text-xs text-[var(--color-text-dim)] mt-1">My Open Help Desk Tickets</div>
    </div>
  );
}
