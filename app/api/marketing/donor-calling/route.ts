import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { getMarketingContactsAccess } from "@/lib/marketingContactsAccess";

export async function GET() {
  const access = await getMarketingContactsAccess();
  if (!access.ok) return NextResponse.json({ error: "Not authorized" }, { status: access.status });

  const admin = createAdminClient();
  const { data: campaigns, error } = await admin
    .from("donor_call_campaigns")
    .select("id, name, script, status, segment_id, segments(name)")
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const withCounts = await Promise.all(
    (campaigns ?? []).map(async (c: { id: string }) => {
      const { count: calledCount } = await admin
        .from("donor_call_outcomes")
        .select("*", { count: "exact", head: true })
        .eq("campaign_id", c.id);
      return { ...c, calledCount: calledCount ?? 0 };
    })
  );

  return NextResponse.json({ campaigns: withCounts });
}

export async function POST(req: Request) {
  const access = await getMarketingContactsAccess();
  if (!access.ok) return NextResponse.json({ error: "Not authorized" }, { status: access.status });

  const { name, script, segmentId } = await req.json();
  if (!name?.trim() || !segmentId) return NextResponse.json({ error: "name and segmentId are required" }, { status: 400 });

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("donor_call_campaigns")
    .insert({ name: name.trim(), script: script?.trim() || null, segment_id: segmentId, status: "active", created_by: access.employeeId })
    .select("id")
    .single();

  if (error || !data) return NextResponse.json({ error: error?.message ?? "Could not create campaign" }, { status: 500 });
  return NextResponse.json({ id: data.id });
}
