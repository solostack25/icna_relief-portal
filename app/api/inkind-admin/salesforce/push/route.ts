import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getInkindAccess } from "@/lib/inkind/access";
import { pushSessionToSalesforce } from "@/lib/inkind/salesforce";

export async function POST(req: Request) {
  const access = await getInkindAccess();
  if (!access.ok) {
    return NextResponse.json({ error: "Not authorized" }, { status: access.status });
  }

  const { sessionId } = await req.json();
  if (!sessionId) {
    return NextResponse.json({ error: "sessionId is required" }, { status: 400 });
  }

  const supabase = await createClient();

  const [{ data: session, error: sessionError }, { data: donor }, { data: donations }] =
    await Promise.all([
      supabase.from("sessions").select("*").eq("id", sessionId).single(),
      supabase.from("donors").select("*").eq("session_id", sessionId).maybeSingle(),
      supabase
        .from("donations")
        .select(
          "item_name, item_code, condition, qty, unit_price, is_manual_price, notes, program, program_code, goods_type, sf_category"
        )
        .eq("session_id", sessionId),
    ]);

  if (sessionError || !session) {
    return NextResponse.json({ error: sessionError?.message ?? "Session not found" }, { status: 404 });
  }

  const result = await pushSessionToSalesforce(session, donor ?? null, donations ?? []);

  const summary = result.results
    .map((r) => (r.success ? `${r.program}: ✓${r.error ? ` (${r.error})` : ""}` : `${r.program}: ✗ ${r.error}`))
    .join(" | ");
  const firstHeaderId = result.results.find((r) => r.salesforceHeaderId)?.salesforceHeaderId;

  if (result.success) {
    await supabase
      .from("sessions")
      .update({
        synced_to_salesforce: true,
        salesforce_record_id: firstHeaderId ?? null,
        synced_at: new Date().toISOString(),
        sync_error: summary || null,
      })
      .eq("id", sessionId);
  } else {
    await supabase
      .from("sessions")
      .update({ sync_error: result.error ?? summary ?? "Unknown error" })
      .eq("id", sessionId);
  }

  return NextResponse.json({ ...result, summary });
}
