import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { getFinanceAdminAccess } from "@/lib/financeAdminAccess";

export async function GET() {
  const access = await getFinanceAdminAccess();
  if (!access.ok) return NextResponse.json({ error: "Not authorized" }, { status: access.status });

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("finance_pex_cards")
    .select("id, last4, job_title, grant_eligible, assigned_date, employee:employee_id(first_name, last_name, email), office:office_id(field_office)")
    .order("assigned_date", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ cards: data });
}

export async function POST(req: Request) {
  const access = await getFinanceAdminAccess();
  if (!access.ok) return NextResponse.json({ error: "Not authorized" }, { status: access.status });

  const body = await req.json();
  if (!body.employee_id || !body.last4) return NextResponse.json({ error: "Employee and last 4 digits are required" }, { status: 400 });

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("finance_pex_cards")
    .insert({
      employee_id: body.employee_id,
      office_id: body.office_id ?? null,
      last4: body.last4,
      job_title: body.job_title ?? null,
      grant_eligible: !!body.grant_eligible,
      assigned_date: body.assigned_date ?? new Date().toISOString().slice(0, 10),
    })
    .select("id")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ card: data });
}
