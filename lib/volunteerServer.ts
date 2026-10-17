import { createAdminClient } from "@/lib/supabase/server";
import { getIntegrationSetting } from "@/lib/integrationSettings";
import {
  DEFAULT_WAIVER_TEXT,
  WAIVER_VERSION,
  VOLUNTEER_ETHNICITIES,
  VOLUNTEER_GENDERS,
  US_STATES,
  ageOn,
  type VolunteerProfileInput,
  type WaiverInput,
} from "@/lib/volunteer";

// Server-only. Every public volunteer route (sign-up, QR check-in, self
// check-out) writes through the service role AFTER checking the event's
// published flag or check-in token itself — anon has no direct access to
// the volunteers / volunteer_attendance tables.

type Admin = ReturnType<typeof createAdminClient>;

export async function getWaiver(): Promise<{ text: string; version: string }> {
  const [text, version] = await Promise.all([
    getIntegrationSetting("volunteer_waiver_text"),
    getIntegrationSetting("volunteer_waiver_version"),
  ]);
  return { text: text || DEFAULT_WAIVER_TEXT, version: (text && version) || WAIVER_VERSION };
}

export function normalizeEmail(v: unknown): string | null {
  const s = String(v ?? "").trim().toLowerCase();
  return s && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) ? s : null;
}

export function phoneDigits(v: unknown): string | null {
  let d = String(v ?? "").replace(/\D/g, "");
  if (d.length === 11 && d.startsWith("1")) d = d.slice(1);
  return d.length === 10 ? d : null;
}

// One box on the check-in screen takes either an email or a phone number.
export function parseContact(raw: unknown): { email: string | null; phone: string | null } {
  const s = String(raw ?? "").trim();
  if (s.includes("@")) return { email: normalizeEmail(s), phone: null };
  return { email: null, phone: phoneDigits(s) };
}

export type VolunteerRow = {
  id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  date_of_birth: string | null;
  gender: string | null;
  ethnicity: string | null;
  home_city: string | null;
  home_state: string | null;
  home_zip: string | null;
  waiver_version: string | null;
  waiver_signed_at: string | null;
};

const VOLUNTEER_COLS =
  "id, first_name, last_name, email, phone, date_of_birth, gender, ethnicity, home_city, home_state, home_zip, waiver_version, waiver_signed_at";

export async function findVolunteer(
  admin: Admin,
  contact: { email: string | null; phone: string | null }
): Promise<VolunteerRow | null> {
  if (contact.email) {
    const { data } = await admin.from("volunteers").select(VOLUNTEER_COLS).ilike("email", contact.email).maybeSingle();
    if (data) return data as VolunteerRow;
  }
  if (contact.phone) {
    // Several people can share a family phone; only match when unambiguous.
    const { data } = await admin.from("volunteers").select(VOLUNTEER_COLS).eq("phone_digits", contact.phone).limit(2);
    if (data && data.length === 1) return data[0] as VolunteerRow;
  }
  return null;
}

// Cleans user-supplied profile fields. Anything invalid or blank is
// dropped (never overwrites good data with junk).
export function cleanProfile(p: VolunteerProfileInput | undefined | null): Partial<VolunteerRow> {
  if (!p) return {};
  const out: Partial<VolunteerRow> = {};
  const str = (v: unknown, max = 120) => {
    const s = String(v ?? "").trim().replace(/\s+/g, " ");
    return s ? s.slice(0, max) : null;
  };
  const first = str(p.first_name, 80);
  const last = str(p.last_name, 80);
  if (first) out.first_name = first;
  if (last) out.last_name = last;
  const email = normalizeEmail(p.email);
  if (email) out.email = email;
  const phone = phoneDigits(p.phone);
  if (phone) out.phone = `(${phone.slice(0, 3)}) ${phone.slice(3, 6)}-${phone.slice(6)}`;
  if (p.date_of_birth && /^\d{4}-\d{2}-\d{2}$/.test(p.date_of_birth)) {
    const age = ageOn(p.date_of_birth);
    if (age !== null && age >= 0 && age < 110) out.date_of_birth = p.date_of_birth;
  }
  if (p.gender && (VOLUNTEER_GENDERS as readonly string[]).includes(p.gender)) out.gender = p.gender;
  if (p.ethnicity && (VOLUNTEER_ETHNICITIES as readonly string[]).includes(p.ethnicity)) out.ethnicity = p.ethnicity;
  const city = str(p.home_city, 80);
  if (city) out.home_city = city;
  const state = str(p.home_state, 2)?.toUpperCase();
  if (state && (US_STATES as readonly string[]).includes(state)) out.home_state = state;
  const zip = String(p.home_zip ?? "").match(/\d{5}/)?.[0];
  if (zip) out.home_zip = zip;
  return out;
}

export function waiverIsCurrent(v: Pick<VolunteerRow, "waiver_version"> | null, version: string) {
  return !!v && v.waiver_version === version;
}

// Returns an error message, or null when the waiver input is acceptable.
export function validateWaiver(
  w: WaiverInput | undefined | null,
  dob: string | null | undefined
): string | null {
  if (!w?.agreed) return "Please read and agree to the volunteer waiver.";
  if (!String(w.signature ?? "").trim()) return "Type your full name to sign the waiver.";
  const age = ageOn(dob ?? null);
  if (age !== null && age < 18 && !String(w.guardian_name ?? "").trim()) {
    return "Volunteers under 18 need a parent or guardian's name on the waiver.";
  }
  return null;
}

// Find-or-create by email/phone, then fill in any newly supplied details.
export async function upsertVolunteer(
  admin: Admin,
  profile: Partial<VolunteerRow>,
  waiver?: { input: WaiverInput; version: string } | null
): Promise<{ volunteer: VolunteerRow | null; error: string | null }> {
  const existing = await findVolunteer(admin, {
    email: profile.email ?? null,
    phone: profile.phone ? phoneDigits(profile.phone) : null,
  });

  const waiverFields = waiver
    ? {
        waiver_signed_at: new Date().toISOString(),
        waiver_version: waiver.version,
        waiver_signature: String(waiver.input.signature).trim().slice(0, 120),
        waiver_guardian_name: waiver.input.guardian_name ? String(waiver.input.guardian_name).trim().slice(0, 120) : null,
      }
    : {};

  if (existing) {
    // Don't let a typo'd phone-only lookup rewrite someone's email.
    const updates: Record<string, unknown> = { ...profile, ...waiverFields, updated_at: new Date().toISOString() };
    if (existing.email && profile.email && existing.email !== profile.email) delete updates.email;
    const { data, error } = await admin
      .from("volunteers")
      .update(updates)
      .eq("id", existing.id)
      .select(VOLUNTEER_COLS)
      .single();
    return { volunteer: (data as VolunteerRow) ?? existing, error: error?.message ?? null };
  }

  if (!profile.first_name) return { volunteer: null, error: "First name is required." };
  if (!profile.email && !profile.phone) return { volunteer: null, error: "An email or phone number is required." };

  const { data, error } = await admin
    .from("volunteers")
    .insert({ last_name: "", ...profile, ...waiverFields })
    .select(VOLUNTEER_COLS)
    .single();
  return { volunteer: (data as VolunteerRow) ?? null, error: error?.message ?? null };
}

export function missingDetails(v: VolunteerRow | null): string[] {
  if (!v) return [];
  const missing: string[] = [];
  if (!v.date_of_birth) missing.push("date_of_birth");
  if (!v.gender) missing.push("gender");
  if (!v.ethnicity) missing.push("ethnicity");
  if (!v.home_zip) missing.push("home_zip");
  return missing;
}

export function attendanceCookieName(eventId: string) {
  return `vol_att_${eventId.replace(/-/g, "")}`;
}

export function timingSafeEqualStr(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function siteUrl(fallbackOrigin?: string) {
  return (process.env.NEXT_PUBLIC_SITE_URL || fallbackOrigin || "").replace(/\/$/, "");
}
