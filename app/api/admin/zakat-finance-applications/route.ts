import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

async function requireFinanceAccess() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, status: 401 as const };
  const { data: me } = await supabase.from("employees").select("id, role, is_zakat_finance").eq("auth_user_id", user.id).single();
  if (!me || (me.role !== "admin" && !me.is_zakat_finance)) return { ok: false as const, status: 403 as const };
  return { ok: true as const, supabase, employeeId: me.id };
}

export async function GET() {
  const auth = await requireFinanceAccess();
  if (!auth.ok) return NextResponse.json({ error: "Forbidden" }, { status: auth.status });

  const { data, error } = await auth.supabase
    .from("zakat_applications")
    .select(
      "id, application_number, applicant_name, category, program, amount_requested, amount_approved, payee_name, payee_address, status, decided_at, check_number, paid_at, office_id, case_manager_id, submitted_by, recommended_by_employee_id, recommended_by_name, funding_source, grant_id, voided_at, void_reason"
    )
    .in("status", ["approved", "paid"])
    .order("decided_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const apps = data ?? [];
  const employeeIds = [
    ...new Set(apps.map((a) => a.recommended_by_employee_id ?? a.case_manager_id ?? a.submitted_by).filter(Boolean)),
  ] as string[];
  const officeIds = [...new Set(apps.map((a) => a.office_id).filter(Boolean))] as string[];

  // Grants to choose from: this fiscal year and last.
  const year = new Date().getFullYear();
  const [{ data: employees }, { data: offices }, { data: grants }] = await Promise.all([
    employeeIds.length
      ? auth.supabase.from("employees").select("id, first_name, last_name").in("id", employeeIds)
      : Promise.resolve({ data: [] as { id: string; first_name: string; last_name: string }[] }),
    officeIds.length
      ? auth.supabase.from("b2s_offices").select("id, field_office, region").in("id", officeIds)
      : Promise.resolve({ data: [] as { id: string; field_office: string; region: string }[] }),
    auth.supabase
      .from("grants")
      .select("id, title, funder_name, program, fiscal_year, region, office_id")
      .eq("stream", "grant")
      .gte("fiscal_year", year - 1)
      .order("fiscal_year", { ascending: false })
      .order("title"),
  ]);
  const nameOf = new Map((employees ?? []).map((e) => [e.id, `${e.first_name ?? ""} ${e.last_name ?? ""}`.trim()]));
  const officeOf = new Map((offices ?? []).map((o) => [o.id, o]));

  // Grants already linked but older than last year still need to show by name.
  const linkedIds = apps.map((a) => a.grant_id).filter((g): g is string => !!g && !(grants ?? []).some((x) => x.id === g));
  const { data: olderGrants } = linkedIds.length
    ? await auth.supabase.from("grants").select("id, title, funder_name, program, fiscal_year, region, office_id").in("id", linkedIds)
    : { data: [] };

  return NextResponse.json({
    applications: apps.map((a) => {
      const recId = a.recommended_by_employee_id ?? (a.recommended_by_name ? null : a.case_manager_id ?? a.submitted_by);
      const office = a.office_id ? officeOf.get(a.office_id) : null;
      return {
        ...a,
        recommended_by: a.recommended_by_name || (recId ? nameOf.get(recId) ?? null : null),
        office_name: office?.field_office ?? null,
        office_region: office?.region ?? null,
      };
    }),
    grants: [...(grants ?? []), ...(olderGrants ?? [])],
  });
}
