import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { createAdminClient } from "@/lib/supabase/server";
import { getIntegrationSetting } from "@/lib/integrationSettings";

export const runtime = "nodejs"; // needs Node's crypto module

// Receives donation.*, subscription.*, form.*, contact.* events from
// CharityStack. Verifies the HMAC-SHA256 signature per their spec, then
// deliberately extracts ONLY a whitelisted set of fields before touching
// the database or any log line — donor name/email/phone/address/payment
// method must never reach charitystack_donation_events or Vercel logs.
// See supabase/fundraisers_migration.sql for why: CharityStack stays the
// system of record for donor identity, this table only ever holds
// aggregate dollar/fund/status data.

function timingSafeEqualHex(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "hex");
  const bufB = Buffer.from(b, "hex");
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

async function verifySignature(rawBody: string, timestamp: string, signatureHeader: string): Promise<boolean> {
  const secret = await getIntegrationSetting("charitystack_webhook_secret");
  if (!secret) return false;

  const expected = crypto
    .createHmac("sha256", secret)
    .update(`${timestamp}.${rawBody}`)
    .digest("hex");

  const provided = signatureHeader.replace(/^sha256=/, "");
  return timingSafeEqualHex(expected, provided);
}

// Donation/subscription events don't share one exact payload shape across
// event types, so we defensively pull from a couple of plausible field
// names rather than assuming one schema — but the set of fields we'll
// ever accept is fixed and never grows to include identity data.
function extractWhitelistedFields(eventType: string, data: Record<string, any>) {
  const formId = data.formId ?? data.formID ?? data.form_id ?? null;
  const paymentId = data.paymentId ?? data.id ?? data.subscriptionId ?? null;
  const amount = typeof data.amount === "number" ? data.amount : data.amount ? Number(data.amount) : null;
  const fund = data.fund ?? (Array.isArray(data.funds) ? data.funds[0] : null) ?? null;
  const frequency = data.frequency ?? null;
  const status = data.status ?? null;
  const eventTimestamp = data.createdAt ?? data.timestamp ?? data.eventTimestamp ?? null;

  return {
    charitystack_form_id: formId,
    charitystack_payment_id: paymentId,
    event_type: eventType,
    amount,
    fund,
    frequency,
    status,
    event_timestamp: eventTimestamp ? new Date(eventTimestamp).toISOString() : null,
  };
}

const TRACKED_EVENTS = new Set([
  "donation.created",
  "donation.updated",
  "subscription.created",
  "subscription.updated",
  "subscription.cancelled",
]);

export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const signature = request.headers.get("x-webhook-signature");
  const timestamp = request.headers.get("x-webhook-timestamp");

  if (!signature || !timestamp) {
    return NextResponse.json({ error: "Missing signature headers" }, { status: 400 });
  }

  // Reject stale deliveries (replay protection) — 5 minute window.
  const age = Math.abs(Date.now() / 1000 - Number(timestamp));
  if (!Number.isFinite(age) || age > 300) {
    return NextResponse.json({ error: "Stale or invalid timestamp" }, { status: 400 });
  }

  const valid = await verifySignature(rawBody, timestamp, signature);
  if (!valid) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let payload: any;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const eventType: string = payload.event ?? payload.eventType ?? payload.type;
  const data: Record<string, any> = payload.data ?? payload.eventData ?? payload;

  // form.created / form.updated / contact.* are acknowledged but not
  // stored here — no dollar amount to aggregate, and contact.* would
  // only ever carry donor-identifiable fields we don't want to touch.
  if (!TRACKED_EVENTS.has(eventType)) {
    return NextResponse.json({ ok: true, skipped: true });
  }

  const fields = extractWhitelistedFields(eventType, data);

  const admin = createAdminClient();

  let fundraiserId: string | null = null;
  if (fields.charitystack_form_id) {
    const { data: fundraiser } = await admin
      .from("fundraisers")
      .select("id")
      .eq("charitystack_form_id", fields.charitystack_form_id)
      .maybeSingle();
    fundraiserId = fundraiser?.id ?? null;
  }

  const { error } = await admin.from("charitystack_donation_events").insert({
    fundraiser_id: fundraiserId,
    ...fields,
  });

  if (error) {
    // Never log rawBody/payload here — even on failure, that could
    // contain donor PII from CharityStack's side of the payload.
    console.error("charitystack webhook insert failed:", error.message);
    return NextResponse.json({ error: "Failed to record event" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
