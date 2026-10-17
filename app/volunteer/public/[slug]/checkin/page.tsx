import { cookies } from "next/headers";
import { createAdminClient } from "@/lib/supabase/server";
import { attendanceCookieName, timingSafeEqualStr } from "@/lib/volunteerServer";
import CheckInClient from "./CheckInClient";

export const dynamic = "force-dynamic";

// Landing page for the on-site check-in QR code. Works on any phone with
// no login. The same QR is used to check out: if this phone already
// checked in to this event, it opens straight to the check-out button.
export default async function VolunteerCheckInPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ t?: string }>;
}) {
  const { slug } = await params;
  const { t } = await searchParams;
  const admin = createAdminClient();

  const { data: event } = await admin
    .from("volunteer_events")
    .select("id, title, office_id, location_name, starts_at, ends_at, timezone, checkin_token")
    .eq("slug", slug)
    .maybeSingle();

  const valid = !!event && !!t && timingSafeEqualStr(event.checkin_token, t);

  if (!valid) {
    return (
      <main className="min-h-screen px-4 py-16">
        <div className="max-w-md mx-auto text-center">
          <h1 className="text-xl font-semibold">Check-in code not recognized</h1>
          <p className="text-sm text-[var(--color-text-dim)] mt-2">
            This QR code is out of date or incomplete. Please ask a staff member at the volunteer table for the current
            check-in code.
          </p>
        </div>
      </main>
    );
  }

  await admin.rpc("volunteer_auto_checkout");

  const { data: office } = await admin.from("b2s_offices").select("field_office").eq("id", event.office_id).single();

  // Already checked in from this phone?
  let current: { checked_in_at: string; checked_out_at: string | null; checkout_method: string | null; first_name: string; auto_checkout_at: string | null } | null = null;
  const cookieVal = (await cookies()).get(attendanceCookieName(event.id))?.value;
  if (cookieVal) {
    const [attId, selfToken] = cookieVal.split(".");
    const { data: att } = await admin
      .from("volunteer_attendance")
      .select("id, self_token, checked_in_at, checked_out_at, checkout_method, volunteers(first_name)")
      .eq("id", attId)
      .eq("event_id", event.id)
      .maybeSingle();
    if (att && timingSafeEqualStr(att.self_token, selfToken ?? "")) {
      const { data: cutoff } = await admin.rpc("volunteer_checkout_cutoff", { p_attendance_id: att.id });
      current = {
        checked_in_at: att.checked_in_at,
        checked_out_at: att.checked_out_at,
        checkout_method: att.checkout_method,
        first_name: (att as any).volunteers?.first_name ?? "",
        auto_checkout_at: cutoff ?? event.ends_at,
      };
    }
  }

  return (
    <CheckInClient
      slug={slug}
      token={t!}
      event={{
        title: event.title,
        office: office?.field_office ?? "",
        location: event.location_name,
        starts_at: event.starts_at,
        ends_at: event.ends_at,
        timezone: event.timezone || "America/Chicago",
      }}
      current={current}
    />
  );
}
