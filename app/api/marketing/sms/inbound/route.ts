import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";

// Configured as the callback URL on the Skyetel-side SMS-enabled
// number (Admin > Connectors has the setup notes). Skyetel posts:
// { "to": "13609865200", "from": "15558001234", "text": "..." }
//
// TCPA compliance requires honoring STOP (and similar) immediately,
// independent of whatever campaign the reply is about - so this is
// checked before anything else, and it writes straight to
// contacts.sms_opt_out rather than queuing for later review.
const STOP_KEYWORDS = ["stop", "stopall", "unsubscribe", "cancel", "end", "quit"];
const START_KEYWORDS = ["start", "yes", "unstop"];

export async function POST(req: Request) {
  const body = await req.json();
  const fromNumber: string = (body.from ?? "").replace(/\D/g, "");
  const toNumber: string = (body.to ?? "").replace(/\D/g, "");
  const text: string = (body.text ?? "").trim();
  const normalized = text.toLowerCase();

  const admin = createAdminClient();

  // Match by phone - not a perfect key (shared/reassigned numbers
  // exist) but it's what Skyetel gives us, same limitation any SMS
  // platform has.
  const { data: contact } = await admin
    .from("contacts")
    .select("id")
    .ilike("phone", `%${fromNumber.slice(-10)}`)
    .maybeSingle();

  let handledAs: "opt_out" | "opt_in" | "unhandled" = "unhandled";

  if (contact) {
    if (STOP_KEYWORDS.includes(normalized)) {
      await admin.from("contacts").update({ sms_opt_out: true }).eq("id", contact.id);
      handledAs = "opt_out";
    } else if (START_KEYWORDS.includes(normalized)) {
      await admin.from("contacts").update({ sms_opt_out: false }).eq("id", contact.id);
      handledAs = "opt_in";
    }
  }

  await admin.from("sms_inbound").insert({
    from_number: fromNumber,
    to_number: toNumber,
    body: text,
    contact_id: contact?.id ?? null,
    handled_as: handledAs,
  });

  return NextResponse.json({ ok: true });
}
