import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { getMarketingContactsAccess } from "@/lib/marketingContactsAccess";
import { pushDonorCallToSalesforce } from "@/lib/marketing/salesforceDonorCall";

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const access = await getMarketingContactsAccess();
  if (!access.ok) return NextResponse.json({ error: "Not authorized" }, { status: access.status });

  const { disposition, notes, pledgeAmount } = await req.json();
  if (!disposition) return NextResponse.json({ error: "disposition is required" }, { status: 400 });

  const admin = createAdminClient();

  const now = new Date().toISOString();
  const { error } = await admin.from("donor_call_outcomes").insert({
    campaign_id: null,
    contact_id: params.id,
    caller_employee_id: access.employeeId,
    disposition,
    notes: notes?.trim() || null,
    pledge_amount: pledgeAmount || null,
    called_at: now,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Same significance as the campaign-queue outcome route - sticks the
  // contact permanently, checked by every future campaign's queue too.
  if (disposition === "do_not_call") {
    await admin
      .from("contact_tags")
      .upsert({ contact_id: params.id, tag: "do_not_call" }, { onConflict: "contact_id,tag", ignoreDuplicates: true });
  }

  // Wired in at the end, after the local log is already safely saved -
  // best-effort, never blocks or fails this request.
  const sf = await pushDonorCallToSalesforce({
    contactId: params.id,
    disposition,
    notes: notes?.trim() || null,
    pledgeAmount: pledgeAmount || null,
    calledAt: now,
    campaignName: null,
  });

  return NextResponse.json({ ok: true, salesforceSynced: sf.synced });
}
