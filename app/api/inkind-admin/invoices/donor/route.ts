import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getInkindAccess } from "@/lib/inkind/access";
import { buildDonorInvoice } from "@/lib/inkind/invoices";
import { renderDonorInvoicePdf } from "@/lib/inkind/renderInvoicePdf";
import type { DonationRow } from "@/lib/inkind/fetchSessions";

// This must never be cached/statically rendered — it has to reflect
// whatever's in the donations table at the moment it's requested, not
// whatever was there the first time this URL was hit.
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const access = await getInkindAccess();
  if (!access.ok) {
    return NextResponse.json({ error: "Not authorized" }, { status: access.status });
  }

  const { searchParams } = new URL(req.url);
  const sessionId = searchParams.get("sessionId");
  if (!sessionId) {
    return NextResponse.json({ error: "sessionId is required" }, { status: 400 });
  }

  const supabase = await createClient();

  const [{ data: session, error: sessionError }, { data: donor }, { data: donations }, { data: settings }] =
    await Promise.all([
      supabase.from("sessions").select("*").eq("id", sessionId).single(),
      supabase.from("donors").select("*").eq("session_id", sessionId).maybeSingle(),
      supabase
        .from("donations")
        .select("item_code, item_name, condition, program, program_code, unit_price, is_manual_price, qty, notes")
        .eq("session_id", sessionId),
      supabase.from("settings").select("invoice_disclaimer").eq("id", "global").maybeSingle(),
    ]);

  if (sessionError || !session) {
    return NextResponse.json({ error: sessionError?.message ?? "Session not found" }, { status: 404 });
  }

  const data = buildDonorInvoice(
    session,
    donor ?? null,
    (donations ?? []) as DonationRow[],
    settings?.invoice_disclaimer ?? null
  );
  const pdfBytes = await renderDonorInvoicePdf(data);

  return new NextResponse(Buffer.from(pdfBytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${data.invoiceNumber}-donor.pdf"`,
      "Cache-Control": "no-store, must-revalidate",
    },
  });
}
