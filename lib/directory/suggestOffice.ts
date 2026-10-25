// Guess which portal office an Entra user belongs to from whatever location
// info Entra has (Office Location, State, City, address). Pure function so the
// page can compute it server-side and the logic is easy to tune.

export type OfficeLite = { id: string; field_office: string; state: string | null; entra_office_names: string[] | null };
export type DirLocation = {
  office_location: string | null;
  state: string | null;
  city: string | null;
  street_address: string | null;
  postal_code: string | null;
  department: string | null;
};
export type Suggestion = { officeId: string; confidence: "exact" | "strong" | "weak"; why: string };

const STATES: Record<string, string> = {
  AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California", CO: "Colorado", CT: "Connecticut",
  DE: "Delaware", DC: "District of Columbia", FL: "Florida", GA: "Georgia", HI: "Hawaii", ID: "Idaho", IL: "Illinois",
  IN: "Indiana", IA: "Iowa", KS: "Kansas", KY: "Kentucky", LA: "Louisiana", ME: "Maine", MD: "Maryland",
  MA: "Massachusetts", MI: "Michigan", MN: "Minnesota", MS: "Mississippi", MO: "Missouri", MT: "Montana",
  NE: "Nebraska", NV: "Nevada", NH: "New Hampshire", NJ: "New Jersey", NM: "New Mexico", NY: "New York",
  NC: "North Carolina", ND: "North Dakota", OH: "Ohio", OK: "Oklahoma", OR: "Oregon", PA: "Pennsylvania",
  RI: "Rhode Island", SC: "South Carolina", SD: "South Dakota", TN: "Tennessee", TX: "Texas", UT: "Utah",
  VT: "Vermont", VA: "Virginia", WA: "Washington", WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming",
};
const NAME_TO_ABBR = Object.fromEntries(Object.entries(STATES).map(([a, n]) => [n.toLowerCase(), a]));

const norm = (s: string | null | undefined) =>
  (s ?? "")
    .toLowerCase()
    .replace(/icna relief|resource center|field office|\boffice\b|statewide/g, " ")
    .replace(/[^a-z ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

// Words in an office name that identify its city ("Dallas", "Bay Area").
const cityWords = (office: OfficeLite) => norm(office.field_office).split(" ").filter((w) => w.length > 2 && !NAME_TO_ABBR[w]);

/** Two-letter state from any of: "TX", "Texas", "Texas-Dallas", "CA ICNA Relief…". */
export function stateAbbr(...vals: (string | null | undefined)[]): string | null {
  for (const v of vals) {
    if (!v) continue;
    const t = v.trim();
    if (/^[A-Z]{2}$/.test(t) && STATES[t]) return t;
    const lead = t.match(/^([A-Z]{2})\b/);
    if (lead && STATES[lead[1]]) return lead[1];
    const low = t.toLowerCase();
    // Longest names first so "West Virginia" wins over "Virginia".
    for (const name of Object.keys(NAME_TO_ABBR).sort((a, b) => b.length - a.length)) if (low.includes(name)) return NAME_TO_ABBR[name];
  }
  return null;
}

export function suggestOffice(u: DirLocation, offices: OfficeLite[]): Suggestion | null {
  const loc = (u.office_location ?? "").trim().toLowerCase();

  // 1. Office Location already matches an office exactly.
  if (loc) {
    for (const o of offices) {
      const names = [o.field_office, ...(o.entra_office_names ?? [])].map((n) => n.trim().toLowerCase());
      if (names.includes(loc)) return { officeId: o.id, confidence: "exact", why: "Office Location matches" };
    }
  }

  const st = stateAbbr(u.state, u.office_location, u.street_address);
  const haystack = norm([u.office_location, u.city, u.street_address, u.department].filter(Boolean).join(" "));

  // 2. A city named in their location/city/address matches an office's city.
  const physical = offices.filter((o) => !/statewide/i.test(o.field_office));
  const pool = st ? physical.filter((o) => o.state === st) : physical;
  for (const o of pool) {
    const words = cityWords(o);
    if (words.length && words.every((w) => haystack.includes(w)))
      return { officeId: o.id, confidence: "strong", why: `${u.city || u.office_location} → ${o.field_office}` };
  }

  if (!st) return null;
  // 3. Only one physical office in their state.
  const inState = physical.filter((o) => o.state === st);
  if (inState.length === 1) return { officeId: inState[0].id, confidence: "strong", why: `Only ${STATES[st]} office` };
  // 4. No physical office in the state → that state's Statewide entry, if any.
  if (inState.length === 0) {
    const sw = offices.find((o) => o.state === st && /statewide/i.test(o.field_office));
    if (sw) return { officeId: sw.id, confidence: "strong", why: `No office in ${STATES[st]}, statewide` };
  }
  // 5. Several offices in the state: point at the first, flagged as a guess.
  if (inState.length > 1) return { officeId: inState[0].id, confidence: "weak", why: `${STATES[st]} has ${inState.length} offices, pick one` };
  return null;
}
