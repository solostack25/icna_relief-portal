import { createAdminClient } from "@/lib/supabase/server";
import { resolveDynamicSegment, type SegmentRuleNode } from "@/lib/segments";

export async function resolveCampaignRecipients(
  segmentId: string
): Promise<{ id: string; email: string; first_name: string | null }[]> {
  const admin = createAdminClient();

  const { data: segment } = await admin.from("segments").select("type, rules").eq("id", segmentId).single();
  if (!segment) return [];

  let contactIds: string[];
  if (segment.type === "static") {
    const { data } = await admin.from("segment_members").select("contact_id").eq("segment_id", segmentId);
    contactIds = (data ?? []).map((r: { contact_id: string }) => r.contact_id);
  } else {
    contactIds = await resolveDynamicSegment(segment.rules as SegmentRuleNode);
  }

  if (contactIds.length === 0) return [];

  const { data: contacts } = await admin
    .from("contacts")
    .select("id, email, first_name, email_opt_out")
    .in("id", contactIds)
    .eq("email_opt_out", false)
    .not("email", "is", null);

  return (contacts ?? []).map((c: { id: string; email: string; first_name: string | null }) => ({
    id: c.id,
    email: c.email,
    first_name: c.first_name,
  }));
}
