import { createAdminClient } from "@/lib/supabase/server";

// Dynamic segment rules are a small AND/OR tree of leaf conditions,
// e.g.:
// { op: "and", rules: [
//     { field: "tag", op: "eq", value: "top_donor" },
//     { field: "donation_total_12mo", op: "gte", value: 500 }
// ]}
//
// Kept intentionally simple (no nested aggregates, no SQL builder) -
// most nonprofit segmentation is 2-4 flat conditions. Evaluated by
// resolving each leaf to a Set of contact_ids, then intersecting
// (AND) or unioning (OR) in JS rather than building dynamic SQL,
// since segment sizes here are in the thousands, not millions.

export type SegmentRuleNode =
  | { op: "and" | "or"; rules: SegmentRuleNode[] }
  | { field: string; op: "eq" | "neq" | "gte" | "lte" | "contains"; value: string | number | boolean };

function isGroup(node: SegmentRuleNode): node is { op: "and" | "or"; rules: SegmentRuleNode[] } {
  return "rules" in node;
}

export const SEGMENT_FIELDS = [
  { key: "tag", label: "Has tag", type: "text" as const },
  { key: "source", label: "Contact source", type: "text" as const },
  { key: "email_opt_out", label: "Email opted out", type: "boolean" as const },
  { key: "sms_opt_out", label: "SMS opted out", type: "boolean" as const },
  { key: "created_after", label: "Contact created after (date)", type: "date" as const },
  { key: "donation_total_12mo", label: "Total given, last 12 months ($)", type: "number" as const },
  { key: "donation_count_12mo", label: "Number of gifts, last 12 months", type: "number" as const },
];

async function resolveLeaf(
  admin: ReturnType<typeof createAdminClient>,
  leaf: Extract<SegmentRuleNode, { field: string }>
): Promise<Set<string>> {
  const { field, op, value } = leaf;

  if (field === "tag") {
    const { data } = await admin.from("contact_tags").select("contact_id").eq("tag", String(value));
    return new Set((data ?? []).map((r: { contact_id: string }) => r.contact_id));
  }

  if (field === "source" || field === "email_opt_out" || field === "sms_opt_out") {
    let query = admin.from("contacts").select("id");
    query = op === "neq" ? query.neq(field, value) : query.eq(field, value);
    const { data } = await query;
    return new Set((data ?? []).map((r: { id: string }) => r.id));
  }

  if (field === "created_after") {
    const { data } = await admin.from("contacts").select("id").gte("created_at", String(value));
    return new Set((data ?? []).map((r: { id: string }) => r.id));
  }

  if (field === "donation_total_12mo" || field === "donation_count_12mo") {
    const twelveMonthsAgo = new Date();
    twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);
    const { data } = await admin
      .from("donor_gifts")
      .select("contact_id, amount")
      .gte("gift_date", twelveMonthsAgo.toISOString().slice(0, 10))
      .not("contact_id", "is", null);

    const totals = new Map<string, { sum: number; count: number }>();
    for (const row of (data ?? []) as { contact_id: string; amount: number }[]) {
      const cur = totals.get(row.contact_id) ?? { sum: 0, count: 0 };
      cur.sum += Number(row.amount);
      cur.count += 1;
      totals.set(row.contact_id, cur);
    }

    const target = Number(value);
    const matches = new Set<string>();
    for (const [contactId, agg] of totals) {
      const metric = field === "donation_total_12mo" ? agg.sum : agg.count;
      const passes =
        op === "gte" ? metric >= target : op === "lte" ? metric <= target : op === "eq" ? metric === target : false;
      if (passes) matches.add(contactId);
    }
    return matches;
  }

  return new Set();
}

export async function resolveDynamicSegment(rules: SegmentRuleNode): Promise<string[]> {
  const admin = createAdminClient();

  async function evaluate(node: SegmentRuleNode): Promise<Set<string>> {
    if (isGroup(node)) {
      const results = await Promise.all(node.rules.map(evaluate));
      if (results.length === 0) return new Set();
      if (node.op === "and") {
        return results.reduce((acc, s) => new Set([...acc].filter((id) => s.has(id))));
      }
      return new Set(results.flatMap((s) => [...s]));
    }
    return resolveLeaf(admin, node);
  }

  const finalSet = await evaluate(rules);
  return [...finalSet];
}
