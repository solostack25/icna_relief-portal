import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { financeGate, isResponse } from "@/lib/finance/access";

export const dynamic = "force-dynamic";

export async function GET() {
  const gate = await financeGate();
  if (isResponse(gate)) return gate;
  const admin = createAdminClient();
  const { data } = await admin
    .from("fin_import_batches")
    .select("id, source, file_name, period_label, rows_count, status, created_at, created_by")
    .order("created_at", { ascending: false })
    .limit(30);
  const ids = [...new Set((data ?? []).map((b: any) => b.created_by).filter(Boolean))] as string[];
  const { data: people } = ids.length ? await admin.from("employees").select("id, first_name, last_name").in("id", ids) : { data: [] };
  const name = new Map((people ?? []).map((p: any) => [p.id, `${p.first_name} ${p.last_name}`]));
  return NextResponse.json({ batches: (data ?? []).map((b: any) => ({ ...b, by: b.created_by ? name.get(b.created_by) ?? null : null })) });
}

// DELETE ?id= removes the rows that import last wrote.
export async function DELETE(req: NextRequest) {
  const gate = await financeGate();
  if (isResponse(gate)) return gate;
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const admin = createAdminClient();
  const { count } = await admin.from("fin_expense_rows").delete({ count: "exact" }).eq("batch_id", id);
  await admin.from("fin_import_batches").update({ status: "removed" }).eq("id", id);
  return NextResponse.json({ ok: true, removed: count ?? 0 });
}
