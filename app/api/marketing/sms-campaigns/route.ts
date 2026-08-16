import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { getMarketingContactsAccess } from "@/lib/marketingContactsAccess";

export async function GET() {
  const access = await getMarketingContactsAccess();
  if (!access.ok) return NextResponse.json({ error: "Not authorized" }, { status: access.status });

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("sms_campaigns")
    .select("id, name, body, status, sent_at, segment_id, segments(name)")
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ campaigns: data ?? [] });
}

export async function POST(req: Request) {
  const access = await getMarketingContactsAccess();
  if (!access.ok) return NextResponse.json({ error: "Not authorized" }, { status: access.status });

  const body = await req.json();
  const { name, text, segmentId } = body;

  if (!name?.trim() || !text?.trim() || !segmentId) {
    return NextResponse.json({ error: "name, text, and segmentId are all required" }, { status: 400 });
  }
  if (text.length > 1024) {
    return NextResponse.json({ error: "Text exceeds Skyetel's 1024 character limit" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("sms_campaigns")
    .insert({
      name: name.trim(),
      body: text,
      segment_id: segmentId,
      status: "draft",
      created_by: access.employeeId,
    })
    .select("id")
    .single();

  if (error || !data) return NextResponse.json({ error: error?.message ?? "Could not create campaign" }, { status: 500 });
  return NextResponse.json({ id: data.id });
}
