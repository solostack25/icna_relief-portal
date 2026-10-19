import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { financeGate, isResponse } from "@/lib/finance/access";
import { pullQboMonth } from "@/lib/finance/qbOnline";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

// POST { year, month, source: "online" | "desktop" }
//   online  → pulled from QuickBooks Online now
//   desktop → queued; the Web Connector picks it up on its next run
export async function POST(req: NextRequest) {
  const gate = await financeGate();
  if (isResponse(gate)) return gate;
  const b = await req.json().catch(() => ({}));
  const year = Number(b.year);
  const month = Number(b.month);
  const source = b.source === "desktop" ? "desktop" : "online";
  if (!(year >= 2000 && year <= 2100) || !(month >= 1 && month <= 12)) return NextResponse.json({ error: "Pick a month" }, { status: 400 });
  const admin = createAdminClient();

  if (source === "desktop") {
    await admin.from("fin_qb_sync_queue").update({ status: "failed", error: "Replaced by a newer request", finished_at: new Date().toISOString() }).eq("source", "desktop").eq("status", "queued").eq("year", year).eq("month", month);
    const { error } = await admin.from("fin_qb_sync_queue").insert({ year, month, source, requested_by: gate.employeeId });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, queued: true });
  }

  const { data: q } = await admin.from("fin_qb_sync_queue").insert({ year, month, source, status: "sent", requested_by: gate.employeeId }).select("id").single();
  try {
    const result = await pullQboMonth(year, month, gate.employeeId);
    if (q) await admin.from("fin_qb_sync_queue").update({ status: "done", batch_id: result.batchId, finished_at: new Date().toISOString() }).eq("id", q.id);
    return NextResponse.json({ ok: true, result });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (q) await admin.from("fin_qb_sync_queue").update({ status: "failed", error: msg, finished_at: new Date().toISOString() }).eq("id", q.id);
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
