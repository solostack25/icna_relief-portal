import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { createClient } from "@/lib/supabase/server";
import { ETHNICITY_ESN, PROGRAM_PSN, VOLUNTEER_PROGRAMS, ageOn } from "@/lib/volunteer";

export const dynamic = "force-dynamic";

const NO_IDS = ["00000000-0000-0000-0000-000000000000"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

// GET /api/volunteer/export?year=2026            → Volunteer hours, Power BI-ready (.xlsx)
// GET /api/volunteer/export?type=signups         → raw sign-up list (.csv, the old export)
//
// The hours workbook reproduces the Master Cleaner's "Volunteers" output
// column-for-column (same names, PSN/ESN codes, age bands, $ value at the
// dated hourly rate, per-program and overall year-over-year retention),
// built from real check-in/check-out data — so it can replace the
// clean-and-upload step entirely. Rows are scoped by the caller's RLS:
// admins get every office, office staff get their own office.
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (request.nextUrl.searchParams.get("type") === "signups") return exportSignups(supabase);

  const year = Number(request.nextUrl.searchParams.get("year")) || new Date().getFullYear();
  const prevYear = year - 1;

  const { data: hours, error } = await supabase
    .from("volunteer_hours")
    .select("attendance_id, event_id, volunteer_id, office_id, event_title, program, service_date, checked_in_at, hours, value")
    .gte("service_date", `${prevYear}-01-01`)
    .lte("service_date", `${year}-12-31`)
    .not("checked_out_at", "is", null)
    .order("checked_in_at");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const volunteerIds = [...new Set((hours ?? []).map((h) => h.volunteer_id))];
  const officeIds = [...new Set((hours ?? []).map((h) => h.office_id))];

  const [{ data: volunteers }, { data: offices }, { data: regions }] = await Promise.all([
    supabase
      .from("volunteers")
      .select("id, first_name, last_name, email, date_of_birth, gender, ethnicity, home_city, home_state, home_zip, waiver_signed_at")
      .in("id", volunteerIds.length ? volunteerIds : NO_IDS),
    supabase.from("b2s_offices").select("id, region, state, chapter, field_office").in("id", officeIds.length ? officeIds : NO_IDS),
    supabase.from("b2s_regions").select("region, rsn"),
  ]);
  const vMap = new Map((volunteers ?? []).map((v) => [v.id, v]));
  const oMap = new Map((offices ?? []).map((o) => [o.id, o]));
  const rsnMap = new Map((regions ?? []).map((r) => [r.region, r.rsn]));

  // Who volunteered (overall and per program) in each of the two years.
  const yearOf = (d: string) => Number(d.slice(0, 4));
  const did = new Map<string, Set<string>>(); // `${year}` or `${year}|${program}` → volunteer ids
  for (const h of hours ?? []) {
    const y = yearOf(h.service_date);
    for (const k of [`${y}`, `${y}|${h.program}`]) {
      if (!did.has(k)) did.set(k, new Set());
      did.get(k)!.add(h.volunteer_id);
    }
  }
  const flag = (k: string, id: string) => (did.get(k)?.has(id) ? 1 : 0);

  const rows = (hours ?? [])
    .filter((h) => yearOf(h.service_date) === year)
    .map((h) => {
      const v = vMap.get(h.volunteer_id);
      const o = oMap.get(h.office_id);
      const date = new Date(h.service_date + "T12:00:00");
      const month = date.getMonth() + 1;
      const age = ageOn(v?.date_of_birth ?? null, date);
      const ethnicity = v?.ethnicity && v.ethnicity !== "Prefer not to say" ? v.ethnicity : "No Information Provided";
      const region = (o?.region ?? "").toUpperCase();
      const id = h.volunteer_id;

      const row: Record<string, string | number | null> = {
        YEAR: year,
        QUARTER: `Q${Math.floor((month - 1) / 3) + 1}`,
        "MONTH NAME": MONTHS[month - 1],
        "MONTH NUMBER": month,
        "EVENT START": h.service_date,
        REGION: region,
        CHAPTER: o?.chapter ?? "",
        STATE: o?.state ?? "",
        "FIELD OFFICE": o?.field_office ?? "",
        "REGION NUMBER": rsnMap.get(o?.region ?? "") ?? null,
        "FULL NAME - FIRSTNAME": v?.first_name ?? "",
        "FULL NAME - LASTNAME": v?.last_name ?? "",
        EMAIL: v?.email ?? "",
        "EVENT NAME": h.event_title,
        PROGRAM: h.program,
        PSN: PROGRAM_PSN[h.program] ?? 9,
        HOURS: Number(h.hours),
        "CONTACT ID (DISTINCT)": id,
        "CONTACT ID (TOTAL)": id,
        CITY: v?.home_city ?? "",
        "HOME STATE": v?.home_state ?? "",
        ZIPCODE: v?.home_zip ?? "",
        "VOLUNTEERING VALUE": Number(h.value),
        GENDER: v?.gender && v.gender !== "Prefer not to say" ? v.gender : "Not Provided",
        AGE: age,
        "0-17": age !== null && age >= 0 && age <= 17 ? 1 : 0,
        "18-45": age !== null && age >= 18 && age <= 45 ? 1 : 0,
        "46-64": age !== null && age >= 46 && age <= 64 ? 1 : 0,
        "65 OR OLDER": age !== null && age >= 65 ? 1 : 0,
        "AGE NOT AVAILABLE": age === null || age < 0 ? 1 : 0,
        ETHNICITY: ethnicity,
        ESN: ETHNICITY_ESN[ethnicity] ?? null,
        "EVENT GROUP": h.program,
        "EVENT GROUP LINEAGE": `${o?.field_office ?? ""} > ${h.program}`,
        "WAIVER 1 SIGNED": v?.waiver_signed_at ? "Yes" : "No",
        "CHECKED IN": h.checked_in_at,
      };

      for (const p of VOLUNTEER_PROGRAMS) {
        const prev = flag(`${prevYear}|${p}`, id);
        const next = flag(`${year}|${p}`, id);
        const name = p.toUpperCase();
        row[`${name} ${prevYear}`] = prev;
        row[`${name} ${year}`] = next;
        row[`${name} RETAINED`] = prev && next ? 1 : 0;
      }
      const vp = flag(`${prevYear}`, id);
      const vn = flag(`${year}`, id);
      row[`VOLUNTEERED_${prevYear}`] = vp;
      row[`VOLUNTEERED_${year}`] = vn;
      row.RETAINED = vp && vn ? 1 : 0;
      row["RETAINED ID"] = vp && vn ? id : null;
      return row;
    });

  if (rows.length === 0) {
    return NextResponse.json({ error: `No completed volunteer check-ins in ${year} yet.` }, { status: 404 });
  }

  const sheet = XLSX.utils.json_to_sheet(rows);
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, "Cleaned Volunteers");
  const buf = XLSX.write(book, { type: "buffer", bookType: "xlsx" }) as Buffer;

  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="volunteer_hours_${year}.xlsx"`,
    },
  });
}

async function exportSignups(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data: signups, error } = await supabase
    .from("volunteer_signups")
    .select("id, slot_id, volunteer_id, name, email, phone, qty, notes, waiver_signed, source, status, created_at")
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!signups || signups.length === 0) return NextResponse.json({ error: "No signups to export" }, { status: 404 });

  const slotIds = [...new Set(signups.map((s) => s.slot_id))];
  const { data: slots } = await supabase
    .from("volunteer_slots")
    .select("id, event_id, label, slot_type")
    .in("id", slotIds.length ? slotIds : NO_IDS);
  const slotMap = new Map((slots ?? []).map((s) => [s.id, s]));

  const eventIds = [...new Set(Array.from(slotMap.values()).map((s) => s.event_id))];
  const { data: events } = await supabase
    .from("volunteer_events")
    .select("id, office_id, title, slug, program")
    .in("id", eventIds.length ? eventIds : NO_IDS);
  const eventMap = new Map((events ?? []).map((e) => [e.id, e]));

  const officeIds = [...new Set((events ?? []).map((e) => e.office_id))];
  const { data: offices } = await supabase
    .from("b2s_offices")
    .select("id, field_office, region")
    .in("id", officeIds.length ? officeIds : NO_IDS);
  const officeMap = new Map((offices ?? []).map((o) => [o.id, o]));

  const rows = signups.map((s) => {
    const slot = slotMap.get(s.slot_id);
    const event = slot ? eventMap.get(slot.event_id) : undefined;
    const office = event ? officeMap.get(event.office_id) : undefined;
    return {
      REGION: office?.region ?? "",
      OFFICE: office?.field_office ?? "",
      EVENT: event?.title ?? "",
      PROGRAM: event?.program ?? "",
      SLOT: slot?.label ?? "",
      SLOT_TYPE: slot?.slot_type ?? "",
      NAME: s.name,
      EMAIL: s.email,
      PHONE: s.phone ?? "",
      QTY: s.qty,
      NOTES: s.notes ?? "",
      WAIVER_SIGNED: s.waiver_signed ? "yes" : "no",
      SOURCE: s.source,
      STATUS: s.status,
      VOLUNTEER_ID: s.volunteer_id ?? "",
      SIGNED_UP_AT: s.created_at,
    };
  });

  const headers = Object.keys(rows[0]);
  const esc = (val: unknown) => {
    if (val === null || val === undefined) return "";
    const str = String(val);
    return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
  };
  const csv = [headers.join(","), ...rows.map((row) => headers.map((h) => esc(row[h as keyof typeof row])).join(","))].join("\n");

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="volunteer_signups_${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
