import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { getMarketingContactsAccess } from "@/lib/marketingContactsAccess";

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const access = await getMarketingContactsAccess();
  if (!access.ok) return NextResponse.json({ error: "Not authorized" }, { status: access.status });

  const { disposition, notes, pledgeAmount } = await req.json();
  if (!disposition) return NextResponse.json({ error: "disposition is required" }, { status: 400 });

  const admin = createAdminClient();

  const { error } = await admin.from("donor_call_outcomes").insert({
    campaign_id: null,
    contact_id: params.id,
    caller_employee_id: access.employeeId,
    disposition,
    notes: notes?.trim() || null,
    pledge_amount: pledgeAmount || null,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Same significance as the campaign-queue outcome route - sticks the
  // contact permanently, checked by every future campaign's queue too.
  if (disposition === "do_not_call") {
    await admin
      .from("contact_tags")
      .upsert({ contact_id: params.id, tag: "do_not_call" }, { onConflict: "contact_id,tag", ignoreDuplicates: true });
  }

  return NextResponse.json({ ok: true });
}
