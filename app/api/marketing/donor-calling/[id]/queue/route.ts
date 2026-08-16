import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { getMarketingContactsAccess } from "@/lib/marketingContactsAccess";
import { resolveDynamicSegment, type SegmentRuleNode } from "@/lib/segments";

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const access = await getMarketingContactsAccess();
  if (!access.ok) return NextResponse.json({ error: "Not authorized" }, { status: access.status });

  const admin = createAdminClient();
  const { data: campaign } = await admin
    .from("donor_call_campaigns")
    .select("id, segment_id, script")
    .eq("id", params.id)
    .single();
  if (!campaign?.segment_id) return NextResponse.json({ error: "Campaign not found" }, { status: 404 });

  const { data: segment } = await admin.from("segments").select("type, rules").eq("id", campaign.segment_id).single();
  if (!segment) return NextResponse.json({ error: "Segment not found" }, { status: 404 });

  let contactIds: string[];
  if (segment.type === "static") {
    const { data } = await admin.from("segment_members").select("contact_id").eq("segment_id", campaign.segment_id);
    contactIds = (data ?? []).map((r: { contact_id: string }) => r.contact_id);
  } else {
    contactIds = await resolveDynamicSegment(segment.rules as SegmentRuleNode);
  }

  // Exclude anyone already called in this campaign - simple
  // "each contact called once" queue for now. Callback-requested
  // follow-up scheduling is a reasonable next enhancement, not built yet.
  const { data: alreadyCalled } = await admin
    .from("donor_call_outcomes")
    .select("contact_id")
    .eq("campaign_id", params.id);
  const calledSet = new Set((alreadyCalled ?? []).map((r: { contact_id: string }) => r.contact_id));

  // Also exclude anyone tagged do_not_call from a prior campaign -
  // that disposition is meant to stick across campaigns, not just
  // this one.
  const { data: dncTagged } = await admin.from("contact_tags").select("contact_id").eq("tag", "do_not_call");
  const dncSet = new Set((dncTagged ?? []).map((r: { contact_id: string }) => r.contact_id));

  const remaining = contactIds.filter((id) => !calledSet.has(id) && !dncSet.has(id));

  if (remaining.length === 0) {
    return NextResponse.json({ contact: null, remaining: 0, script: campaign.script });
  }

  const { data: contact } = await admin
    .from("contacts")
    .select("id, first_name, last_name, phone, email")
    .eq("id", remaining[0])
    .not("phone", "is", null)
    .maybeSingle();

  if (!contact) {
    // This contact had no phone - skip by recursing conceptually;
    // simplest fix client-side is to just call again, but to avoid
    // an infinite loop of no-phone contacts, filter here directly.
    const withPhones = (
      await admin.from("contacts").select("id, first_name, last_name, phone, email").in("id", remaining).not("phone", "is", null).limit(1)
    ).data;
    return NextResponse.json({ contact: withPhones?.[0] ?? null, remaining: remaining.length, script: campaign.script });
  }

  return NextResponse.json({ contact, remaining: remaining.length, script: campaign.script });
}
