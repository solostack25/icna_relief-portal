import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { createAdminClient } from "@/lib/supabase/server";
import { getHungerPreventionAccess } from "@/lib/hungerPreventionAccess";
import { ALL_FOOD_ITEM_CODES, pricesFromItems, type FoodBreakdown } from "@/lib/bulkDistributions";

export const dynamic = "force-dynamic";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

// Food columns, in the HP_PowerBi.xlsx naming the Master Cleaner produced.
const FOOD_COLS: { key: string; qty: string; value: string }[] = [
  { key: "grocery", qty: "GROCERY WEIGHT", value: "GROCERY VALUE" },
  { key: "produce", qty: "PRODUCE WEIGHT", value: "PRODUCE VALUE" },
  { key: "meat", qty: "MEAT WEIGHT", value: "MEAT VALUE" },
  { key: "poultry", qty: "POULTRY WEIGHT", value: "POULTRY VALUE" },
  { key: "fish", qty: "FISH WEIGHT", value: "FISH VALUE" },
  { key: "qurbani_meat", qty: "QURBANI MEAT WEIGHT", value: "QURBANI MEAT VALUE" },
  { key: "prepared_meals", qty: "NUMBER OF PREPARED MEALS", value: "PREPARED MEAL VALUE" },
  { key: "ramadan_boxes", qty: "RAMADAN FOOD BOXES", value: "RAMADAN FOOD BOX VALUE" },
  { key: "baby_formula", qty: "BABY FORMULA", value: "BABY FORMULA VALUE" },
];

type Row = Record<string, string | number | null>;

// GET /api/hunger-prevention/export?year=2026[&office=<uuid>]
//
// Hunger Prevention for Power BI, replacing the Master Cleaner's five-file
// merge. DISTRIBUTION TYPE rows:
//   REGISTERED CLIENTS  hp_food_distributions (check-in packages + profile)
//                       and Orlando live distributions (lbs × price list)
//   BULK                bulk_distributions tagged Hunger Prevention
//   IRFAS               approved zakat applications tagged Hunger Prevention
//   IN-KIND             completed in-kind sessions, Hunger Prevention lines
// CASH rows aren't included yet (donation data isn't in the portal).
// Staff get their own office; admins get all offices or ?office=.
export async function GET(req: NextRequest) {
  const access = await getHungerPreventionAccess();
  if (!access.ok) return NextResponse.json({ error: "Forbidden" }, { status: access.status });

  const year = Number(req.nextUrl.searchParams.get("year")) || new Date().getFullYear();
  const officeParam = req.nextUrl.searchParams.get("office");
  const officeId = access.isAdmin ? officeParam : access.defaultOfficeId;
  if (!access.isAdmin && !officeId) return NextResponse.json({ error: "No office assigned to your account" }, { status: 400 });

  const from = `${year}-01-01`;
  const to = `${year}-12-31`;
  const admin = createAdminClient();
  const scope = <T,>(q: T): T => (officeId ? (q as any).eq("office_id", officeId) : q);

  const [
    { data: offices },
    { data: regions },
    { data: items },
    { data: hpFood },
    { data: live },
    { data: bulk },
    { data: irfas },
    { data: sessions },
  ] = await Promise.all([
    admin.from("b2s_offices").select("id, region, state, chapter, field_office"),
    admin.from("b2s_regions").select("region, rsn"),
    admin.from("items").select("code, new_price, active").in("code", ALL_FOOD_ITEM_CODES),
    scope(
      admin
        .from("hp_food_distributions")
        .select("client_id, office_id, distributed_on, individuals_served, food, total_lbs, total_value, source")
        .gte("distributed_on", from)
        .lte("distributed_on", to)
    ),
    scope(
      admin
        .from("live_distribution_entries")
        .select("client_id, office_id, poultry_lbs, meat_lbs, grocery_lbs, scanned_at")
        .eq("food_distributed", true)
        .gte("scanned_at", `${from}T00:00:00Z`)
        .lt("scanned_at", `${year + 1}-01-01T06:00:00Z`)
    ),
    scope(
      admin
        .from("bulk_distributions")
        .select("office_id, name, distributed_on, people_served, food, total_value, location")
        .eq("program", "Hunger Prevention")
        .gte("distributed_on", from)
        .lte("distributed_on", to)
    ),
    scope(
      admin
        .from("zakat_applications")
        .select("client_id, office_id, amount_approved, amount_requested, household_size, decided_at")
        .eq("program", "Hunger Prevention")
        .in("status", ["approved", "paid"])
        .is("voided_at", null)
        .gte("decided_at", `${from}T00:00:00Z`)
        .lt("decided_at", `${year + 1}-01-01T06:00:00Z`)
    ),
    scope(
      admin
        .from("sessions")
        .select("id, office_id, date_received, completed_at")
        .eq("status", "completed")
        .gte("date_received", from)
        .lte("date_received", to)
    ),
  ]);

  type Office = { id: string; region: string; state: string; chapter: string; field_office: string };
  const prices = pricesFromItems((items ?? []) as { code: string; new_price: number | null; active: boolean | null }[]);
  const officeMap = new Map(((offices ?? []) as Office[]).map((o) => [o.id, o]));
  const rsnMap = new Map(((regions ?? []) as { region: string; rsn: number }[]).map((r) => [r.region, r.rsn]));

  const clientIds = [
    ...new Set([...(hpFood ?? []), ...(live ?? []), ...(irfas ?? [])].map((r: any) => r.client_id).filter(Boolean)),
  ] as string[];
  const clientMap = new Map<string, { city: string | null; zip: string | null; household_key: string | null }>();
  for (let i = 0; i < clientIds.length; i += 500) {
    const { data } = await admin.from("clients").select("id, city, zip, household_key").in("id", clientIds.slice(i, i + 500));
    for (const c of (data ?? []) as { id: string; city: string | null; zip: string | null; household_key: string | null }[]) clientMap.set(c.id, c);
  }
  // household sizes for Orlando live rows
  const hhKeys = [...new Set([...clientMap.values()].map((c) => c.household_key).filter(Boolean))] as string[];
  const hhSize = new Map<string, number>();
  for (let i = 0; i < hhKeys.length; i += 500) {
    const { data } = await admin.from("clients").select("household_key").in("household_key", hhKeys.slice(i, i + 500));
    for (const r of (data ?? []) as { household_key: string }[]) hhSize.set(r.household_key, (hhSize.get(r.household_key) ?? 0) + 1);
  }

  const sessionIds = ((sessions ?? []) as { id: string }[]).map((s) => s.id);
  const inkindBySession = new Map<string, number>();
  for (let i = 0; i < sessionIds.length; i += 500) {
    const { data } = await admin
      .from("donations")
      .select("session_id, qty, unit_price, is_manual_price")
      .eq("program", "Hunger Prevention")
      .in("session_id", sessionIds.slice(i, i + 500));
    for (const d of (data ?? []) as { session_id: string; qty: number; unit_price: number; is_manual_price: boolean }[]) {
      const line = d.is_manual_price ? Number(d.unit_price) : Number(d.unit_price) * Number(d.qty);
      inkindBySession.set(d.session_id, (inkindBySession.get(d.session_id) ?? 0) + (line || 0));
    }
  }

  const chicagoDate = (iso: string) => new Date(iso).toLocaleDateString("en-CA", { timeZone: "America/Chicago" });

  function base(type: string, date: string, officeId: string | null, city?: string | null, zip?: string | null, location?: string | null): Row {
    const o = officeId ? officeMap.get(officeId) : null;
    const month = Number(date.slice(5, 7));
    const row: Row = {
      YEAR: Number(date.slice(0, 4)),
      QUARTER: `Q${Math.floor((month - 1) / 3) + 1}`,
      MONTH: MONTHS[month - 1],
      MSN: month,
      DATE: date,
      REGION: (o?.region ?? "").toUpperCase(),
      CHAPTER: o?.chapter ?? "",
      STATE: o?.state ?? "",
      "FIELD OFFICE": o?.field_office ?? "",
      RSN: rsnMap.get(o?.region ?? "") ?? null,
      CITY: city ?? "",
      ZIPCODE: (zip ?? "").toString().match(/\d{5}/)?.[0] ?? "",
      "DISTRIBUTION LOCATION": location ?? o?.field_office ?? "",
      "DISTRIBUTION TYPE": type,
      "INDIVIDUALS SERVED": null,
    };
    for (const f of FOOD_COLS) {
      row[f.qty] = null;
      row[f.value] = null;
    }
    row["BULK DISTRIBUTION EVENT: BULK DISTRIBUTION NAME"] = null;
    row["CASH DONATION"] = null;
    row["INKIND DONATION"] = null;
    row["IRFAS VALUE"] = null;
    return row;
  }
  function applyFood(row: Row, food: FoodBreakdown | null | undefined) {
    for (const f of FOOD_COLS) {
      const v = food?.[f.key];
      if (v && (v.qty || v.value)) {
        row[f.qty] = Number(v.qty) || 0;
        row[f.value] = Number(v.value) || 0;
      }
    }
  }

  const rows: Row[] = [];

  for (const r of hpFood ?? []) {
    const c = clientMap.get(r.client_id);
    const row = base("REGISTERED CLIENTS", r.distributed_on, r.office_id, c?.city, c?.zip);
    row["INDIVIDUALS SERVED"] = r.individuals_served;
    applyFood(row, r.food as FoodBreakdown);
    rows.push(row);
  }

  for (const r of live ?? []) {
    const c = clientMap.get(r.client_id);
    const row = base("REGISTERED CLIENTS", chicagoDate(r.scanned_at), r.office_id, c?.city, c?.zip);
    row["INDIVIDUALS SERVED"] = c?.household_key ? hhSize.get(c.household_key) ?? 1 : 1;
    const food: FoodBreakdown = {};
    for (const [key, lbs] of [
      ["poultry", r.poultry_lbs],
      ["meat", r.meat_lbs],
      ["grocery", r.grocery_lbs],
    ] as const) {
      const q = Number(lbs ?? 0);
      if (q > 0) food[key] = { qty: q, value: Math.round(q * (prices[key] ?? 0) * 100) / 100 };
    }
    applyFood(row, food);
    rows.push(row);
  }

  for (const b of bulk ?? []) {
    const row = base("BULK", b.distributed_on, b.office_id, null, null, b.location);
    row["INDIVIDUALS SERVED"] = b.people_served;
    row["BULK DISTRIBUTION EVENT: BULK DISTRIBUTION NAME"] = b.name;
    applyFood(row, b.food as FoodBreakdown);
    rows.push(row);
  }

  for (const z of irfas ?? []) {
    const c = z.client_id ? clientMap.get(z.client_id) : null;
    const row = base("IRFAS", chicagoDate(z.decided_at), z.office_id, c?.city, c?.zip);
    // The cleaner assumed 5 people per IRFAS case; use the real household size when known.
    row["INDIVIDUALS SERVED"] = z.household_size ?? 5;
    row["IRFAS VALUE"] = Number(z.amount_approved ?? z.amount_requested ?? 0);
    rows.push(row);
  }

  for (const s of sessions ?? []) {
    const amount = inkindBySession.get(s.id);
    if (!amount) continue;
    const row = base("IN-KIND", s.date_received, s.office_id);
    row["INKIND DONATION"] = Math.round(amount * 100) / 100;
    rows.push(row);
  }

  if (rows.length === 0) return NextResponse.json({ error: `No Hunger Prevention data for ${year} yet.` }, { status: 404 });

  // Roll-ups, same formulas as the cleaner
  const n = (v: unknown) => Number(v ?? 0) || 0;
  for (const r of rows) {
    r["ALL MEAT WEIGHT"] = n(r["FISH WEIGHT"]) + n(r["MEAT WEIGHT"]) + n(r["POULTRY WEIGHT"]);
    r["ALL MEAT VALUE"] = n(r["FISH VALUE"]) + n(r["MEAT VALUE"]) + n(r["POULTRY VALUE"]);
    r["TOTAL WEIGHT"] = n(r["GROCERY WEIGHT"]) + n(r["ALL MEAT WEIGHT"]) + n(r["PRODUCE WEIGHT"]) + n(r["QURBANI MEAT WEIGHT"]);
    r["TOTAL VALUE OF ALL FOOD"] =
      Math.round(
        (n(r["IRFAS VALUE"]) +
          n(r["GROCERY VALUE"]) +
          n(r["ALL MEAT VALUE"]) +
          n(r["PRODUCE VALUE"]) +
          n(r["QURBANI MEAT VALUE"]) +
          n(r["PREPARED MEAL VALUE"]) +
          n(r["RAMADAN FOOD BOX VALUE"]) +
          n(r["BABY FORMULA VALUE"])) *
          100
      ) / 100;
    r["TOTAL DONATIONS"] = n(r["INKIND DONATION"]) + n(r["CASH DONATION"]);
    r["MOBILE PANTRY"] = null;
    r["DIETRY RESTRICTIONS"] = null;
    r["BRICK & MORTAR PANTRY"] = null;
    delete r["IRFAS VALUE"];
  }

  rows.sort((a, b) => String(a.DATE).localeCompare(String(b.DATE)));
  const sheet = XLSX.utils.json_to_sheet(rows);
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, "Hunger Prevention");
  const buf = XLSX.write(book, { type: "buffer", bookType: "xlsx" }) as Buffer;
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="hunger_prevention_${year}.xlsx"`,
    },
  });
}
