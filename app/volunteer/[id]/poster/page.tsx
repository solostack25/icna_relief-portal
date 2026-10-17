import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { formatInTz, formatTimeInTz } from "@/lib/volunteer";
import PrintButton from "./PrintButton";

export const dynamic = "force-dynamic";

// Printable letter-size sign for the event: the check-in code goes on the
// volunteer table, the sign-up code on fliers / social / the office door.
export default async function VolunteerQrPosterPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ kind?: string }>;
}) {
  const { id } = await params;
  const kind = (await searchParams).kind === "signup" ? "signup" : "checkin";
  const supabase = await createClient();

  const { data: event } = await supabase
    .from("volunteer_events")
    .select("id, title, office_id, starts_at, ends_at, timezone, location_name")
    .eq("id", id)
    .maybeSingle();
  if (!event) redirect("/volunteer");

  const { data: office } = await supabase.from("b2s_offices").select("field_office").eq("id", event.office_id).single();
  const tz = event.timezone || "America/Chicago";

  return (
    <main className="min-h-screen bg-white px-6 py-10 print:p-0">
      <style>{`@media print { @page { size: letter; margin: 0.5in; } body { background: #fff !important; } }`}</style>
      <div className="mx-auto max-w-2xl text-center">
        <div className="print:hidden mb-6 flex justify-center gap-3">
          <PrintButton />
          <a
            href={`/volunteer/${event.id}`}
            className="rounded-full border border-[var(--color-border)] px-5 py-2 text-sm"
          >
            ← Back to event
          </a>
        </div>

        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[var(--color-accent)]">
          ICNA Relief · {office?.field_office}
        </p>
        <h1 className="mt-3 text-4xl font-semibold leading-tight">
          {kind === "checkin" ? "Volunteers: check in here" : "Volunteer with us"}
        </h1>
        <p className="mt-3 text-xl">{event.title}</p>
        {event.starts_at && (
          <p className="mt-1 text-base text-[var(--color-text-dim)]">
            {formatInTz(event.starts_at, tz, { weekday: "long" })} – {formatTimeInTz(event.ends_at, tz)}
            {event.location_name ? ` · ${event.location_name}` : ""}
          </p>
        )}

        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={`/api/volunteer/qr?event=${event.id}&kind=${kind}`}
          alt={`${kind === "checkin" ? "Check-in" : "Sign-up"} QR code`}
          className="mx-auto mt-8 h-[4.5in] w-[4.5in] max-w-full object-contain"
        />

        <ol className="mx-auto mt-8 max-w-md space-y-2 text-left text-lg">
          {kind === "checkin" ? (
            <>
              <li>1. Open your phone's camera and point it at the code.</li>
              <li>2. Tap the link and enter your email or phone number.</li>
              <li>3. Leaving? Scan this code again and tap <strong>Check out</strong>.</li>
            </>
          ) : (
            <>
              <li>1. Open your phone's camera and point it at the code.</li>
              <li>2. Pick a shift and sign up — it takes a minute.</li>
              <li>3. On the day, check in at the volunteer table.</li>
            </>
          )}
        </ol>
        {kind === "checkin" && (
          <p className="mt-6 text-sm text-[var(--color-text-dim)]">
            Forgot to check out? You'll be checked out automatically at {formatTimeInTz(event.ends_at, tz)}.
          </p>
        )}
      </div>
    </main>
  );
}
