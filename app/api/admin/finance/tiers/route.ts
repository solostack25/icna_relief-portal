import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { getFinanceAdminAccess } from "@/lib/financeAdminAccess";

export async function GET() {
  const access = await getFinanceAdminAccess();
  if (!access.ok) return NextResponse.json({ error: "Not authorized" }, { status: access.status });

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("finance_approval_tiers")
    .select("*")
    .order("tier_order", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ tiers: data });
}

export async function POST(req: Request) {
  const access = await getFinanceAdminAccess();
  if (!access.ok) return NextResponse.json({ error: "Not authorized" }, { status: access.status });

  const { tier_order, tier_name, job_titles, max_amount } = await req.json();
  if (!tier_order || !tier_name) {
    return NextResponse.json({ error: "tier_order and tier_name are required" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("finance_approval_tiers")
    .insert({
      tier_order,
      tier_name,
      job_titles: job_titles ?? [],
      max_amount: max_amount === "" || max_amount === undefined ? null : max_amount,
    })
    .select("*")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ tier: data });
}
