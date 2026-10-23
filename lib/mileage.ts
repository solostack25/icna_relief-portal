import { createAdminClient } from "@/lib/supabase/server";
import { getIntegrationSetting } from "@/lib/integrationSettings";
import { createMileageGrantExpense } from "@/lib/mileageGrants";

// Server-only helpers for the Mileage Tracker (app/mileage).
//
// Distance comes from a routing provider, not from summing GPS
// points: an installed iPhone PWA stops getting location once the
// screen locks, so breadcrumbs undercount. Provider order:
//   1. Google Routes API      - when google_maps_api_key is set
//      (integration_settings, or GOOGLE_MAPS_API_KEY env var)
//   2. OSRM public server     - free, no key; fine at portal volume
//   3. GPS breadcrumb total   - if the app stayed open
//   4. straight line x 1.2    - last resort, flagged for Finance
// Reverse geocoding: Google Geocoding if keyed, else Nominatim.

export const METERS_PER_MILE = 1609.344;
const USER_AGENT = "ICNA-Relief-Staff-Portal/1.0 (mileage tracker)";

export type Address = { line1: string | null; city: string | null; state: string | null; zip: string | null };
export type RouteResult = { miles: number; provider: "google" | "osrm" | "gps" | "straight_line" };

const round2 = (n: number) => Math.round(n * 100) / 100;

export async function getMileageRate(): Promise<number> {
  const raw = await getIntegrationSetting("mileage_rate_per_mile", process.env.MILEAGE_RATE_PER_MILE);
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : 0.725;
}

async function googleKey() {
  return getIntegrationSetting("google_maps_api_key", process.env.GOOGLE_MAPS_API_KEY);
}

export function haversineMiles(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 3958.8;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

async function fetchJson(url: string, init?: RequestInit, timeoutMs = 8000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...init, signal: ctrl.signal, cache: "no-store" });
    if (!res.ok) throw new Error(`${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(t);
  }
}

export async function drivingMiles(
  start: { lat: number; lng: number },
  end: { lat: number; lng: number },
  gpsMiles?: number | null
): Promise<RouteResult> {
  // Same spot (or GPS jitter): no API call needed.
  if (haversineMiles(start, end) < 0.05) {
    return gpsMiles && gpsMiles > 0.1 ? { miles: round2(gpsMiles), provider: "gps" } : { miles: 0, provider: "straight_line" };
  }

  const key = await googleKey();
  if (key) {
    try {
      const data = await fetchJson("https://routes.googleapis.com/directions/v2:computeRoutes", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Goog-Api-Key": key, "X-Goog-FieldMask": "routes.distanceMeters" },
        body: JSON.stringify({
          origin: { location: { latLng: { latitude: start.lat, longitude: start.lng } } },
          destination: { location: { latLng: { latitude: end.lat, longitude: end.lng } } },
          travelMode: "DRIVE",
          routingPreference: "TRAFFIC_UNAWARE",
        }),
      });
      const m = data?.routes?.[0]?.distanceMeters;
      if (typeof m === "number") return { miles: round2(m / METERS_PER_MILE), provider: "google" };
    } catch {
      /* fall through */
    }
  }

  try {
    const data = await fetchJson(
      `https://router.project-osrm.org/route/v1/driving/${start.lng},${start.lat};${end.lng},${end.lat}?overview=false`,
      { headers: { "User-Agent": USER_AGENT } }
    );
    const m = data?.routes?.[0]?.distance;
    if (typeof m === "number") return { miles: round2(m / METERS_PER_MILE), provider: "osrm" };
  } catch {
    /* fall through */
  }

  if (gpsMiles && gpsMiles > 0.1) return { miles: round2(gpsMiles), provider: "gps" };
  return { miles: round2(haversineMiles(start, end) * 1.2), provider: "straight_line" };
}

export async function reverseGeocode(p: { lat: number; lng: number }): Promise<Address> {
  const empty: Address = { line1: null, city: null, state: null, zip: null };
  const key = await googleKey();
  if (key) {
    try {
      const data = await fetchJson(`https://maps.googleapis.com/maps/api/geocode/json?latlng=${p.lat},${p.lng}&key=${encodeURIComponent(key)}`);
      const r = data?.results?.[0];
      if (r) {
        const part = (type: string, short = false) => {
          const c = (r.address_components as { types: string[]; long_name: string; short_name: string }[]).find((x) => x.types.includes(type));
          return c ? (short ? c.short_name : c.long_name) : null;
        };
        const num = part("street_number");
        const street = part("route");
        return {
          line1: [num, street].filter(Boolean).join(" ") || (r.formatted_address as string)?.split(",")[0] || null,
          city: part("locality") ?? part("sublocality") ?? part("administrative_area_level_3"),
          state: part("administrative_area_level_1", true),
          zip: part("postal_code"),
        };
      }
    } catch {
      /* fall through */
    }
  }
  try {
    const data = await fetchJson(
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2&addressdetails=1&lat=${p.lat}&lon=${p.lng}`,
      { headers: { "User-Agent": USER_AGENT, "Accept-Language": "en" } }
    );
    const a = data?.address ?? {};
    const iso: string | undefined = a["ISO3166-2-lvl4"];
    return {
      line1: [a.house_number, a.road].filter(Boolean).join(" ") || a.amenity || a.building || null,
      city: a.city ?? a.town ?? a.village ?? a.suburb ?? a.county ?? null,
      state: iso?.startsWith("US-") ? iso.slice(3) : a.state ?? null,
      zip: a.postcode ?? null,
    };
  } catch {
    return empty;
  }
}

export function formatAddress(a: { line1?: string | null; city?: string | null; state?: string | null }) {
  return [a.line1, a.city, a.state].filter(Boolean).join(", ") || "Unknown location";
}

export type DriveRow = {
  id: string;
  employee_id: string;
  status: string;
  started_at: string;
  ended_at: string | null;
  start_address_line1: string | null;
  start_city: string | null;
  start_state: string | null;
  start_zip_code: string | null;
  end_address_line1: string | null;
  end_city: string | null;
  end_state: string | null;
  end_zip_code: string | null;
  miles: number | null;
  round_trip: boolean;
  miles_adjusted: boolean;
  adjusted_reason: string | null;
  route_provider: string | null;
  purpose: string | null;
  billing_office_id: string | null;
  billing_program: string | null;
  gm_grant_id: string | null;
  gm_line_id: string | null;
};

export function localDate(iso: string, tz: string) {
  try {
    // en-CA formats as YYYY-MM-DD
    return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));
  } catch {
    return iso.slice(0, 10);
  }
}

// Turns a set of the driver's "ready" drives into one Mileage
// Reimbursement finance ticket - the same rows the manual form in
// /finance-tickets/new creates - then starts the normal approval chain.
export async function submitDrivesAsTicket(opts: {
  supabase: { from: (t: string) => any };
  employeeId: string;
  assignedOfficeId: string | null;
  drives: DriveRow[];
  title: string;
  timezone: string;
  startApproval: (ticketId: string) => Promise<unknown>;
}) {
  const { supabase, employeeId, drives, timezone } = opts;
  const rate = await getMileageRate();
  const sorted = [...drives].sort((a, b) => a.started_at.localeCompare(b.started_at));
  const admin = createAdminClient();

  // Grant Management grants on these trips: code for the trip note, and
  // the linked revenue grant (finance_mileage_trips.grant_id points at
  // the older `grants` table) when Grant Management has one set.
  const gmIds = Array.from(new Set(sorted.map((d) => d.gm_grant_id).filter(Boolean) as string[]));
  const gmGrants = new Map<string, { code: string; name: string; revenue_grant_id: string | null }>();
  if (gmIds.length) {
    const { data } = await admin.from("gm_grants").select("id, code, name, revenue_grant_id").in("id", gmIds);
    for (const g of (data ?? []) as { id: string; code: string; name: string; revenue_grant_id: string | null }[]) gmGrants.set(g.id, g);
  }

  const tripRows = sorted.map((d) => {
    const miles = round2(Number(d.miles ?? 0));
    const notes = [
      d.round_trip ? "round trip" : null,
      d.miles_adjusted ? `miles adjusted by driver: ${d.adjusted_reason ?? "no reason given"}` : null,
      d.route_provider === "straight_line" ? "estimated - route lookup failed" : null,
      d.gm_grant_id && gmGrants.get(d.gm_grant_id) ? `grant ${gmGrants.get(d.gm_grant_id)!.code}` : null,
    ].filter(Boolean);
    const gm = d.gm_grant_id ? gmGrants.get(d.gm_grant_id) : undefined;
    return {
      drive: d,
      row: {
        travel_date: localDate(d.started_at, timezone),
        trip_purpose: `${d.purpose ?? ""}${notes.length ? ` (${notes.join("; ")})` : ""}`.trim(),
        billing_office_id: d.billing_office_id ?? opts.assignedOfficeId,
        billing_program: d.billing_program,
        starting_address_line1: d.start_address_line1,
        starting_city: d.start_city,
        starting_state: d.start_state,
        starting_zip_code: d.start_zip_code,
        destination_address_line1: d.end_address_line1,
        destination_city: d.end_city,
        destination_state: d.end_state,
        destination_zip_code: d.end_zip_code,
        mileage_traveled: miles,
        mileage_reimbursement: round2(miles * rate),
        grant_eligible: !!d.gm_grant_id,
        grant_id: gm?.revenue_grant_id ?? null,
      },
    };
  });

  const totalMiles = round2(tripRows.reduce((s, t) => s + t.row.mileage_traveled, 0));
  const totalAmount = round2(tripRows.reduce((s, t) => s + t.row.mileage_reimbursement, 0));

  const { data: batch, error: batchErr } = await supabase
    .from("finance_mileage_batches")
    .insert({
      requestor_id: employeeId,
      mileage_title: opts.title,
      rate_per_mile: rate,
      total_amount: totalAmount,
      total_miles: totalMiles,
      trip_count: tripRows.length,
      start_date: tripRows[0].row.travel_date,
      end_date: tripRows[tripRows.length - 1].row.travel_date,
      trip_purpose: "Logged with the portal Mileage Tracker",
    })
    .select("id")
    .single();
  if (batchErr || !batch) throw new Error(batchErr?.message ?? "Couldn't create mileage batch");

  const tripIds: { driveId: string; tripId: string }[] = [];
  for (const t of tripRows) {
    const { data: trip, error } = await supabase.from("finance_mileage_trips").insert({ ...t.row, batch_id: batch.id }).select("id").single();
    if (error || !trip) throw new Error(error?.message ?? "Couldn't create a mileage trip");
    tripIds.push({ driveId: t.drive.id, tripId: trip.id });
  }

  const { data: ticket, error: ticketErr } = await supabase
    .from("finance_tickets")
    .insert({
      title: opts.title,
      category: "mileage_reimbursement",
      requestor_id: employeeId,
      billing_office_id: tripRows[0].row.billing_office_id ?? null,
      grant_eligible: tripRows.some((t) => t.row.grant_eligible),
      priority: "normal",
      submitted_at: new Date().toISOString(),
      mileage_batch_id: batch.id,
      total: totalAmount,
    })
    .select("id, ticket_number")
    .single();
  if (ticketErr || !ticket) throw new Error(ticketErr?.message ?? "Couldn't create ticket");

  // Freeze the drives (service role: the driver's own RLS update policy
  // deliberately can't set status = submitted).
  const now = new Date().toISOString();
  for (const { driveId, tripId } of tripIds) {
    await admin
      .from("finance_mileage_drives")
      .update({ status: "submitted", finance_ticket_id: ticket.id, mileage_trip_id: tripId, submitted_at: now, updated_at: now })
      .eq("id", driveId)
      .eq("employee_id", employeeId);
  }

  // Grant-funded trips also land in Grant Management as expenses on the
  // grant's mileage budget line (budget vs. actual + its approvals queue).
  // A failure here never blocks the reimbursement itself.
  const grantProblems: string[] = [];
  for (const t of tripRows) {
    const d = t.drive;
    if (!d.gm_grant_id || !d.gm_line_id) continue;
    const r = await createMileageGrantExpense({
      employeeId,
      driveId: d.id,
      grantId: d.gm_grant_id,
      lineId: d.gm_line_id,
      tripDate: t.row.travel_date,
      amount: t.row.mileage_reimbursement,
      miles: t.row.mileage_traveled,
      rate,
      purpose: d.purpose ?? "",
      route: `${formatAddress({ line1: d.start_address_line1, city: d.start_city, state: d.start_state })} to ${formatAddress({ line1: d.end_address_line1, city: d.end_city, state: d.end_state })}`,
      officeId: t.row.billing_office_id,
      program: d.billing_program,
      ticketNumber: ticket.ticket_number,
    });
    if (r.expenseId) await admin.from("finance_mileage_drives").update({ gm_expense_id: r.expenseId }).eq("id", d.id);
    else if (r.error && t.row.mileage_reimbursement > 0) grantProblems.push(`${t.row.travel_date}: ${r.error}`);
  }

  let warning: string | undefined = grantProblems.length
    ? `Submitted, but ${grantProblems.length} trip${grantProblems.length === 1 ? "" : "s"} couldn't be added to Grant Management (${grantProblems.join("; ")}). Let the grant team know.`
    : undefined;
  try {
    await opts.startApproval(ticket.id);
  } catch (err) {
    warning = `Ticket created but routing failed: ${err instanceof Error ? err.message : "unknown error"}${warning ? ` ${warning}` : ""}`;
  }

  return { ticket: { id: ticket.id as string, ticket_number: ticket.ticket_number as string }, totalMiles, totalAmount, rate, warning };
}
