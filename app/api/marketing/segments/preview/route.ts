import { NextResponse } from "next/server";
import { getMarketingContactsAccess } from "@/lib/marketingContactsAccess";
import { resolveDynamicSegment, type SegmentRuleNode } from "@/lib/segments";

export async function POST(req: Request) {
  const access = await getMarketingContactsAccess();
  if (!access.ok) return NextResponse.json({ error: "Not authorized" }, { status: access.status });

  const { rules } = (await req.json()) as { rules: SegmentRuleNode };
  if (!rules) return NextResponse.json({ error: "rules is required" }, { status: 400 });

  try {
    const ids = await resolveDynamicSegment(rules);
    return NextResponse.json({ count: ids.length });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Could not evaluate rules" }, { status: 400 });
  }
}
