import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { submitZakatApplication } from "@/lib/zakatApproval";

async function requireEmployee() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, status: 401 as const };
  const { data: me } = await supabase.from("employees").select("id, role, assigned_office_id").eq("auth_user_id", user.id).single();
  if (!me) return { ok: false as const, status: 401 as const };
  return { ok: true as const, supabase, employeeId: me.id, role: me.role, assignedOfficeId: me.assigned_office_id };
}

export async function GET() {
  const auth = await requireEmployee();
  if (!auth.ok) return NextResponse.json({ error: "Unauthorized" }, { status: auth.status });

  // RLS already scopes this to the case manager's own submissions or
  // their office (see zakat_applications_migration.sql), admin/finance
  // sees everything.
  const { data, error } = await auth.supabase
    .from("zakat_applications")
    .select("id, applicant_name, category, amount_requested, amount_approved, status, submitted_at, decided_at")
    .order("submitted_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ applications: data });
}

export async function POST(req: Request) {
  const auth = await requireEmployee();
  if (!auth.ok) return NextResponse.json({ error: "Unauthorized" }, { status: auth.status });
  if (!auth.assignedOfficeId) {
    return NextResponse.json({ error: "You need an assigned office on file to submit an application" }, { status: 400 });
  }

  const body = await req.json();
  if (!body.applicant_name?.trim() || !body.category?.trim() || !body.amount_requested) {
    return NextResponse.json({ error: "Applicant name, category, and amount requested are required" }, { status: 400 });
  }

  const { data: application, error } = await auth.supabase
    .from("zakat_applications")
    .insert({
      client_id: body.client_id ?? null,
      office_id: auth.assignedOfficeId,
      case_manager_id: auth.employeeId,
      applicant_name: body.applicant_name.trim(),
      applicant_phone: body.applicant_phone ?? null,
      applicant_address: body.applicant_address ?? null,
      household_size: body.household_size ?? null,
      category: body.category.trim(),
      amount_requested: body.amount_requested,
      reason: body.reason ?? null,
      payee_name: body.payee_name ?? null,
      payee_address: body.payee_address ?? null,
      submitted_by: auth.employeeId,
    })
    .select("id")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const { approversNotified } = await submitZakatApplication(application.id);
  return NextResponse.json({ application, approversNotified });
}
