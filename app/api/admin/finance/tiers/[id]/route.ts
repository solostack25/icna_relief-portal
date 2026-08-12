import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { getFinanceAdminAccess } from "@/lib/financeAdminAccess";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const access = await getFinanceAdminAccess();
  if (!access.ok) return NextResponse.json({ error: "Not authorized" }, { status: access.status });

  const { id } = await params;
  const { tier_order, tier_name, job_titles, max_amount } = await req.json();

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("finance_approval_tiers")
    .update({
      ...(tier_order !== undefined ? { tier_order } : {}),
      ...(tier_name !== undefined ? { tier_name } : {}),
      ...(job_titles !== undefined ? { job_titles } : {}),
      ...(max_amount !== undefined ? { max_amount: max_amount === "" ? null : max_amount } : {}),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select("*")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ tier: data });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const access = await getFinanceAdminAccess();
  if (!access.ok) return NextResponse.json({ error: "Not authorized" }, { status: access.status });

  const { id } = await params;
  const admin = createAdminClient();
  const { error } = await admin.from("finance_approval_tiers").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
