import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { getMarketingContactsAccess } from "@/lib/marketingContactsAccess";
import { pushDonorCallToSalesforce } from "@/lib/marketing/salesforceDonorCall";

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const access = await getMarketingContactsAccess();
  if (!access.ok) return NextResponse.json({ error: "Not authorized" }, { status: access.status });

  const { contactId, disposition, notes, pledgeAmount } = await req.json();
  if (!contactId || !disposition) {
    return NextResponse.json({ error: "contactId and disposition are required" }, { status: 400 });
  }

  const admin = createAdminClient();

  const now = new Date().toISOString();
  const { error } = await admin.from("donor_call_outcomes").insert({
    campaign_id: params.id,
    contact_id: contactId,
    caller_employee_id: access.employeeId,
    disposition,
    notes: notes?.trim() || null,
    pledge_amount: pledgeAmount || null,
    called_at: now,
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // "do_not_call" here doubles as a phone opt-out on the contact
  // record, same significance as sms_opt_out - keeps this campaign
  // (and any future one) from calling them again.
  if (disposition === "do_not_call") {
    await admin.from("contact_tags").upsert(
      { contact_id: contactId, tag: "do_not_call" },
      { onConflict: "contact_id,tag", ignoreDuplicates: true }
    );
  }

  // Wired in at the end, after the local log is already safely saved -
  // best-effort, never blocks or fails this request.
  const { data: campaign } = await admin.from("donor_call_campaigns").select("name").eq("id", params.id).maybeSingle();
  const sf = await pushDonorCallToSalesforce({
    contactId,
    disposition,
    notes: notes?.trim() || null,
    pledgeAmount: pledgeAmount || null,
    calledAt: now,
    campaignName: campaign?.name ?? null,
  });

  return NextResponse.json({ ok: true, salesforceSynced: sf.synced });
}
