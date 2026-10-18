import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { resolveIntakeOffice } from "@/lib/inkind/offices";

export const dynamic = "force-dynamic";

// Starts an in-kind intake session for the station's office: next invoice
// number with that office's prefix (TXHOU-10182026-001, CABAY-…), office
// name + id on the session. Written with the service role so it works the
// same signed in or out.
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const { office, error } = await resolveIntakeOffice(body.officeId);
  if (!office) return NextResponse.json({ error }, { status: 400 });

  const admin = createAdminClient();
  const { data: invoiceId, error: invErr } = await admin.rpc("next_invoice_id", { prefix: office.inkindPrefix });
  if (invErr || !invoiceId) return NextResponse.json({ error: invErr?.message ?? "Could not generate an invoice number" }, { status: 500 });

  const { data, error: insErr } = await admin
    .from("sessions")
    .insert({ status: "active", invoice_id: invoiceId, office: office.name, office_id: office.id, donor_kind: "individual" })
    .select("id")
    .single();
  if (insErr || !data) return NextResponse.json({ error: insErr?.message ?? "Could not start a session" }, { status: 500 });

  return NextResponse.json({ sessionId: data.id, invoiceId, office: office.name });
}
