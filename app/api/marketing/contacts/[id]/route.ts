import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { getMarketingContactsAccess } from "@/lib/marketingContactsAccess";

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const access = await getMarketingContactsAccess();
  if (!access.ok) return NextResponse.json({ error: "Not authorized" }, { status: access.status });

  const admin = createAdminClient();

  const { data: contact, error } = await admin
    .from("contacts")
    .select("id, first_name, last_name, phone, email, source, email_opt_out, sms_opt_out")
    .eq("id", params.id)
    .single();
  if (error || !contact) return NextResponse.json({ error: "Contact not found" }, { status: 404 });

  const { data: dncTag } = await admin
    .from("contact_tags")
    .select("tag")
    .eq("contact_id", params.id)
    .eq("tag", "do_not_call")
    .maybeSingle();

  const { data: tags } = await admin.from("contact_tags").select("tag").eq("contact_id", params.id);

  const { data: history } = await admin
    .from("donor_call_outcomes")
    .select("id, disposition, notes, pledge_amount, called_at, campaign_id, donor_call_campaigns(name)")
    .eq("contact_id", params.id)
    .order("called_at", { ascending: false });

  return NextResponse.json({
    contact: {
      ...contact,
      do_not_call: !!dncTag,
      tags: (tags ?? []).map((t: { tag: string }) => t.tag).filter((t: string) => t !== "do_not_call"),
    },
    history: (history ?? []).map((h: any) => ({
      id: h.id,
      disposition: h.disposition,
      notes: h.notes,
      pledge_amount: h.pledge_amount,
      called_at: h.called_at,
      campaign_name: h.donor_call_campaigns?.name ?? null,
    })),
  });
}
