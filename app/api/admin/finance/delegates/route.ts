import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { getFinanceAdminAccess } from "@/lib/financeAdminAccess";

export async function GET() {
  const access = await getFinanceAdminAccess();
  if (!access.ok) return NextResponse.json({ error: "Not authorized" }, { status: access.status });

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("finance_approval_delegates")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ delegates: data });
}

export async function POST(req: Request) {
  const access = await getFinanceAdminAccess();
  if (!access.ok) return NextResponse.json({ error: "Not authorized" }, { status: access.status });

  const { original_email, original_name, delegate_email, delegate_name, starts_at, ends_at, note } =
    await req.json();
  if (!original_email || !delegate_email) {
    return NextResponse.json({ error: "original_email and delegate_email are required" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("finance_approval_delegates")
    .insert({
      original_email,
      original_name: original_name ?? null,
      delegate_email,
      delegate_name: delegate_name ?? null,
      starts_at: starts_at || new Date().toISOString().slice(0, 10),
      ends_at: ends_at || null,
      note: note ?? null,
      created_by: access.employeeId,
    })
    .select("*")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ delegate: data });
}
