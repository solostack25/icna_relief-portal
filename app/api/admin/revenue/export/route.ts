import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { createAdminClient, createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

// GET /api/admin/revenue/export?year=2026
//
// Revenue for Power BI, in the Master Cleaner's Current Revenue / Revenue
// shapes, from donations synced from Salesforce (revenue_transactions) and
// the portal's grants:
//   Total Revenue      month × field office totals (all donations)
//   Community Revenue  same, excluding the "Grant" record type
//   Detail             one row per payment (no donor names)
//   Grants             grants entered in the portal for the fiscal year
export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { data: me } = await supabase.from("employees").select("role").eq("auth_user_id", user.id).maybeSingle();
  if (me?.role !== "admin") return NextResponse.json({ error: "Admins only" }, { status: 403 });

  const year = Number(req.nextUrl.searchParams.get("year")) || new Date().getFullYear();
  const admin = createAdminClient();

  const tx: any[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await admin
      .from("revenue_transactions")
      .select("source, source_id, received_on, amount, record_type, donation_type, payment_method, campaign_name, campaign_source, program, donor_city, donor_zip, office_id, office_method")
      .gte("received_on", `${year}-01-01`)
      .lte("received_on", `${year}-12-31`)
      .order("received_on")
      .range(from, from + 999);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    tx.push(...(data ?? []));
    if ((data ?? []).length < 1000) break;
  }

  const [{ data: offices }, { data: regions }, { data: grants }] = await Promise.all([
    admin.from("b2s_offices").select("id, region, state, chapter, field_office"),
    admin.from("b2s_regions").select("region, rsn"),
    admin.from("grants").select("title, funder_name, program, amount, fiscal_year, received_date, office_id, region").eq("stream", "grant").eq("fiscal_year", year),
  ]);
  const officeMap = new Map((offices ?? []).map((o: any) => [o.id, o]));
  const rsnMap = new Map((regions ?? []).map((r: any) => [r.region, r.rsn]));

  const geo = (officeId: string | null) => {
    const o: any = officeId ? officeMap.get(officeId) : null;
    return {
      REGION: (o?.region ?? "UNASSIGNED").toUpperCase(),
      CHAPTER: o?.chapter ?? "",
      STATE: o?.state ?? "HQ",
      "FIELD OFFICE": o?.field_office ?? "Unassigned",
      "REGION NUMBER": rsnMap.get(o?.region ?? "") ?? null,
    };
  };
  const dateCols = (d: string) => {
    const m = Number(d.slice(5, 7));
    return { YEAR: Number(d.slice(0, 4)), QUARTER: `Q${Math.floor((m - 1) / 3) + 1}`, "MONTH NAME": MONTHS[m - 1], "MONTH NUMBER": m };
  };

  function summary(rows: any[], label: string) {
    const groups = new Map<string, { month: string; office: string | null; total: number }>();
    for (const r of rows) {
      const key = `${r.received_on.slice(0, 7)}|${r.office_id ?? ""}`;
      const g = groups.get(key) ?? { month: r.received_on.slice(0, 7) + "-01", office: r.office_id, total: 0 };
      g.total += Number(r.amount);
      groups.set(key, g);
    }
    return [...groups.values()]
      .sort((a, b) => a.month.localeCompare(b.month))
      .map((g) => ({ ...dateCols(g.month), ...geo(g.office), [label]: Math.round(g.total * 100) / 100 }));
  }

  const isGrant = (r: any) => String(r.record_type ?? "").toLowerCase() === "grant";
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, XLSX.utils.json_to_sheet(summary(tx, "TOTAL REVENUE").length ? summary(tx, "TOTAL REVENUE") : [{ NOTE: `No synced donations for ${year} yet` }]), "Total Revenue");
  XLSX.utils.book_append_sheet(book, XLSX.utils.json_to_sheet(summary(tx.filter((r) => !isGrant(r)), "COMMUNITY REVENUE").length ? summary(tx.filter((r) => !isGrant(r)), "COMMUNITY REVENUE") : [{ NOTE: "—" }]), "Community Revenue");
  XLSX.utils.book_append_sheet(
    book,
    XLSX.utils.json_to_sheet(
      tx.length
        ? tx.map((r) => ({
            ...dateCols(r.received_on),
            DATE: r.received_on,
            ...geo(r.office_id),
            CITY: r.donor_city ?? "",
            ZIPCODE: (r.donor_zip ?? "").toString().match(/\d{5}/)?.[0] ?? "",
            "PAYMENT NUMBER": r.source_id,
            "PAYMENT AMOUNT": Number(r.amount),
            "DONATION TYPE": r.donation_type ?? "",
            "PRIMARY CAMPAIGN SOURCE: CAMPAIGN NAME": r.campaign_name ?? "",
            "OPPORTUNITY RECORD TYPE": r.record_type ?? "",
            "PAYMENT METHOD": r.payment_method ?? "",
            PROGRAM: r.program ?? "",
            SOURCE: r.source,
            "OFFICE ASSIGNED BY": r.office_method ?? "",
          }))
        : [{ NOTE: "—" }]
    ),
    "Detail"
  );
  XLSX.utils.book_append_sheet(
    book,
    XLSX.utils.json_to_sheet(
      (grants ?? []).length
        ? (grants ?? []).map((g: any) => {
            const o: any = g.office_id ? officeMap.get(g.office_id) : null;
            return {
              ...(g.received_date ? dateCols(g.received_date) : { YEAR: g.fiscal_year }),
              DATE: g.received_date ?? "",
              REGION: (o?.region ?? g.region ?? "").toUpperCase(),
              CHAPTER: o?.chapter ?? "",
              STATE: o?.state ?? "",
              "FIELD OFFICE": o?.field_office ?? "",
              "GRANT NAME": g.title,
              FUNDER: g.funder_name ?? "",
              PROGRAM: g.program ?? "",
              "PAYMENT AMOUNT": Number(g.amount),
            };
          })
        : [{ NOTE: "—" }]
    ),
    "Grants"
  );

  const buf = XLSX.write(book, { type: "buffer", bookType: "xlsx" }) as Buffer;
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="revenue_${year}.xlsx"`,
    },
  });
}
