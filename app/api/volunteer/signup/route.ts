import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { refreshPublicWebsite } from "@/lib/publicWebsite";
import { cleanProfile, getWaiver, upsertVolunteer, validateWaiver, waiverIsCurrent } from "@/lib/volunteerServer";

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders() });
}

// Public sign-up — called by the portal's public page (incl. the sign-up QR
// code) and proxied server-to-server by the WordPress plugin.
//
// The WordPress plugin still sends only { slot_id, name, email, phone, qty,
// notes, source }; the portal page also sends first/last name,
// demographics, home address and the waiver. Both paths end up linked to
// one `volunteers` row per person, which is what the hours export and
// retention numbers key off.
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const json = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: corsHeaders() });

  if (!body?.slot_id || !(body?.name || body?.first_name) || !body?.email) {
    return json({ error: "slot_id, name, and email are required" }, 400);
  }

  const admin = createAdminClient();

  // Only slots on published events can be claimed (was enforced by the
  // anon RLS policy; the service role skips RLS, so it's checked here).
  const { data: slot } = await admin
    .from("volunteer_slots")
    .select("id, slot_type, event_id, volunteer_events!inner(id, is_published)")
    .eq("id", body.slot_id)
    .maybeSingle();
  const event = (slot as any)?.volunteer_events;
  if (!slot || !event?.is_published) {
    return json({ error: "This event isn't open for sign-ups." }, 404);
  }

  const fullName = String(body.name ?? `${body.first_name ?? ""} ${body.last_name ?? ""}`).trim().replace(/\s+/g, " ");
  const [firstFromName, ...restFromName] = fullName.split(" ");
  const profile = cleanProfile({
    first_name: body.first_name ?? firstFromName,
    last_name: body.last_name ?? restFromName.join(" "),
    email: body.email,
    phone: body.phone,
    date_of_birth: body.date_of_birth,
    gender: body.gender,
    ethnicity: body.ethnicity,
    home_city: body.home_city,
    home_state: body.home_state,
    home_zip: body.home_zip,
  });
  if (!profile.email) return json({ error: "Please enter a valid email address." }, 400);

  // Waiver is optional at sign-up (WordPress doesn't collect it); when it
  // is sent it must be complete. Anyone without a current waiver signs it
  // at check-in instead.
  const waiver = await getWaiver();
  let waiverArg: { input: any; version: string } | null = null;
  if (body.waiver?.agreed) {
    const waiverError = validateWaiver(body.waiver, profile.date_of_birth ?? body.date_of_birth);
    if (waiverError) return json({ error: waiverError }, 400);
    waiverArg = { input: body.waiver, version: waiver.version };
  }

  const { volunteer, error: volunteerError } = await upsertVolunteer(admin, profile, waiverArg);
  if (!volunteer) return json({ error: volunteerError ?? "Couldn't save your details." }, 500);

  // Same person, same slot, already signed up → treat as success.
  const { data: dupe } = await admin
    .from("volunteer_signups")
    .select("id")
    .eq("slot_id", body.slot_id)
    .eq("volunteer_id", volunteer.id)
    .eq("status", "signed_up")
    .maybeSingle();
  if (dupe) {
    return json({ ok: true, already: true, waiver_on_file: waiverIsCurrent(volunteer, waiver.version) });
  }

  const source = ["wordpress", "website", "qr"].includes(body.source) ? body.source : "portal";
  const { error } = await admin.from("volunteer_signups").insert({
    slot_id: body.slot_id,
    volunteer_id: volunteer.id,
    name: `${volunteer.first_name} ${volunteer.last_name}`.trim(),
    email: volunteer.email ?? profile.email,
    phone: volunteer.phone,
    qty: body.qty ? Math.max(1, Number(body.qty) || 1) : 1,
    notes: body.notes ? String(body.notes).trim().slice(0, 1000) : null,
    waiver_signed: waiverIsCurrent(volunteer, waiver.version),
    source,
  });

  if (error) {
    // Raised by the check_volunteer_slot_capacity trigger — someone
    // else took the last spot between page load and submit.
    if (error.message?.includes("slot_full")) {
      return json({ error: "That slot just filled up — please pick another." }, 409);
    }
    return json({ error: error.message }, 500);
  }

  // Spots-left counts appear on the public website; refresh them there.
  await refreshPublicWebsite();
  return json({ ok: true, waiver_on_file: waiverIsCurrent(volunteer, waiver.version) });
}
