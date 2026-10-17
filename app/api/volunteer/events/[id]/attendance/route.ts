import { NextRequest, NextResponse } from "next/server";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { cleanProfile, getWaiver, parseContact, upsertVolunteer } from "@/lib/volunteerServer";

export const dynamic = "force-dynamic";

// Staff attendance actions for one event. Allowed for admins and staff
// assigned to the event's office (same rule as the attendance RLS policy).
//
// actions:
//   check_in   { volunteer_id, signup_id? }
//   check_out  { attendance_id }
//   adjust     { attendance_id, checked_in_at, checked_out_at|null }   (UTC ISO)
//   delete     { attendance_id }
//   walk_in    { first_name, last_name, contact, paper_waiver }        (adds + checks in)
//   cancel_signup { signup_id }
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: eventId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  const [{ data: me }, { data: event }] = await Promise.all([
    admin.from("employees").select("id, role, assigned_office_id").eq("auth_user_id", user.id).maybeSingle(),
    admin.from("volunteer_events").select("id, office_id").eq("id", eventId).maybeSingle(),
  ]);
  if (!event) return NextResponse.json({ error: "Event not found" }, { status: 404 });
  if (!me || (me.role !== "admin" && me.assigned_office_id !== event.office_id)) {
    return NextResponse.json({ error: "Only staff from this event's office can manage attendance." }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const action = body?.action as string;
  const note = `by ${user.email ?? "staff"}`;

  const attendanceOfEvent = async (attendanceId: string) => {
    const { data } = await admin
      .from("volunteer_attendance")
      .select("id, checked_in_at, checked_out_at")
      .eq("id", attendanceId)
      .eq("event_id", eventId)
      .maybeSingle();
    return data;
  };

  const checkIn = async (volunteerId: string, signupId: string | null) => {
    const { data: open } = await admin
      .from("volunteer_attendance")
      .select("id")
      .eq("event_id", eventId)
      .eq("volunteer_id", volunteerId)
      .is("checked_out_at", null)
      .maybeSingle();
    if (open) return { ok: true, already: true };
    const { error } = await admin.from("volunteer_attendance").insert({
      event_id: eventId,
      volunteer_id: volunteerId,
      signup_id: signupId,
      checkin_method: "staff",
      staff_note: `checked in ${note}`,
    });
    return error ? { error: error.message } : { ok: true };
  };

  if (action === "check_in") {
    if (!body.volunteer_id) return NextResponse.json({ error: "volunteer_id required" }, { status: 400 });
    if (body.signup_id) {
      const { data: su } = await admin
        .from("volunteer_signups")
        .select("id, volunteer_slots!inner(event_id)")
        .eq("id", body.signup_id)
        .eq("volunteer_slots.event_id", eventId)
        .maybeSingle();
      if (!su) return NextResponse.json({ error: "Sign-up not on this event" }, { status: 400 });
    }
    const r = await checkIn(body.volunteer_id, body.signup_id ?? null);
    return NextResponse.json(r, { status: "error" in r ? 500 : 200 });
  }

  if (action === "check_out" || action === "delete" || action === "adjust") {
    const att = await attendanceOfEvent(String(body.attendance_id ?? ""));
    if (!att) return NextResponse.json({ error: "Attendance not found" }, { status: 404 });

    if (action === "delete") {
      const { error } = await admin.from("volunteer_attendance").delete().eq("id", att.id);
      return NextResponse.json(error ? { error: error.message } : { ok: true }, { status: error ? 500 : 200 });
    }

    if (action === "check_out") {
      if (att.checked_out_at) return NextResponse.json({ ok: true, already: true });
      const { error } = await admin
        .from("volunteer_attendance")
        .update({ checked_out_at: new Date().toISOString(), checkout_method: "staff", staff_note: `checked out ${note}` })
        .eq("id", att.id);
      return NextResponse.json(error ? { error: error.message } : { ok: true }, { status: error ? 500 : 200 });
    }

    // adjust
    const inAt = new Date(body.checked_in_at);
    const outAt = body.checked_out_at ? new Date(body.checked_out_at) : null;
    if (isNaN(inAt.getTime()) || (outAt && isNaN(outAt.getTime()))) {
      return NextResponse.json({ error: "Invalid time" }, { status: 400 });
    }
    if (outAt && outAt < inAt) return NextResponse.json({ error: "Check-out must be after check-in." }, { status: 400 });
    if (outAt && outAt.getTime() - inAt.getTime() > 24 * 3_600_000) {
      return NextResponse.json({ error: "A single check-in can't be longer than 24 hours." }, { status: 400 });
    }
    const { error } = await admin
      .from("volunteer_attendance")
      .update({
        checked_in_at: inAt.toISOString(),
        checked_out_at: outAt ? outAt.toISOString() : null,
        checkout_method: outAt ? "staff" : null,
        staff_note: `times adjusted ${note}`,
      })
      .eq("id", att.id);
    return NextResponse.json(error ? { error: error.message } : { ok: true }, { status: error ? 500 : 200 });
  }

  if (action === "cancel_signup") {
    const { data: su } = await admin
      .from("volunteer_signups")
      .select("id, volunteer_slots!inner(event_id)")
      .eq("id", String(body.signup_id ?? ""))
      .eq("volunteer_slots.event_id", eventId)
      .maybeSingle();
    if (!su) return NextResponse.json({ error: "Sign-up not found" }, { status: 404 });
    const { error } = await admin.from("volunteer_signups").update({ status: "cancelled" }).eq("id", su.id);
    return NextResponse.json(error ? { error: error.message } : { ok: true }, { status: error ? 500 : 200 });
  }

  if (action === "walk_in") {
    const contact = parseContact(body.contact);
    const profile = cleanProfile({
      first_name: body.first_name,
      last_name: body.last_name,
      email: contact.email ?? undefined,
      phone: contact.phone ?? undefined,
    });
    if (!profile.first_name || !profile.last_name) {
      return NextResponse.json({ error: "First and last name are required." }, { status: 400 });
    }
    if (!profile.email && !profile.phone) {
      return NextResponse.json({ error: "Enter a valid email or 10-digit phone number." }, { status: 400 });
    }
    const waiver = await getWaiver();
    const { volunteer, error } = await upsertVolunteer(
      admin,
      profile,
      body.paper_waiver ? { input: { agreed: true, signature: "(paper waiver on file)" }, version: waiver.version } : null
    );
    if (!volunteer) return NextResponse.json({ error: error ?? "Couldn't save volunteer" }, { status: 500 });

    // Put them on the event as a walk-in sign-up so they show on the roster.
    const { data: slots } = await admin
      .from("volunteer_slots")
      .select("id, slot_type, start_time, end_time")
      .eq("event_id", eventId)
      .order("start_time", { ascending: true, nullsFirst: false });
    const nowIso = new Date().toISOString();
    type SlotRow = { id: string; slot_type: string; start_time: string | null; end_time: string | null };
      const shifts = ((slots ?? []) as SlotRow[]).filter((s) => s.slot_type === "shift");
    const slot =
      shifts.find((s) => s.start_time && s.end_time && s.start_time <= nowIso && nowIso < s.end_time) ??
      shifts.find((s) => s.end_time && nowIso < s.end_time) ??
      shifts[0] ??
      (slots ?? [])[0];

    let signupId: string | null = null;
    if (slot) {
      const { data: existing } = await admin
        .from("volunteer_signups")
        .select("id, volunteer_slots!inner(event_id)")
        .eq("volunteer_id", volunteer.id)
        .eq("status", "signed_up")
        .eq("volunteer_slots.event_id", eventId)
        .limit(1)
        .maybeSingle();
      if (existing) {
        signupId = existing.id;
      } else {
        const { data: created } = await admin
          .from("volunteer_signups")
          .insert({
            slot_id: slot.id,
            volunteer_id: volunteer.id,
            name: `${volunteer.first_name} ${volunteer.last_name}`.trim(),
            email: volunteer.email ?? "",
            phone: volunteer.phone,
            qty: 1,
            waiver_signed: !!body.paper_waiver,
            source: "walk_in",
          })
          .select("id")
          .single();
        signupId = created?.id ?? null;
      }
    }

    const r = await checkIn(volunteer.id, signupId);
    return NextResponse.json(r, { status: "error" in r ? 500 : 200 });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
