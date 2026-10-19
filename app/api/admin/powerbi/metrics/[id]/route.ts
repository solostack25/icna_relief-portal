import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { cleanMetric, requirePowerBiAdmin } from "@/lib/powerbiAdminAuth";

export const dynamic = "force-dynamic";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requirePowerBiAdmin())) return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  const { id } = await params;
  const { out, missing } = cleanMetric(await req.json().catch(() => ({})));
  if (missing.length) return NextResponse.json({ error: `Missing: ${missing.join(", ")}` }, { status: 400 });
  const { data, error } = await createAdminClient()
    .from("pbi_compare_metrics")
    .update({ ...out, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("*")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ metric: data });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requirePowerBiAdmin())) return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  const { id } = await params;
  const { error } = await createAdminClient().from("pbi_compare_metrics").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
