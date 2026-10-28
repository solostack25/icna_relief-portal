import { NextResponse } from "next/server";
import { getFlierMarketingAccess } from "@/lib/flierMarketingAccess";
import { createClient } from "@/lib/supabase/server";

// Marketing approves / rejects AI-generated fliers for the shared gallery.
export async function POST(req: Request) {
  const access = await getFlierMarketingAccess();
  if (!access.ok) return NextResponse.json({ error: "Not authorized" }, { status: access.status });
  const body = await req.json().catch(() => ({}));
  const { templateId, status } = body as { templateId?: string; status?: string };
  if (!templateId || !["approved", "rejected", "pending"].includes(status ?? "")) return NextResponse.json({ error: "templateId and status required" }, { status: 400 });
  const supabase = await createClient();
  const { error } = await supabase.from("flier_templates").update({ review_status: status, updated_at: new Date().toISOString() }).eq("id", templateId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
