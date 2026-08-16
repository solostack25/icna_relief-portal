import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { getMarketingContactsAccess } from "@/lib/marketingContactsAccess";
import { resolveDynamicSegment, type SegmentRuleNode } from "@/lib/segments";

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const access = await getMarketingContactsAccess();
  if (!access.ok) return NextResponse.json({ error: "Not authorized" }, { status: access.status });

  const { segmentId } = await req.json();
  if (!segmentId) return NextResponse.json({ error: "segmentId is required" }, { status: 400 });

  const admin = createAdminClient();

  const { data: firstStep } = await admin
    .from("sequence_steps")
    .select("delay_after_previous_hours")
    .eq("sequence_id", params.id)
    .eq("step_order", 1)
    .single();

  if (!firstStep) return NextResponse.json({ error: "Sequence has no steps yet" }, { status: 400 });

  const { data: segment } = await admin.from("segments").select("type, rules").eq("id", segmentId).single();
  if (!segment) return NextResponse.json({ error: "Segment not found" }, { status: 404 });

  let contactIds: string[];
  if (segment.type === "static") {
    const { data } = await admin.from("segment_members").select("contact_id").eq("segment_id", segmentId);
    contactIds = (data ?? []).map((r: { contact_id: string }) => r.contact_id);
  } else {
    contactIds = await resolveDynamicSegment(segment.rules as SegmentRuleNode);
  }

  if (contactIds.length === 0) {
    return NextResponse.json({ error: "Segment has no contacts to enroll" }, { status: 400 });
  }

  const dueAt = new Date(Date.now() + firstStep.delay_after_previous_hours * 60 * 60 * 1000).toISOString();

  // Upsert so re-enrolling the same segment doesn't create duplicate
  // rows or reset progress for contacts already mid-sequence.
  const { error, count } = await admin
    .from("sequence_enrollments")
    .upsert(
      contactIds.map((contact_id) => ({
        sequence_id: params.id,
        contact_id,
        current_step: 0,
        status: "active",
        next_step_due_at: dueAt,
      })),
      { onConflict: "sequence_id,contact_id", ignoreDuplicates: true, count: "exact" }
    );

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await admin.from("campaign_sequences").update({ status: "active" }).eq("id", params.id);

  return NextResponse.json({ enrolled: count ?? contactIds.length });
}
