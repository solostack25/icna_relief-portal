import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getWaiver } from "@/lib/volunteerServer";
import { formatInTz, formatTimeInTz } from "@/lib/volunteer";
import EventManager from "./EventManager";
import EventDetailsCard from "./EventDetailsCard";
import QrCodesCard from "./QrCodesCard";
import AttendanceRoster, { type RosterRow } from "./AttendanceRoster";

export const dynamic = "force-dynamic";

const NO_IDS = ["00000000-0000-0000-0000-000000000000"];

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

  // Close any check-ins whose event already ended before showing the roster.
  await supabase.rpc("volunteer_auto_checkout");

  const { data: event } = await supabase
    .from("volunteer_events")
    .select(
      "id, office_id, title, description, location_name, location_address, slug, starts_on, ends_on, starts_at, ends_at, timezone, program, is_published, checkin_token"
    )
    .eq("id", id)
    .single();

  if (!event) redirect("/volunteer");
  const tz = event.timezone || "America/Chicago";

  const [{ data: office }, { data: slots }, { data: attendance }, waiver] = await Promise.all([
    supabase.from("b2s_offices").select("field_office, region, state").eq("id", event.office_id).single(),
    supabase
      .from("volunteer_slots")
      .select("id, slot_type, label, start_time, end_time, capacity, created_at")
      .eq("event_id", id)
      .order("created_at"),
    supabase
      .from("volunteer_hours")
      .select("attendance_id, volunteer_id, signup_id, checked_in_at, checked_out_at, checkin_method, checkout_method, hours, value")
      .eq("event_id", id)
      .order("checked_in_at"),
    getWaiver(),
  ]);

  const slotIds = (slots ?? []).map((s) => s.id);

  const [{ data: availability }, { data: signups }] = await Promise.all([
    supabase
      .from("volunteer_slot_availability")
      .select("slot_id, claimed, spots_remaining")
      .in("slot_id", slotIds.length ? slotIds : NO_IDS),
    supabase
      .from("volunteer_signups")
      .select("id, slot_id, volunteer_id, name, email, phone, qty, notes, source, status, waiver_signed, created_at")
      .in("slot_id", slotIds.length ? slotIds : NO_IDS)
      .order("created_at"),
  ]);
  const availabilityMap = new Map((availability ?? []).map((a) => [a.slot_id, a]));

  const activeSignups = (signups ?? []).filter((s) => s.status !== "cancelled");
  const signupsBySlot = new Map<string, typeof activeSignups>();
  for (const s of activeSignups) {
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

  // ---------- Roster: one row per person (sign-ups ∪ check-ins) ----------
  const volunteerIds = [
    ...new Set([
      ...activeSignups.map((s) => s.volunteer_id).filter(Boolean),
      ...(attendance ?? []).map((a) => a.volunteer_id),
    ]),
  ] as string[];
  const { data: volunteers } = await supabase
    .from("volunteers")
    .select("id, first_name, last_name, email, phone, waiver_version, date_of_birth, gender, ethnicity, home_zip")
    .in("id", volunteerIds.length ? volunteerIds : NO_IDS);
  const volunteerMap = new Map((volunteers ?? []).map((v) => [v.id, v]));
  const slotLabel = new Map((slots ?? []).map((s) => [s.id, s.label]));

  const rows = new Map<string, RosterRow>();
  const keyFor = (s: { volunteer_id: string | null; id: string }) => s.volunteer_id ?? `signup:${s.id}`;
  for (const s of activeSignups) {
    const key = keyFor(s);
    const v = s.volunteer_id ? volunteerMap.get(s.volunteer_id) : null;
    const row =
      rows.get(key) ??
      ({
        key,
        volunteer_id: s.volunteer_id,
        name: v ? `${v.first_name} ${v.last_name}`.trim() : s.name,
        contact: v?.email ?? v?.phone ?? s.email ?? s.phone ?? "",
        slots: [],
        signup_ids: [],
        walk_in: false,
        waiver_on_file: v ? v.waiver_version === waiver.version : !!s.waiver_signed,
        profile_complete: !!(v?.date_of_birth && v?.gender && v?.ethnicity && v?.home_zip),
        attendance: [],
      } as RosterRow);
    row.slots.push(slotLabel.get(s.slot_id) ?? "");
    row.signup_ids.push(s.id);
    if (s.source === "walk_in") row.walk_in = true;
    rows.set(key, row);
  }
  for (const a of attendance ?? []) {
    const v = volunteerMap.get(a.volunteer_id);
    const row =
      rows.get(a.volunteer_id) ??
      ({
        key: a.volunteer_id,
        volunteer_id: a.volunteer_id,
        name: v ? `${v.first_name} ${v.last_name}`.trim() : "Volunteer",
        contact: v?.email ?? v?.phone ?? "",
        slots: [],
        signup_ids: [],
        walk_in: true,
        waiver_on_file: v?.waiver_version === waiver.version,
        profile_complete: !!(v?.date_of_birth && v?.gender && v?.ethnicity && v?.home_zip),
        attendance: [],
      } as RosterRow);
    row.attendance.push({
      id: a.attendance_id,
      checked_in_at: a.checked_in_at,
      checked_out_at: a.checked_out_at,
      checkin_method: a.checkin_method,
      checkout_method: a.checkout_method,
      hours: a.hours === null ? null : Number(a.hours),
    });
    rows.set(a.volunteer_id, row);
  }
  const roster = [...rows.values()].sort((a, b) => a.name.localeCompare(b.name));

  const totalHours = (attendance ?? []).reduce((s, a) => s + Number(a.hours ?? 0), 0);
  const totalValue = (attendance ?? []).reduce((s, a) => s + Number(a.value ?? 0), 0);
  const attendedPeople = new Set((attendance ?? []).map((a) => a.volunteer_id)).size;
  const hereNow = (attendance ?? []).filter((a) => !a.checked_out_at).length;

  const when = event.starts_at
    ? `${formatInTz(event.starts_at, tz, { weekday: "short" })} – ${
        new Date(event.ends_at ?? event.starts_at).toDateString() !== new Date(event.starts_at).toDateString()
          ? formatInTz(event.ends_at, tz)
          : formatTimeInTz(event.ends_at, tz)
      }`
    : event.starts_on
      ? `${event.starts_on}${event.ends_on && event.ends_on !== event.starts_on ? ` – ${event.ends_on}` : ""}`
      : "";

  return (
    <main className="min-h-screen px-4 py-12">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <Link href="/volunteer" className="text-sm text-[var(--color-text-dim)] hover:text-[var(--color-text)]">
            ← All Events
          </Link>
        </div>

        <div className="mb-8">
          <h1 className="text-xl font-semibold">{event.title}</h1>
          <p className="text-sm text-[var(--color-text-dim)]">
            {office?.field_office} ({office?.region})
            {event.program ? ` · ${event.program}` : ""}
            {when ? ` · ${when}` : ""}
          </p>
          {event.description && <p className="text-sm mt-2">{event.description}</p>}
          {(event.location_name || event.location_address) && (
            <p className="text-xs text-[var(--color-text-dim)] mt-1">
              {event.location_name} {event.location_address}
            </p>
          )}
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          {[
            { label: "Signed up", value: activeSignups.length },
            { label: "Attended", value: attendedPeople },
            { label: "Here now", value: hereNow },
            {
              label: "Hours · value",
              value: `${totalHours.toFixed(1)} · $${totalValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}`,
            },
          ].map((s) => (
            <div key={s.label} className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
              <div className="text-xs text-[var(--color-text-dim)]">{s.label}</div>
              <div className="text-lg font-semibold mt-0.5">{s.value}</div>
            </div>
          ))}
        </div>

        <div className="space-y-6">
          <EventDetailsCard
            event={{
              id: event.id,
              title: event.title,
              description: event.description,
              location_name: event.location_name,
              location_address: event.location_address,
              program: event.program,
              starts_at: event.starts_at,
              ends_at: event.ends_at,
              timezone: tz,
            }}
          />

          <QrCodesCard eventId={event.id} slug={event.slug} isPublished={event.is_published} checkinToken={event.checkin_token} />

          <AttendanceRoster
            eventId={event.id}
            timezone={tz}
            rows={roster}
            ended={event.ends_at ? new Date(event.ends_at).getTime() < Date.now() : false}
          />

          <EventManager
            eventId={event.id}
            slug={event.slug}
            isPublished={event.is_published}
            initialSlots={slotsWithData}
            timezone={tz}
          />
        </div>
      </div>
    </main>
  );
}
