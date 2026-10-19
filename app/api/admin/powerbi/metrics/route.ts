import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { cleanMetric, requirePowerBiAdmin } from "@/lib/powerbiAdminAuth";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await requirePowerBiAdmin())) return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  const { data, error } = await createAdminClient().from("pbi_compare_metrics").select("*").order("sort").order("label");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ metrics: data });
}

export async function POST(req: Request) {
  const me = await requirePowerBiAdmin();
  if (!me) return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  const { out, missing } = cleanMetric(await req.json().catch(() => ({})));
  if (missing.length) return NextResponse.json({ error: `Missing: ${missing.join(", ")}` }, { status: 400 });
  const { data, error } = await createAdminClient().from("pbi_compare_metrics").insert({ ...out, created_by: me.id }).select("*").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ metric: data });
}
