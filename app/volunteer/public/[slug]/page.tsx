import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import SignupForm from "./SignupForm";

export default async function PublicVolunteerEventPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const supabase = await createClient();

  const { data: event } = await supabase
    .from("volunteer_events")
    .select("id, office_id, title, description, location_name, location_address, starts_on, ends_on")
    .eq("slug", slug)
    .eq("is_published", true)
    .single();

  if (!event) notFound();

  const { data: office } = await supabase
    .from("b2s_offices")
    .select("field_office, region")
    .eq("id", event.office_id)
    .single();

  const { data: slots } = await supabase
    .from("volunteer_slots")
    .select("id, slot_type, label, start_time, end_time, capacity")
    .eq("event_id", event.id)
    .order("start_time");

  const slotIds = (slots ?? []).map((s) => s.id);
  const { data: availability } = await supabase
    .from("volunteer_slot_availability")
    .select("slot_id, spots_remaining")
    .in("slot_id", slotIds.length ? slotIds : ["00000000-0000-0000-0000-000000000000"]);
  const remainingMap = new Map((availability ?? []).map((a) => [a.slot_id, a.spots_remaining]));

  const slotsWithAvailability = (slots ?? []).map((s) => ({
    ...s,
    spots_remaining: remainingMap.get(s.id) ?? s.capacity,
  }));

  return (
    <main className="min-h-screen px-4 py-12">
      <div className="max-w-xl mx-auto">
        <h1 className="text-2xl font-semibold">{event.title}</h1>
        <p className="text-sm text-[var(--color-text-dim)] mt-1">
          {office?.field_office}
          {event.starts_on
            ? ` · ${event.starts_on}${event.ends_on && event.ends_on !== event.starts_on ? ` – ${event.ends_on}` : ""}`
            : ""}
        </p>

        {event.description && <p className="text-sm mt-4">{event.description}</p>}

        {(event.location_name || event.location_address) && (
          <p className="text-sm text-[var(--color-text-dim)] mt-2">
            {event.location_name} {event.location_address}
          </p>
        )}

        <div className="mt-8 space-y-4">
          {slotsWithAvailability.length === 0 && (
            <p className="text-sm text-[var(--color-text-dim)]">
              No slots open yet — check back soon.
            </p>
          )}
          {slotsWithAvailability.map((slot) => (
            <SignupForm key={slot.id} slot={slot} />
          ))}
        </div>
      </div>
    </main>
  );
}
