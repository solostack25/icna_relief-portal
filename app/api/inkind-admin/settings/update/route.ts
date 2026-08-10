import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { getInkindAccess } from "@/lib/inkind/access";

export async function POST(req: Request) {
  const access = await getInkindAccess();
  if (!access.ok) {
    return NextResponse.json({ error: "Not authorized" }, { status: access.status });
  }

  const body = await req.json();
  const { invoiceDisclaimer, emailSubject, emailBody } = body;

  const updates: Record<string, unknown> = {};
  if (invoiceDisclaimer !== undefined) updates.invoice_disclaimer = invoiceDisclaimer;
  if (emailSubject !== undefined) updates.email_subject = emailSubject;
  if (emailBody !== undefined) updates.email_body = emailBody;

  const admin = createAdminClient();
  const { data, error } = await admin.from("settings").update(updates).eq("id", "global").select().single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ success: true, settings: data });
}
