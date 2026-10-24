import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { hardwareViewer } from "@/lib/helpdeskHardwareAccess";
import { attachToTicket, type AmzbPurchase } from "@/lib/amazonBusiness/sync";

// POST { legId, orderIds: string[] } - IT records which Amazon Business
// order(s) a hardware ticket was bought on. Anything already synced
// for those orders is linked (and its invoice attached) right away;
// later syncs pick up the rest.
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const legId = String(body.legId ?? "");
  const access = await hardwareViewer(legId);
  if ("error" in access) return NextResponse.json({ error: access.error }, { status: access.status });
  if (!access.viewer.isItManager) return NextResponse.json({ error: "Only the IT team can add order numbers." }, { status: 403 });

  const raw: string[] = Array.isArray(body.orderIds) ? body.orderIds : String(body.orderIds ?? "").split(/[\s,;]+/);
  const orderIds = [...new Set(raw.map((s) => String(s).trim()).filter(Boolean))];
  const bad = orderIds.find((o) => !/^\d{3}-\d{7}-\d{7}$/.test(o));
  if (bad) return NextResponse.json({ error: `"${bad}" doesn't look like an Amazon order number (it should be like 111-1234567-1234567).` }, { status: 400 });

  const admin = createAdminClient();
  const { data: detail } = await admin.from("helpdesk_leg_details_it").select("leg_id").eq("leg_id", legId).maybeSingle();
  const { error } = detail
    ? await admin.from("helpdesk_leg_details_it").update({ amazon_order_ids: orderIds }).eq("leg_id", legId)
    : await admin.from("helpdesk_leg_details_it").insert({ leg_id: legId, amazon_order_ids: orderIds });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let linked = 0;
  let attached = 0;
  if (orderIds.length) {
    const { data: rows } = await admin.from("amzb_purchases").select("*").overlaps("order_ids", orderIds).eq("transaction_type", "CHARGE").is("matched_leg_id", null);
    for (const p of (rows ?? []) as AmzbPurchase[]) {
      await admin
        .from("amzb_purchases")
        .update({ matched_leg_id: legId, matched_request_id: access.viewer.leg.request_id, match_method: "order_number", status: p.status === "sent_to_finance" ? p.status : "matched" })
        .eq("id", p.id);
      linked++;
      if ((await attachToTicket(admin, { ...p, matched_leg_id: legId, matched_request_id: access.viewer.leg.request_id })).ok) attached++;
    }
  }
  return NextResponse.json({ ok: true, orderIds, linked, attached });
}
