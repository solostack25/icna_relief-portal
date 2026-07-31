import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function VolunteerPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/");

  const { data: events } = await supabase
    .from("volunteer_events")
    .select("id, office_id, title, slug, starts_on, ends_on, is_published, created_at")
    .order("created_at", { ascending: false })
    .limit(50);

  const officeIds = [...new Set((events ?? []).map((e) => e.office_id))];
  const { data: offices } = await supabase
    .from("b2s_offices")
    .select("id, field_office, region")
    .in("id", officeIds.length ? officeIds : ["00000000-0000-0000-0000-000000000000"]);
  const officeMap = new Map((offices ?? []).map((o) => [o.id, o]));

  const eventIds = (events ?? []).map((e) => e.id);
  const { data: availability } = await supabase
    .from("volunteer_slot_availability")
    .select("event_id, capacity, spots_remaining")
    .in("event_id", eventIds.length ? eventIds : ["00000000-0000-0000-0000-000000000000"]);

  const statsByEvent = new Map<string, { slots: number; capacity: number; remaining: number }>();
  for (const row of availability ?? []) {
    const cur = statsByEvent.get(row.event_id) ?? { slots: 0, capacity: 0, remaining: 0 };
    cur.slots += 1;
    cur.capacity += row.capacity;
    cur.remaining += row.spots_remaining;
    statsByEvent.set(row.event_id, cur);
  }

  return (
    <main className="min-h-screen px-4 py-12">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-xl font-semibold">Volunteer Signups</h1>
            <p className="text-sm text-[var(--color-text-dim)]">
              Create signup events and shifts for your office
            </p>
          </div>
          <Link
            href="/select-app"
            className="text-sm text-[var(--color-text-dim)] hover:text-[var(--color-text)]"
          >
            ← Back
          </Link>
        </div>

        <Link
          href="/volunteer/new"
          className="block text-center rounded-lg bg-[var(--color-accent)] text-white text-sm font-medium py-3 mb-8"
        >
          + New Event
        </Link>

        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] overflow-hidden">
          {(events ?? []).length === 0 ? (
            <p className="p-6 text-sm text-[var(--color-text-dim)]">
              No volunteer events yet.
            </p>
          ) : (
            (events ?? []).map((e) => {
              const office = officeMap.get(e.office_id);
              const stats = statsByEvent.get(e.id);
              return (
                <Link
                  key={e.id}
                  href={`/volunteer/${e.id}`}
                  className="flex items-center justify-between px-4 py-3 border-b border-[var(--color-border)] last:border-0 hover:bg-black/[0.02]"
                >
                  <div>
                    <div className="text-sm font-medium">{e.title}</div>
                    <div className="text-xs text-[var(--color-text-dim)]">
                      {office?.field_office ?? "Unknown office"}
                      {e.starts_on ? ` · ${e.starts_on}${e.ends_on && e.ends_on !== e.starts_on ? ` – ${e.ends_on}` : ""}` : ""}
                      {stats ? ` · ${stats.slots} slot${stats.slots === 1 ? "" : "s"} · ${stats.remaining}/${stats.capacity} spots open` : " · no slots yet"}
                    </div>
                  </div>
                  <span
                    className={
                      "text-xs px-2 py-1 rounded-full " +
                      (e.is_published
                        ? "bg-green-500/10 text-green-700"
                        : "bg-[var(--color-text-dim)]/10 text-[var(--color-text-dim)]")
                    }
                  >
                    {e.is_published ? "Published" : "Draft"}
                  </span>
                </Link>
              );
            })
          )}
        </div>
      </div>
    </main>
  );
}
