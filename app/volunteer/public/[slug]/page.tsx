import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getWaiver } from "@/lib/volunteerServer";
import { formatInTz, formatTimeInTz } from "@/lib/volunteer";
import SignupForm from "./SignupForm";

export const dynamic = "force-dynamic";

export default async function PublicVolunteerEventPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ src?: string }>;
}) {
  const { slug } = await params;
  const { src } = await searchParams;
  const supabase = await createClient();

  const { data: event } = await supabase
    .from("volunteer_events")
    .select("id, office_id, title, description, location_name, location_address, starts_on, ends_on, starts_at, ends_at, timezone, program")
    .eq("slug", slug)
    .eq("is_published", true)
    .single();

  if (!event) notFound();

  const [{ data: office }, { data: slots }, waiver] = await Promise.all([
    supabase.from("b2s_offices").select("field_office, region").eq("id", event.office_id).single(),
    supabase
      .from("volunteer_slots")
      .select("id, slot_type, label, start_time, end_time, capacity")
      .eq("event_id", event.id)
      .order("start_time"),
    getWaiver(),
  ]);

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

  const tz = event.timezone || "America/Chicago";
  const when = event.starts_at
    ? `${formatInTz(event.starts_at, tz, { weekday: "short" })} – ${
        event.ends_at && new Date(event.ends_at).toDateString() !== new Date(event.starts_at).toDateString()
          ? formatInTz(event.ends_at, tz)
          : formatTimeInTz(event.ends_at, tz)
      }`
    : event.starts_on
      ? `${event.starts_on}${event.ends_on && event.ends_on !== event.starts_on ? ` – ${event.ends_on}` : ""}`
      : "";
  const ended = event.ends_at ? new Date(event.ends_at).getTime() < Date.now() : false;

  return (
    <main className="min-h-screen px-4 py-10">
      <div className="max-w-xl mx-auto">
        <p className="text-xs uppercase tracking-wide text-[var(--color-accent)] font-medium">
          ICNA Relief · {office?.field_office}
          {event.program && event.program !== "General" ? ` · ${event.program}` : ""}
        </p>
        <h1 className="text-2xl font-semibold mt-1">{event.title}</h1>
        {when && <p className="text-sm text-[var(--color-text-dim)] mt-1">{when}</p>}
        {(event.location_name || event.location_address) && (
          <p className="text-sm text-[var(--color-text-dim)] mt-1">
            {[event.location_name, event.location_address].filter(Boolean).join(" · ")}
          </p>
        )}
        {event.description && <p className="text-sm mt-4 whitespace-pre-line">{event.description}</p>}

        <div className="mt-8">
          {ended ? (
            <p className="text-sm text-[var(--color-text-dim)]">This event has ended. Thank you to everyone who helped!</p>
          ) : slotsWithAvailability.length === 0 ? (
            <p className="text-sm text-[var(--color-text-dim)]">No slots open yet — check back soon.</p>
          ) : (
            <SignupForm
              slots={slotsWithAvailability}
              timezone={tz}
              waiverText={waiver.text}
              source={src === "qr" ? "qr" : "portal"}
            />
          )}
        </div>
      </div>
    </main>
  );
}
