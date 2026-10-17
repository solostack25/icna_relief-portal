import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { createClient } from "@/lib/supabase/server";
import { getRefugeeServicesAccess, RSCE_PROGRAM } from "@/lib/refugeeServicesAccess";

export const dynamic = "force-dynamic";

const NO_IDS = ["00000000-0000-0000-0000-000000000000"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const NORTHERN_CA = new Set(["Sacramento Office", "Bay Area Office"]);
const SOUTHERN_CA = new Set(["Los Angeles Office", "San Diego Office"]);

// GET /api/refugee-services/export?year=2026[&office=<uuid>]
//
// Reproduces the Master Cleaner's Refugee Services "COMBINED DATA" sheet
// (same column names and CATEGORY values) for the MAIN (case management
// services) and BULK rows, straight from the portal — no Salesforce export,
// no cleaning. CASH / INKIND / IRFAS rows still come from their own sources.
// Rows are scoped by the caller's RLS (office staff → own office).
export async function GET(request: NextRequest) {
  const access = await getRefugeeServicesAccess();
  if (!access.ok) return NextResponse.json({ error: "Forbidden" }, { status: access.status });

  const year = Number(request.nextUrl.searchParams.get("year")) || new Date().getFullYear();
  const officeFilter = request.nextUrl.searchParams.get("office");
  const supabase = await createClient();

  let servicesQ = supabase
    .from("rsce_services")
    .select("client_id, office_id, service_name, delivered_on, value, beneficiaries")
    .gte("delivered_on", `${year}-01-01`)
    .lte("delivered_on", `${year}-12-31`)
    .order("delivered_on");
  let bulkQ = supabase
    .from("bulk_distributions")
    .select("office_id, name, distributed_on, people_served, total_value")
    .eq("program", RSCE_PROGRAM)
    .gte("distributed_on", `${year}-01-01`)
    .lte("distributed_on", `${year}-12-31`)
    .order("distributed_on");
  if (officeFilter) {
    servicesQ = servicesQ.eq("office_id", officeFilter);
    bulkQ = bulkQ.eq("office_id", officeFilter);
  }

  const [{ data: services, error }, { data: bulk }, { data: offices }, { data: regions }] = await Promise.all([
    servicesQ,
    bulkQ,
    supabase.from("b2s_offices").select("id, region, state, chapter, field_office"),
    supabase.from("b2s_regions").select("region, rsn"),
  ]);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const clientIds = [...new Set((services ?? []).map((s) => s.client_id))];
  const { data: clients } = await supabase
    .from("clients")
    .select("id, country_of_birth, country_of_citizenship, race_ethnicity, ethnicity")
    .in("id", clientIds.length ? clientIds : NO_IDS);

  const officeMap = new Map((offices ?? []).map((o) => [o.id, o]));
  const rsnMap = new Map((regions ?? []).map((r) => [r.region, r.rsn]));
  const clientMap = new Map((clients ?? []).map((c) => [c.id, c]));

  const dateCols = (d: string) => {
    const month = Number(d.slice(5, 7));
    return {
      YEAR: Number(d.slice(0, 4)),
      QUARTER: `Q${Math.floor((month - 1) / 3) + 1}`,
      MONTH: MONTHS[month - 1],
      MSN: month,
    };
  };
  const geoCols = (officeId: string | null, bulkRow: boolean) => {
    const o = officeId ? officeMap.get(officeId) : null;
    let fieldOffice = o?.field_office ?? "";
    if (bulkRow && NORTHERN_CA.has(fieldOffice)) fieldOffice = "Northern California";
    if (bulkRow && SOUTHERN_CA.has(fieldOffice)) fieldOffice = "Southern California";
    return {
      RSN: rsnMap.get(o?.region ?? "") ?? null,
      REGION: (o?.region ?? "").toUpperCase(),
      CHAPTER: o?.chapter ?? "",
      STATE: o?.state ?? "",
      "FIELD OFFICE": fieldOffice,
      "Client: Office Location  ↑": o ? `${o.state} - ${o.field_office.replace(/ Office$/, "")}` : "",
    };
  };

  const rows: Record<string, string | number | null>[] = [];

  for (const s of services ?? []) {
    const c = clientMap.get(s.client_id);
    rows.push({
      CATEGORY: "MAIN",
      ...dateCols(s.delivered_on),
      ...geoCols(s.office_id, false),
      "Bulk Distribution Event: Bulk Distribution Name": null,
      "Total Value of Services Provided": Number(s.value),
      "Number of Beneficiaries": s.beneficiaries,
      "Service Name  ↑": s.service_name,
      "Client Country of Origin": c?.country_of_birth || c?.country_of_citizenship || "Not Provided",
      "Client Ethnicity": c?.race_ethnicity || c?.ethnicity || "Not Provided",
      CASH: null,
      INKIND: null,
      "TOTAL REV": 0,
    });
  }

  for (const b of bulk ?? []) {
    rows.push({
      CATEGORY: "BULK",
      ...dateCols(b.distributed_on),
      ...geoCols(b.office_id, true),
      "Bulk Distribution Event: Bulk Distribution Name": b.name,
      "Total Value of Services Provided": b.total_value === null ? null : Number(b.total_value),
      "Number of Beneficiaries": b.people_served,
      "Service Name  ↑": "Bulk Household Items",
      "Client Country of Origin": "Not Provided",
      "Client Ethnicity": "Not Provided",
      CASH: null,
      INKIND: null,
      "TOTAL REV": 0,
    });
  }

  if (rows.length === 0) {
    return NextResponse.json({ error: `No Refugee Services data logged for ${year} yet.` }, { status: 404 });
  }

  const sheet = XLSX.utils.json_to_sheet(rows);
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, "COMBINED DATA");
  const buf = XLSX.write(book, { type: "buffer", bookType: "xlsx" }) as Buffer;

  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="refugee_services_${year}.xlsx"`,
    },
  });
}
