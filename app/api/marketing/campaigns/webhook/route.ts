import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";

// Resend webhook receiver. NOTE: does not yet verify the svix
// signature Resend sends (Svix-Signature header) - that's a fast
// follow before this goes live for real, but not needed to build out
// the rest of the pipeline against test sends first. See:
// https://resend.com/docs/dashboard/webhooks/verify-webhooks-requests
export async function POST(req: Request) {
  const body = await req.json();
  const eventType: string = body.type ?? "";
  const messageId: string | undefined = body.data?.email_id;
  if (!messageId) return NextResponse.json({ ok: true });

  const admin = createAdminClient();
  const now = new Date().toISOString();

  const statusMap: Record<string, { status: string; timestampField?: string }> = {
    "email.delivered": { status: "delivered" },
    "email.opened": { status: "opened", timestampField: "opened_at" },
    "email.clicked": { status: "clicked", timestampField: "clicked_at" },
    "email.bounced": { status: "bounced" },
  };

  const mapped = statusMap[eventType];
  if (!mapped) return NextResponse.json({ ok: true });

  const update: Record<string, string> = { status: mapped.status };
  if (mapped.timestampField) update[mapped.timestampField] = now;

  await admin.from("email_sends").update(update).eq("resend_message_id", messageId);

  return NextResponse.json({ ok: true });
}
