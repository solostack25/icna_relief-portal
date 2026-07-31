import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import EventManager from "./EventManager";

export default async function VolunteerEventPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/");

  const { data: event } = await supabase
    .from("volunteer_events")
    .select("id, office_id, title, description, location_name, location_address, slug, starts_on, ends_on, is_published")
    .eq("id", id)
    .single();

  if (!event) redirect("/volunteer");

  const { data: office } = await supabase
    .from("b2s_offices")
    .select("field_office, region")
    .eq("id", event.office_id)
    .single();

  const { data: slots } = await supabase
    .from("volunteer_slots")
    .select("id, slot_type, label, start_time, end_time, capacity, created_at")
    .eq("event_id", id)
    .order("created_at");

  const slotIds = (slots ?? []).map((s) => s.id);

  const { data: availability } = await supabase
    .from("volunteer_slot_availability")
    .select("slot_id, claimed, spots_remaining")
    .in("slot_id", slotIds.length ? slotIds : ["00000000-0000-0000-0000-000000000000"]);
  const availabilityMap = new Map((availability ?? []).map((a) => [a.slot_id, a]));

  const { data: signups } = await supabase
    .from("volunteer_signups")
    .select("id, slot_id, name, email, phone, qty, notes, source, created_at")
    .in("slot_id", slotIds.length ? slotIds : ["00000000-0000-0000-0000-000000000000"])
    .order("created_at");

  const signupsBySlot = new Map<string, typeof signups>();
  for (const s of signups ?? []) {
    const list = signupsBySlot.get(s.slot_id) ?? [];
    list.push(s);
    signupsBySlot.set(s.slot_id, list);
  }

  const slotsWithData = (slots ?? []).map((s) => ({
    ...s,
    claimed: availabilityMap.get(s.id)?.claimed ?? 0,
    spots_remaining: availabilityMap.get(s.id)?.spots_remaining ?? s.capacity,
    signups: signupsBySlot.get(s.id) ?? [],
  }));

  return (
    <main className="min-h-screen px-4 py-12">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <Link
            href="/volunteer"
            className="text-sm text-[var(--color-text-dim)] hover:text-[var(--color-text)]"
          >
            ← All Events
          </Link>
        </div>

        <div className="mb-8">
          <h1 className="text-xl font-semibold">{event.title}</h1>
          <p className="text-sm text-[var(--color-text-dim)]">
            {office?.field_office} ({office?.region})
            {event.starts_on ? ` · ${event.starts_on}${event.ends_on && event.ends_on !== event.starts_on ? ` – ${event.ends_on}` : ""}` : ""}
          </p>
          {event.description && (
            <p className="text-sm mt-2">{event.description}</p>
          )}
          {(event.location_name || event.location_address) && (
            <p className="text-xs text-[var(--color-text-dim)] mt-1">
              {event.location_name} {event.location_address}
            </p>
          )}
        </div>

        <EventManager
          eventId={event.id}
          slug={event.slug}
          isPublished={event.is_published}
          initialSlots={slotsWithData}
        />
      </div>
    </main>
  );
}
