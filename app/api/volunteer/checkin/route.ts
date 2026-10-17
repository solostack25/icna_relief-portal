import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createAdminClient } from "@/lib/supabase/server";
import { CHECKIN_OPENS_MINUTES_BEFORE } from "@/lib/volunteer";
import {
  attendanceCookieName,
  cleanProfile,
  findVolunteer,
  getWaiver,
  missingDetails,
  parseContact,
  timingSafeEqualStr,
  upsertVolunteer,
  validateWaiver,
  waiverIsCurrent,
} from "@/lib/volunteerServer";

export const dynamic = "force-dynamic";

// Self check-in / check-out from the volunteer's own phone.
//
// The check-in QR code posted at the event encodes
//   /volunteer/public/<slug>/checkin?t=<checkin_token>
// and every action here requires that token — having scanned the code
// on-site is the proof of presence. (The sign-up QR only carries the slug,
// so sharing the sign-up link can't be used to check in remotely.)
//
// actions:
//   lookup   { contact }                      → who is this, what's still needed
//   checkin  { contact, profile?, waiver? }   → creates walk-ins, records waiver, checks in
//   checkout { contact? }                     → closes the open check-in (cookie or contact)

type Body = {
  slug?: string;
  t?: string;
  action?: "lookup" | "checkin" | "checkout";
  contact?: string;
  profile?: Record<string, string>;
  waiver?: { agreed: boolean; signature: string; guardian_name?: string };
};

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as Body | null;
  if (!body?.slug || !body?.t || !body?.action) {
    return NextResponse.json({ error: "Missing event details — please rescan the QR code." }, { status: 400 });
  }

  const admin = createAdminClient();

  const { data: event } = await admin
    .from("volunteer_events")
    .select("id, title, starts_at, ends_at, timezone, checkin_token")
    .eq("slug", body.slug)
    .maybeSingle();

  if (!event || !timingSafeEqualStr(event.checkin_token, String(body.t))) {
    return NextResponse.json(
      { error: "This check-in code is no longer valid. Ask a staff member for the current QR code." },
      { status: 403 }
    );
  }

  // Close anything that should already have been auto-checked-out, so
  // what the volunteer sees is accurate even between cron runs.
  await admin.rpc("volunteer_auto_checkout");

  const now = Date.now();
  const opensAt = event.starts_at ? new Date(event.starts_at).getTime() - CHECKIN_OPENS_MINUTES_BEFORE * 60_000 : null;
  const endsAt = event.ends_at ? new Date(event.ends_at).getTime() : null;

  const cookieStore = await cookies();
  const cookieName = attendanceCookieName(event.id);

  // ---------- CHECKOUT ----------
  if (body.action === "checkout") {
    let attendance: any = null;

    // A typed contact (the "already checked in" screen) wins over this
    // phone's cookie — on a shared family phone the cookie belongs to
    // whoever checked in last.
    const cookieVal = body.contact ? null : cookieStore.get(cookieName)?.value;
    if (cookieVal) {
      const [attId, selfToken] = cookieVal.split(".");
      const { data } = await admin
        .from("volunteer_attendance")
        .select("id, self_token, checked_in_at, checked_out_at, checkout_method")
        .eq("id", attId)
        .eq("event_id", event.id)
        .maybeSingle();
      if (data && timingSafeEqualStr(data.self_token, selfToken ?? "")) attendance = data;
    }

    if (!attendance && body.contact) {
      const volunteer = await findVolunteer(admin, parseContact(body.contact));
      if (volunteer) {
        const { data } = await admin
          .from("volunteer_attendance")
          .select("id, self_token, checked_in_at, checked_out_at, checkout_method")
          .eq("event_id", event.id)
          .eq("volunteer_id", volunteer.id)
          .order("checked_in_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        attendance = data;
      }
    }

    if (!attendance) {
      return NextResponse.json({ error: "We couldn't find your check-in for this event." }, { status: 404 });
    }

    if (!attendance.checked_out_at) {
      const { data, error } = await admin
        .from("volunteer_attendance")
        .update({ checked_out_at: new Date().toISOString(), checkout_method: "self" })
        .eq("id", attendance.id)
        .is("checked_out_at", null)
        .select("id, checked_in_at, checked_out_at, checkout_method")
        .single();
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      attendance = data;
    }

    const hours = (new Date(attendance.checked_out_at).getTime() - new Date(attendance.checked_in_at).getTime()) / 3_600_000;
    const res = NextResponse.json({
      state: "checked_out",
      checked_in_at: attendance.checked_in_at,
      checked_out_at: attendance.checked_out_at,
      method: attendance.checkout_method,
      hours: Math.round(hours * 100) / 100,
    });
    return res;
  }

  // ---------- LOOKUP / CHECKIN ----------
  if (opensAt && now < opensAt) {
    return NextResponse.json({ state: "not_open", opens_at: new Date(opensAt).toISOString() });
  }
  if (endsAt && now >= endsAt) {
    return NextResponse.json({ state: "ended" });
  }

  const contact = parseContact(body.contact);
  if (!contact.email && !contact.phone) {
    return NextResponse.json({ error: "Enter the email or 10-digit phone number you signed up with." }, { status: 400 });
  }

  const waiver = await getWaiver();
  let volunteer = await findVolunteer(admin, contact);

  // Is this person already checked in right now?
  const openAttendance = async (volunteerId: string) => {
    const { data } = await admin
      .from("volunteer_attendance")
      .select("id, self_token, checked_in_at")
      .eq("event_id", event.id)
      .eq("volunteer_id", volunteerId)
      .is("checked_out_at", null)
      .maybeSingle();
    return data;
  };

  const eventSignup = async (volunteerId: string) => {
    const { data } = await admin
      .from("volunteer_signups")
      .select("id, volunteer_slots!inner(event_id)")
      .eq("volunteer_id", volunteerId)
      .eq("status", "signed_up")
      .eq("volunteer_slots.event_id", event.id)
      .limit(1)
      .maybeSingle();
    return data;
  };

  if (body.action === "lookup") {
    if (!volunteer) {
      return NextResponse.json({ state: "new", waiver_text: waiver.text });
    }
    const [open, signup] = await Promise.all([openAttendance(volunteer.id), eventSignup(volunteer.id)]);
    return NextResponse.json({
      state: open ? "already_checked_in" : "found",
      first_name: volunteer.first_name,
      signed_up: !!signup,
      needs_waiver: !waiverIsCurrent(volunteer, waiver.version),
      waiver_text: waiver.text,
      date_of_birth: volunteer.date_of_birth,
      missing: missingDetails(volunteer),
      checked_in_at: open?.checked_in_at ?? null,
    });
  }

  // action === "checkin"
  const profile = cleanProfile({
    ...(body.profile ?? {}),
    // The lookup box value always counts as their contact.
    email: body.profile?.email || contact.email || undefined,
    phone: body.profile?.phone || contact.phone || undefined,
  });

  if (!volunteer && (!profile.first_name || !profile.last_name)) {
    return NextResponse.json({ error: "Please enter your first and last name." }, { status: 400 });
  }

  const needsWaiver = !waiverIsCurrent(volunteer, waiver.version);
  let waiverArg: { input: any; version: string } | null = null;
  if (needsWaiver) {
    const waiverError = validateWaiver(body.waiver, profile.date_of_birth ?? volunteer?.date_of_birth);
    if (waiverError) return NextResponse.json({ error: waiverError }, { status: 400 });
    waiverArg = { input: body.waiver, version: waiver.version };
  }

  if (!volunteer) {
    const result = await upsertVolunteer(admin, profile, waiverArg);
    if (!result.volunteer) {
      return NextResponse.json({ error: result.error ?? "Couldn't save your details." }, { status: 500 });
    }
    volunteer = result.volunteer;
  } else {
    // Returning volunteer: only fill blanks and record the waiver — the
    // check-in screen never asks them to re-enter what's already on file.
    const updates: Record<string, unknown> = Object.fromEntries(
      Object.entries(profile).filter(([k]) => !(volunteer as any)[k])
    );
    if (waiverArg) {
      updates.waiver_signed_at = new Date().toISOString();
      updates.waiver_version = waiverArg.version;
      updates.waiver_signature = String(waiverArg.input.signature).trim().slice(0, 120);
      updates.waiver_guardian_name = waiverArg.input.guardian_name ? String(waiverArg.input.guardian_name).trim().slice(0, 120) : null;
    }
    if (Object.keys(updates).length) {
      updates.updated_at = new Date().toISOString();
      const { error } = await admin.from("volunteers").update(updates).eq("id", volunteer.id);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  const v = volunteer!;
  const existingOpen = await openAttendance(v.id);
  let attendance = existingOpen;
  let already = !!existingOpen;

  if (!attendance) {
    // Link to their sign-up, or record them as a walk-in on the shift
    // happening now (falls back to the first slot on the event).
    let signup = await eventSignup(v.id);
    if (!signup) {
      const { data: slots } = await admin
        .from("volunteer_slots")
        .select("id, slot_type, start_time, end_time")
        .eq("event_id", event.id)
        .order("start_time", { ascending: true, nullsFirst: false });
      type SlotRow = { id: string; slot_type: string; start_time: string | null; end_time: string | null };
      const shifts = ((slots ?? []) as SlotRow[]).filter((s) => s.slot_type === "shift");
      const nowIso = new Date().toISOString();
      const current =
        shifts.find((s) => s.start_time && s.end_time && s.start_time <= nowIso && nowIso < s.end_time) ??
        shifts.find((s) => s.end_time && nowIso < s.end_time) ??
        shifts[0] ??
        (slots ?? [])[0];
      if (current) {
        const { data: created } = await admin
          .from("volunteer_signups")
          .insert({
            slot_id: current.id,
            volunteer_id: v.id,
            name: `${v.first_name} ${v.last_name}`.trim(),
            email: v.email ?? "",
            phone: v.phone,
            qty: 1,
            waiver_signed: true,
            source: "walk_in",
          })
          .select("id, volunteer_slots!inner(event_id)")
          .single();
        signup = created;
      }
    }

    const { data, error } = await admin
      .from("volunteer_attendance")
      .insert({
        event_id: event.id,
        volunteer_id: v.id,
        signup_id: signup?.id ?? null,
        checkin_method: "self",
      })
      .select("id, self_token, checked_in_at")
      .single();

    if (error) {
      // Unique open-check-in index: a double tap raced us. Use that row.
      const raced = await openAttendance(v.id);
      if (!raced) return NextResponse.json({ error: error.message }, { status: 500 });
      attendance = raced;
      already = true;
    } else {
      attendance = data;
    }
  }

  const { data: cutoff } = await admin.rpc("volunteer_checkout_cutoff", { p_attendance_id: attendance!.id });

  const res = NextResponse.json({
    state: "checked_in",
    already,
    first_name: v.first_name,
    checked_in_at: attendance!.checked_in_at,
    auto_checkout_at: cutoff ?? event.ends_at,
  });
  res.cookies.set(cookieName, `${attendance!.id}.${attendance!.self_token}`, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
  return res;
}
