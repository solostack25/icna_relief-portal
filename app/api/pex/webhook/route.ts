import { NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { createAdminClient } from "@/lib/supabase/server";
import { getIntegrationSetting } from "@/lib/integrationSettings";
import { getPexConfig } from "@/lib/pex/client";
import { resuggestCard, syncTransactions } from "@/lib/pex/sync";

export const maxDuration = 60;

// PEX webhooks (Business Settings > Developer Tools in the PEX dashboard).
// Point every event you subscribe to at https://<portal>/api/pex/webhook.
//
// PEX authenticates with HTTP Basic: a shared secret (from PEX API
// Support) base64-encoded in the Authorization header. Saved as
// pex_webhook_secret / PEX_WEBHOOK_SECRET.
//
// Transaction events trigger a re-pull of that cardholder's last few
// days, so webhooks and the nightly sync share one ingest path and
// a settled transaction always replaces its pending hold.
// Card status events update the card directly.
// Every payload is logged to pex_webhook_events first.

function authorised(header: string | null, secret: string) {
  if (!header?.toLowerCase().startsWith("basic ")) return false;
  let decoded = "";
  try {
    decoded = Buffer.from(header.slice(6).trim(), "base64").toString("utf8");
  } catch {
    return false;
  }
  // Accept the bare secret, or user:secret.
  const candidates = [decoded, decoded.includes(":") ? decoded.slice(decoded.indexOf(":") + 1) : ""];
  return candidates.some((c) => c.length === secret.length && timingSafeEqual(Buffer.from(c), Buffer.from(secret)));
}

type Payload = { CallbackTime?: string; Data?: Record<string, unknown> };

export async function POST(req: Request) {
  const secret = await getIntegrationSetting("pex_webhook_secret", process.env.PEX_WEBHOOK_SECRET);
  if (!secret) return NextResponse.json({ error: "Webhook secret not configured" }, { status: 503 });
  if (!authorised(req.headers.get("authorization"), secret)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: Payload;
  try {
    body = (await req.json()) as Payload;
  } catch {
    return NextResponse.json({ error: "Bad JSON" }, { status: 400 });
  }
  const data = body?.Data ?? {};
  const type = String(data.TransactionType ?? "").toUpperCase();
  const kind = type === "NETWORK" ? "transaction" : type === "CARD" ? (data.CardOrderId || /ship/i.test(String(data.Description ?? "")) ? "card_shipment" : "card_status") : "unknown";
  const acctId = Number(data.AcctId) || null;

  const db = createAdminClient();
  const { data: ev } = await db
    .from("pex_webhook_events")
    .insert({ event_kind: kind, network_type: (data.NetworkType as string) ?? null, acct_id: acctId, payload: body })
    .select("id")
    .single();

  let error: string | null = null;
  try {
    if (kind === "transaction" && acctId) {
      const cfg = await getPexConfig();
      if (cfg) {
        const today = new Date();
        const from = new Date(today.getTime() - 5 * 864e5).toISOString().slice(0, 10);
        await syncTransactions(cfg, from, today.toISOString().slice(0, 10), acctId);
      }
    } else if ((kind === "card_status" || kind === "card_shipment") && acctId) {
      const cards = (data.CardList as { Last4CardNumber?: string; CardStatus?: string; IssueDate?: string }[] | undefined) ?? [];
      // Newest card on the account is the one in use.
      const current = [...cards].sort((a, b) => String(b.IssueDate ?? "").localeCompare(String(a.IssueDate ?? "")))[0];
      if (current) {
        const { data: card } = await db
          .from("pex_cards")
          .update({ card_status: current.CardStatus ?? null, last4: current.Last4CardNumber ?? undefined, updated_at: new Date().toISOString() })
          .eq("pex_account_id", acctId)
          .select("id")
          .maybeSingle();
        if (card) await resuggestCard(db, card.id);
      }
    }
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }
  if (ev) await db.from("pex_webhook_events").update({ processed_at: new Date().toISOString(), error }).eq("id", ev.id);
  // Always 200 once logged, so PEX doesn't retry a payload we already
  // have; the nightly sync covers anything that failed to process.
  return NextResponse.json({ ok: true });
}
