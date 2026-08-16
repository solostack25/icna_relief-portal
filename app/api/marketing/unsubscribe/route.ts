import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";

// Public by design - this link is clicked from an email by someone
// who is not logged into the portal. CAN-SPAM requires unsubscribe
// to work without requiring a login.
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const contactId = searchParams.get("contact");
  if (!contactId) return NextResponse.json({ error: "Missing contact" }, { status: 400 });

  const admin = createAdminClient();
  await admin.from("contacts").update({ email_opt_out: true }).eq("id", contactId);

  return NextResponse.redirect(new URL("/marketing/unsubscribed", req.url));
}
