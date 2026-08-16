import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { getMarketingContactsAccess } from "@/lib/marketingContactsAccess";

export async function GET() {
  const access = await getMarketingContactsAccess();
  if (!access.ok) return NextResponse.json({ error: "Not authorized" }, { status: access.status });

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("email_campaigns")
    .select("id, name, subject, status, scheduled_send_at, sent_at, segment_id, segments(name)")
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ campaigns: data ?? [] });
}

export async function POST(req: Request) {
  const access = await getMarketingContactsAccess();
  if (!access.ok) return NextResponse.json({ error: "Not authorized" }, { status: access.status });

  const body = await req.json();
  const { name, subject, bodyHtml, segmentId, scheduledSendAt } = body;

  if (!name?.trim() || !subject?.trim() || !bodyHtml?.trim() || !segmentId) {
    return NextResponse.json({ error: "name, subject, bodyHtml, and segmentId are all required" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("email_campaigns")
    .insert({
      name: name.trim(),
      subject: subject.trim(),
      body_html: bodyHtml,
      segment_id: segmentId,
      status: scheduledSendAt ? "scheduled" : "draft",
      scheduled_send_at: scheduledSendAt || null,
      created_by: access.employeeId,
    })
    .select("id")
    .single();

  if (error || !data) return NextResponse.json({ error: error?.message ?? "Could not create campaign" }, { status: 500 });
  return NextResponse.json({ id: data.id });
}
