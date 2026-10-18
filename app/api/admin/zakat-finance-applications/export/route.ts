import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const NO_IDS = ["00000000-0000-0000-0000-000000000000"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

// GET /api/admin/zakat-finance-applications/export?year=2026
//
// IRFAS for Power BI — same columns as the Master Cleaner's IRFAS output,
// built from the portal's approved/paid applications (voided excluded).
// The grant-vs-community split, program, recommender and approvers come
// from real fields instead of keyword guessing. The cleaner's zero-value
// padding rows (one per office × month × program) are not generated.
export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { data: me } = await supabase.from("employees").select("role, is_zakat_finance").eq("auth_user_id", user.id).single();
  if (!me || (me.role !== "admin" && !me.is_zakat_finance)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const year = Number(req.nextUrl.searchParams.get("year")) || new Date().getFullYear();

  const { data: apps, error } = await supabase
    .from("zakat_applications")
    .select(
      "id, application_number, client_id, office_id, case_manager_id, submitted_by, category, program, amount_requested, amount_approved, status, decided_at, check_number, paid_at, recommended_by_employee_id, recommended_by_name, funding_source, grant_id"
    )
    .in("status", ["approved", "paid"])
    .is("voided_at", null)
    .gte("decided_at", `${year}-01-01`)
    .lt("decided_at", `${year + 1}-01-01`)
    .order("decided_at");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!apps?.length) return NextResponse.json({ error: `No approved IRFAS applications in ${year}.` }, { status: 404 });

  const ids = apps.map((a) => a.id);
  const clientIds = [...new Set(apps.map((a) => a.client_id).filter(Boolean))] as string[];
  const empIds = [
    ...new Set(apps.map((a) => a.recommended_by_employee_id ?? (a.recommended_by_name ? null : a.case_manager_id ?? a.submitted_by)).filter(Boolean)),
  ] as string[];
  const grantIds = [...new Set(apps.map((a) => a.grant_id).filter(Boolean))] as string[];

  const [{ data: offices }, { data: regions }, { data: clients }, { data: emps }, { data: grants }, { data: approvals }, { data: limits }] =
    await Promise.all([
      supabase.from("b2s_offices").select("id, region, state, chapter, field_office"),
      supabase.from("b2s_regions").select("region, rsn"),
      supabase.from("clients").select("id, city, zip").in("id", clientIds.length ? clientIds : NO_IDS),
      supabase.from("employees").select("id, first_name, last_name").in("id", empIds.length ? empIds : NO_IDS),
      supabase.from("grants").select("id, title").in("id", grantIds.length ? grantIds : NO_IDS),
      supabase.from("zakat_application_approvals").select("application_id, approver_name, approver_email, decision").in("application_id", ids),
      supabase.from("zakat_office_limits").select("office_id, limit_amount"),
    ]);

  const officeMap = new Map((offices ?? []).map((o) => [o.id, o]));
  const rsnMap = new Map((regions ?? []).map((r) => [r.region, r.rsn]));
  const clientMap = new Map((clients ?? []).map((c) => [c.id, c]));
  const empMap = new Map((emps ?? []).map((e) => [e.id, `${e.first_name ?? ""} ${e.last_name ?? ""}`.trim()]));
  const grantMap = new Map((grants ?? []).map((g) => [g.id, g.title]));
  const limitMap = new Map((limits ?? []).map((l) => [l.office_id, Number(l.limit_amount)]));
  const approversBy = new Map<string, string[]>();
  for (const ap of approvals ?? []) {
    if (ap.decision !== "approved") continue;
    const list = approversBy.get(ap.application_id) ?? [];
    list.push(ap.approver_name || ap.approver_email);
    approversBy.set(ap.application_id, list);
  }

  const rows = apps.map((a) => {
    const d = new Date(a.decided_at);
    const local = d.toLocaleDateString("en-CA", { timeZone: "America/Chicago" });
    const month = Number(local.slice(5, 7));
    const o = a.office_id ? officeMap.get(a.office_id) : null;
    const c = a.client_id ? clientMap.get(a.client_id) : null;
    const amount = Number(a.amount_approved ?? a.amount_requested ?? 0);
    const recId = a.recommended_by_employee_id ?? (a.recommended_by_name ? null : a.case_manager_id ?? a.submitted_by);
    return {
      YEAR: Number(local.slice(0, 4)),
      QUARTER: `Q${Math.floor((month - 1) / 3) + 1}`,
      "MONTH NAME": MONTHS[month - 1],
      "MONTH NUMBER": month,
      "DECISION DATE": local,
      REGION: (o?.region ?? "").toUpperCase(),
      CHAPTER: o?.chapter ?? "",
      STATE: o?.state ?? "",
      "FIELD OFFICE": o?.field_office ?? "",
      "REGION NUMBER": rsnMap.get(o?.region ?? "") ?? null,
      "CASE ID": a.application_number ?? a.id,
      CITY: c?.city ?? "",
      "ZIP CODE": (c?.zip ?? "").toString().match(/\d{5}/)?.[0] ?? "",
      "CHECK DATE": a.paid_at ? new Date(a.paid_at).toLocaleDateString("en-CA", { timeZone: "America/Chicago" }) : "",
      "CHECK #": a.check_number ?? "",
      "AMOUNT APPROVED": amount,
      "APPROVED BY": (approversBy.get(a.id) ?? []).join(", "),
      "RECOMMENDED BY": a.recommended_by_name || (recId ? empMap.get(recId) ?? "" : ""),
      "SERVICE REQUESTED": a.category,
      PROGRAM: a.program ?? "General",
      "GRANT NAME": a.grant_id ? grantMap.get(a.grant_id) ?? "" : "",
      "REVENUE RAISED TOTAL": 0,
      "COMMUNITY REVENUE RAISED": 0,
      "GRANTS REVENUE RAISED": 0,
      "FINANCIAL ASSISTANCE VIA COMMUNITY REVENUE": a.funding_source === "community" ? amount : 0,
      "FINANCIAL ASSISTANCE VIA GRANTS": a.funding_source === "grant" ? amount : 0,
      LIMITS: a.office_id ? limitMap.get(a.office_id) ?? 0 : 0,
      STATUS: a.status === "paid" ? "Paid" : "Approved",
      "FUNDING SET": a.funding_source ? "Yes" : "No",
    };
  });

  const sheet = XLSX.utils.json_to_sheet(rows);
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, "IRFAS");
  const buf = XLSX.write(book, { type: "buffer", bookType: "xlsx" }) as Buffer;
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="irfas_${year}.xlsx"`,
    },
  });
}
