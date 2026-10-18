import { createAdminClient } from "@/lib/supabase/server";
import { CLEANER_ZIP_OFFICES, CLEANER_ZIP_ROWS } from "./cleanerZipList";

// Server-only. Address → office, using the same rules the Master Cleaner
// used (see the resolve_office() SQL function):
//   Salesforce contact "Region" alias → split-state zip → city → state
//   default → the state's office → Unassigned.

export type ResolvedOffice = { office_id: string | null; method: "region" | "zip" | "city" | "state_default" | "state" | "unassigned" };

export async function resolveOffice(
  state: string | null | undefined,
  city?: string | null,
  zip?: string | null,
  regionAlias?: string | null
): Promise<ResolvedOffice> {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("resolve_office", {
    p_state: state ?? "",
    p_city: city ?? null,
    p_zip: zip ?? null,
    p_region_alias: regionAlias ?? null,
  });
  if (error) throw new Error(error.message);
  const row = (Array.isArray(data) ? data[0] : data) as ResolvedOffice | undefined;
  return row ?? { office_id: null, method: "unassigned" };
}

// Loads the cleaner's zip list into geo_zip_offices. "missing" adds only
// zips/cities not already there (keeps admin edits); "reset" first removes
// every row that came from the cleaner list and reloads it (admin-added
// rows are kept).
export async function loadCleanerZipList(mode: "missing" | "reset" = "missing"): Promise<{ inserted: number }> {
  const admin = createAdminClient();
  const { data: offices } = await admin.from("b2s_offices").select("id, field_office");
  const officeId = new Map(((offices ?? []) as { id: string; field_office: string }[]).map((o) => [o.field_office, o.id]));

  if (mode === "reset") {
    const { error } = await admin.from("geo_zip_offices").delete().eq("source", "cleaner");
    if (error) throw new Error(error.message);
  }

  // Page through what's already there (reads are capped at 1,000 rows).
  const have = new Set<string>();
  for (let from = 0; ; from += 1000) {
    const { data } = await admin.from("geo_zip_offices").select("state, zip, city").order("id").range(from, from + 999);
    const page = (data ?? []) as { state: string; zip: string | null; city: string | null }[];
    for (const r of page) have.add(r.zip ? `${r.state}|z|${r.zip}` : `${r.state}|c|${(r.city ?? "").toLowerCase()}`);
    if (page.length < 1000) break;
  }

  const rows: { state: string; zip: string | null; city: string | null; county: string | null; office_id: string; source: string }[] = [];
  for (const line of CLEANER_ZIP_ROWS.split("\n")) {
    const [state, zip, city, county, k] = line.split("|");
    const office = officeId.get(CLEANER_ZIP_OFFICES[Number(k)]);
    if (!office) continue;
    const key = zip ? `${state}|z|${zip}` : `${state}|c|${city.toLowerCase()}`;
    if (have.has(key)) continue;
    have.add(key);
    rows.push({ state, zip: zip || null, city: city || null, county: county || null, office_id: office, source: "cleaner" });
  }

  for (let i = 0; i < rows.length; i += 1000) {
    const { error } = await admin.from("geo_zip_offices").insert(rows.slice(i, i + 1000));
    if (error) throw new Error(error.message);
  }
  return { inserted: rows.length };
}

// Make sure the lookup has data before anything depends on it.
export async function ensureZipListLoaded(): Promise<void> {
  const admin = createAdminClient();
  const { count } = await admin.from("geo_zip_offices").select("id", { count: "exact", head: true }).eq("source", "cleaner");
  if ((count ?? 0) === 0) await loadCleanerZipList("missing");
}
