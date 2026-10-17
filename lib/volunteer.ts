// Shared volunteer constants + types. Safe to import from client components
// (no server imports here — the server-only helpers live in
// lib/volunteerServer.ts).
//
// Value lists match what the Master Cleaner's Volunteers report expected
// (program names / PSN, ethnicity / ESN), so the portal's export drops
// straight into the existing Power BI model with no cleaning step.

export const VOLUNTEER_PROGRAMS = [
  "Hunger Prevention",
  "Back2School",
  "Refugee Services & Community Empowerment",
  "Muslim Family Services",
  "FATE",
  "Disaster Relief Services",
  "Health Services",
  "Transitional Housing",
  "Outreach",
  "General",
] as const;

export const PROGRAM_PSN: Record<string, number> = {
  Back2School: 1,
  "Disaster Relief Services": 2,
  "Health Services": 3,
  "Hunger Prevention": 4,
  "Muslim Family Services": 5,
  FATE: 5.5,
  "Refugee Services & Community Empowerment": 6,
  "Transitional Housing": 7,
  Outreach: 8,
  General: 9,
};

export const VOLUNTEER_ETHNICITIES = [
  "Asian",
  "Black or African-American",
  "Hispanic or Latino",
  "Middle Eastern or North African",
  "Native American or Indigenous",
  "Pacific Islander",
  "White or Caucasian",
  "Two or More",
  "Prefer not to say",
] as const;

export const ETHNICITY_ESN: Record<string, number> = {
  Asian: 1,
  "Black or African-American": 2,
  "Hispanic or Latino": 3,
  "Middle Eastern or North African": 4,
  "Native American or Indigenous": 5,
  "Pacific Islander": 6,
  "White or Caucasian": 7,
  "Two or More": 8,
};

export const VOLUNTEER_GENDERS = ["Male", "Female", "Prefer not to say"] as const;

export const US_STATES = [
  "AL","AK","AZ","AR","CA","CO","CT","DE","DC","FL","GA","HI","ID","IL","IN","IA","KS","KY","LA","ME",
  "MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA","PR",
  "RI","SC","SD","TN","TX","UT","VT","VA","WA","WV","WI","WY",
] as const;

// Bump the version whenever the waiver wording changes — everyone is
// asked to sign again on their next sign-up or check-in.
export const WAIVER_VERSION = "2026-10";

// Placeholder language until ICNA Relief's legal waiver is supplied.
// Replace the text (and bump WAIVER_VERSION) — or set the
// integration_settings key `volunteer_waiver_text` to override it without
// a deploy (version then comes from `volunteer_waiver_version`).
export const DEFAULT_WAIVER_TEXT = `I am volunteering with ICNA Relief USA of my own free will and without pay. I understand that volunteer activities may involve physical work, lifting, and other risks, and I agree to follow staff instructions and safety guidelines.

I release ICNA Relief USA, its staff, and its partners from liability for injury, loss, or damage arising from my participation, except where caused by their gross negligence.

I authorize ICNA Relief USA to use photos or video taken during volunteer events for its programs and communications, unless I tell staff on-site that I opt out.

If I am under 18, my parent or legal guardian agrees to these terms on my behalf.`;

export type VolunteerProfileInput = {
  first_name?: string;
  last_name?: string;
  email?: string;
  phone?: string;
  date_of_birth?: string; // YYYY-MM-DD
  gender?: string;
  ethnicity?: string;
  home_city?: string;
  home_state?: string;
  home_zip?: string;
};

export type WaiverInput = {
  agreed: boolean;
  signature: string; // typed full name
  guardian_name?: string;
};

export function ageOn(dob: string | null | undefined, on: Date = new Date()): number | null {
  if (!dob) return null;
  const d = new Date(dob + "T00:00:00");
  if (isNaN(d.getTime())) return null;
  let age = on.getFullYear() - d.getFullYear();
  const m = on.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && on.getDate() < d.getDate())) age--;
  return age;
}

export function formatInTz(iso: string | null | undefined, tz: string, opts?: Intl.DateTimeFormatOptions) {
  if (!iso) return "";
  return new Date(iso).toLocaleString("en-US", {
    timeZone: tz,
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    ...opts,
  });
}

export function formatTimeInTz(iso: string | null | undefined, tz: string) {
  return formatInTz(iso, tz, { month: undefined, day: undefined });
}

// "2026-10-20T09:00" typed in an office's time zone → UTC ISO string.
// datetime-local inputs carry no zone, and staff may be setting up an event
// for another office, so the conversion has to use the event's zone.
export function zonedLocalToUtcIso(local: string, tz: string): string {
  const [datePart, timePart = "00:00"] = local.split("T");
  const [y, mo, d] = datePart.split("-").map(Number);
  const [h, mi] = timePart.split(":").map(Number);
  const guess = Date.UTC(y, mo - 1, d, h, mi);
  const offsetAt = (ms: number) => {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).formatToParts(new Date(ms));
    const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
    const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"));
    return asUtc - ms;
  };
  let ms = guess - offsetAt(guess);
  ms = guess - offsetAt(ms); // second pass settles DST edges
  return new Date(ms).toISOString();
}

// UTC ISO → "YYYY-MM-DDTHH:mm" in the given zone, for datetime-local inputs.
export function utcIsoToZonedLocal(iso: string | null | undefined, tz: string): string {
  if (!iso) return "";
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(new Date(iso));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
}

export const US_TIMEZONES = [
  { value: "America/New_York", label: "Eastern" },
  { value: "America/Chicago", label: "Central" },
  { value: "America/Denver", label: "Mountain" },
  { value: "America/Phoenix", label: "Arizona" },
  { value: "America/Los_Angeles", label: "Pacific" },
  { value: "America/Anchorage", label: "Alaska" },
  { value: "Pacific/Honolulu", label: "Hawaii" },
  { value: "America/Puerto_Rico", label: "Puerto Rico" },
];

export function guessOfficeTimezone(state: string | null | undefined): string {
  const s = (state ?? "").toUpperCase();
  const eastern = ["CT","DE","DC","FL","GA","IN","KY","ME","MD","MA","MI","NH","NJ","NY","NC","OH","PA","RI","SC","VT","VA","WV"];
  const central = ["AL","AR","IL","IA","KS","LA","MN","MS","MO","NE","ND","OK","SD","TN","TX","WI"];
  const mountain = ["CO","ID","MT","NM","UT","WY"];
  const pacific = ["CA","NV","OR","WA"];
  if (eastern.includes(s)) return "America/New_York";
  if (central.includes(s)) return "America/Chicago";
  if (mountain.includes(s)) return "America/Denver";
  if (pacific.includes(s)) return "America/Los_Angeles";
  if (s === "AZ") return "America/Phoenix";
  if (s === "AK") return "America/Anchorage";
  if (s === "HI") return "Pacific/Honolulu";
  if (s === "PR") return "America/Puerto_Rico";
  return "America/Chicago";
}

// Self check-in opens this long before the event's start time.
export const CHECKIN_OPENS_MINUTES_BEFORE = 60;
