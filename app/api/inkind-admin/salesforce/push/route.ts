import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getInkindAccess } from "@/lib/inkind/access";
import { pushSessionToSalesforce } from "@/lib/inkind/salesforce";
import { loadInvoiceAttachments } from "@/lib/inkind/foodBank";
import { chargesPending, postFoodBankCharges } from "@/lib/inkind/foodBankCharges";

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

  // Food bank intakes carry the food bank's invoice photos onto the header.
  const extraFiles = await loadInvoiceAttachments(session.invoice_image_paths, session.invoice_id ?? session.id.slice(0, 8));
  const result = await pushSessionToSalesforce(session, donor ?? null, donations ?? [], extraFiles);

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

  // Food bank intakes saved with "Save" (not pushed yet) also post their
  // charges now: grant credit -> Grant Management, amount owed -> Vendor
  // Payment ticket. Anything already posted is skipped.
  let charges = session.charges ?? null;
  let chargeWarnings: string[] = [];
  if (chargesPending(charges)) {
    try {
      const r = await postFoodBankCharges(sessionId, access.employeeId);
      charges = r.charges;
      chargeWarnings = r.warnings;
    } catch (e: any) {
      chargeWarnings = [e.message ?? "Couldn't post the charges"];
    }
  }

  return NextResponse.json({ ...result, summary, charges, chargeWarnings });
}
