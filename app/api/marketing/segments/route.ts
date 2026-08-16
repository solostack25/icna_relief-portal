import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { getMarketingContactsAccess } from "@/lib/marketingContactsAccess";
import { resolveDynamicSegment } from "@/lib/segments";

export async function GET() {
  const access = await getMarketingContactsAccess();
  if (!access.ok) return NextResponse.json({ error: "Not authorized" }, { status: access.status });

  const admin = createAdminClient();
  const { data: segments, error } = await admin
    .from("segments")
    .select("id, name, description, type, rules, created_at")
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Attach a live member count to each segment. Cheap enough at
  // nonprofit scale (dozens of segments, thousands of contacts) to
  // just resolve on every list load rather than caching counts.
  const withCounts = await Promise.all(
    (segments ?? []).map(async (s: { id: string; type: string; rules: unknown }) => {
      let count = 0;
      if (s.type === "static") {
        const { count: c } = await admin
          .from("segment_members")
          .select("*", { count: "exact", head: true })
          .eq("segment_id", s.id);
        count = c ?? 0;
      } else if (s.rules) {
        try {
          count = (await resolveDynamicSegment(s.rules as any)).length;
        } catch {
          count = 0;
        }
      }
      return { ...s, memberCount: count };
    })
  );

  return NextResponse.json({ segments: withCounts });
}

export async function POST(req: Request) {
  const access = await getMarketingContactsAccess();
  if (!access.ok) return NextResponse.json({ error: "Not authorized" }, { status: access.status });

  const body = await req.json();
  const { name, description, type, rules, contactIds } = body;

  if (!name?.trim()) return NextResponse.json({ error: "Name is required" }, { status: 400 });
  if (type !== "static" && type !== "dynamic") {
    return NextResponse.json({ error: "type must be 'static' or 'dynamic'" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: segment, error } = await admin
    .from("segments")
    .insert({
      name: name.trim(),
      description: description?.trim() || null,
      type,
      rules: type === "dynamic" ? rules : null,
      created_by: access.employeeId,
    })
    .select("id")
    .single();

  if (error || !segment) return NextResponse.json({ error: error?.message ?? "Could not create segment" }, { status: 500 });

  if (type === "static" && Array.isArray(contactIds) && contactIds.length > 0) {
    await admin
      .from("segment_members")
      .insert(contactIds.map((contact_id: string) => ({ segment_id: segment.id, contact_id })));
  }

  return NextResponse.json({ id: segment.id });
}
