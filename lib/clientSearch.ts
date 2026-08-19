import type { SupabaseClient } from "@supabase/supabase-js";

export type ClientFilter = "all" | "housing" | "backpacks";

export const FILTER_LABELS: Record<ClientFilter, string> = {
  all: "All Clients",
  housing: "In Transitional Housing",
  backpacks: "Received Backpacks",
};

const HOUSING_KEYWORDS = ["housing", "house", "shelter"];
const BACKPACK_KEYWORDS = ["backpack"];

// Recognizes a handful of common questions ("how many clients are in
// transitional houses", "who received backpacks") and maps them to a
// structured filter instead of running them as literal text search — a
// literal ilike match against name/address fields for a whole sentence
// like that would just return nothing.
export function detectFilterFromQuery(rawTerm: string): ClientFilter | null {
  const lower = rawTerm.toLowerCase();
  if (BACKPACK_KEYWORDS.some((k) => lower.includes(k))) return "backpacks";
  if (HOUSING_KEYWORDS.some((k) => lower.includes(k))) return "housing";
  return null;
}

const TEXT_SEARCH_COLUMNS = [
  "first_name",
  "last_name",
  "phone",
  "email",
  "client_number",
  "household_key",
  "address_line1",
  "city",
  "state",
  "country_of_birth",
  "country_of_citizenship",
  "gender",
  "marital_status",
  "residency_status",
  "race_ethnicity",
  "employment_type",
  "monthly_income_range",
];

// Returns a Supabase `.or()` filter string, or null if the term doesn't
// produce a usable filter (blank, or fully consumed by a keyword trigger
// handled elsewhere).
export function buildTextSearchFilter(rawTerm: string): string | null {
  const term = rawTerm.trim();
  if (!term) return null;

  const isoDate = term.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const usDate = term.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (isoDate) return `dob.eq.${term}`;
  if (usDate) {
    const [, mm, dd, yyyy] = usDate;
    return `dob.eq.${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
  }

  if (/^\d{5}$/.test(term)) return `zip.eq.${term}`;

  const lower = term.toLowerCase();
  if (lower === "snap") return "snap.eq.true";
  if (lower === "wic") return "wic.eq.true";
  if (lower === "chip") return "chip.eq.true";
  if (lower === "employed") return "employed.eq.true";
  if (lower === "unemployed") return "employed.eq.false";

  return TEXT_SEARCH_COLUMNS.map((col) => `${col}.ilike.%${term}%`).join(",");
}

// housing/backpacks require a join, which Supabase's simple .or() can't
// express — resolve to a client_id list first, then filter with .in().
export async function fetchFilteredClientIds(
  supabase: SupabaseClient,
  filter: ClientFilter
): Promise<string[] | null> {
  if (filter === "housing") {
    const { data } = await supabase.from("th_stays").select("client_id").eq("status", "active");
    return Array.from(new Set((data ?? []).map((r: { client_id: string }) => r.client_id)));
  }
  if (filter === "backpacks") {
    const { data } = await supabase.from("b2s_client_distributions").select("client_id");
    return Array.from(new Set((data ?? []).map((r: { client_id: string }) => r.client_id)));
  }
  return null;
}

export const CLIENT_LIST_COLUMNS =
  "id, client_number, first_name, last_name, dob, phone, city, state, zip, household_key";

export type ClientRow = {
  id: string;
  client_number: string;
  first_name: string;
  last_name: string;
  dob: string | null;
  phone: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  household_key: string | null;
};

export function formatDob(dob: string | null): string {
  if (!dob) return "—";
  const [y, m, d] = dob.split("-");
  return `${m}/${d}/${y}`;
}
