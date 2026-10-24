import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { getAmzbViewer } from "@/lib/amazonBusiness/access";
import { getAmzbConfig } from "@/lib/amazonBusiness/client";
import { runAmazonSync, attachToTicket, sendToFinance, ticketNumberFromPo, type AmzbPurchase } from "@/lib/amazonBusiness/sync";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

// GET ?view=needs_action|matched|finance|all|ignored
export async function GET(req: NextRequest) {
  const viewer = await getAmzbViewer();
  if (!viewer) return NextResponse.json({ error: "IT, Finance or admins only" }, { status: 403 });
  const admin = createAdminClient();
  const view = req.nextUrl.searchParams.get("view") ?? "needs_action";
  if (view === "none") {
    const [cfg, { data: runs }] = await Promise.all([getAmzbConfig(), admin.from("amzb_sync_runs").select("trigger, started_at, finished_at, ok, summary, error").order("started_at", { ascending: false }).limit(1)]);
    return NextResponse.json({ connected: !!cfg, runs: runs ?? [] });
  }

  let q = admin.from("amzb_purchases").select("*").order("transaction_date", { ascending: false, nullsFirst: false }).limit(300);
  if (view === "needs_action") q = q.eq("status", "new");
  else if (view === "matched") q = q.eq("status", "matched");
  else if (view === "finance") q = q.eq("status", "sent_to_finance");
  else if (view === "ignored") q = q.eq("status", "ignored");
  const { data: rows, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const purchases = (rows ?? []) as AmzbPurchase[];

  const reqIds = [...new Set(purchases.map((p) => p.matched_request_id).filter(Boolean))] as string[];
  const ftIds = [...new Set(purchases.map((p) => p.finance_ticket_id).filter(Boolean))] as string[];
  const [{ data: reqs }, { data: fts }, { data: runs }, counts, cfg] = await Promise.all([
    reqIds.length ? admin.from("helpdesk_requests").select("id, ticket_number, title").in("id", reqIds) : Promise.resolve({ data: [] }),
    ftIds.length ? admin.from("finance_tickets").select("id, ticket_number, status").in("id", ftIds) : Promise.resolve({ data: [] }),
    admin.from("amzb_sync_runs").select("trigger, started_at, finished_at, ok, summary, error").order("started_at", { ascending: false }).limit(5),
    Promise.all(
      (["new", "matched", "sent_to_finance", "ignored"] as const).map(async (s) => [s, (await admin.from("amzb_purchases").select("id", { count: "exact", head: true }).eq("status", s)).count ?? 0] as const)
    ),
    getAmzbConfig(),
  ]);
  const reqMap = new Map((reqs ?? []).map((r: any) => [r.id, r]));
  const ftMap = new Map((fts ?? []).map((t: any) => [t.id, t]));

  return NextResponse.json({
    connected: !!cfg,
    counts: Object.fromEntries(counts),
    runs: runs ?? [],
    purchases: purchases.map((p) => ({
      id: p.id,
      invoice_number: p.invoice_number,
      order_ids: p.order_ids,
      po_numbers: p.po_numbers,
      transaction_type: p.transaction_type,
      payment_type: p.payment_type,
      card_last4: p.card_last4,
      amount: p.amount != null ? Number(p.amount) : null,
      transaction_date: p.transaction_date,
      buyer_name: p.buyer_name,
      buyer_email: p.buyer_email,
      items: p.items ?? [],
      pdf_status: p.pdf_status,
      pdf_error: p.pdf_error,
      status: p.status,
      note: p.note,
      match_method: p.match_method,
      ticket: p.matched_request_id ? reqMap.get(p.matched_request_id) ?? null : null,
      attached: !!p.helpdesk_attachment_id,
      finance_ticket: p.finance_ticket_id ? ftMap.get(p.finance_ticket_id) ?? null : null,
      payment_status: p.payment_status,
      payment_due_date: p.payment_due_date,
    })),
  });
}

// POST { action, id?, ticket? }
//   sync            - run the sync now
//   link            - link a purchase to a Help Desk ticket number
//   unlink          - undo a link (only before the invoice is attached)
//   send_to_finance - create the Finance vendor-payment ticket
//   ignore / restore
//   retry_pdf       - ask Amazon for the PDF again
export async function POST(req: Request) {
  const viewer = await getAmzbViewer();
  if (!viewer) return NextResponse.json({ error: "IT, Finance or admins only" }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const admin = createAdminClient();
  const action = String(body.action ?? "");

  if (action === "sync") {
    const r = await runAmazonSync({ trigger: "manual", startedBy: viewer.employeeId, days: Number(body.days) || 10, budgetMs: 180_000 });
    return NextResponse.json(r, { status: r.ok ? 200 : 400 });
  }

  const id = String(body.id ?? "");
  const { data: row } = await admin.from("amzb_purchases").select("*").eq("id", id).maybeSingle();
  if (!row) return NextResponse.json({ error: "Purchase not found." }, { status: 404 });
  const p = row as AmzbPurchase;

  try {
    if (action === "link") {
      if (p.helpdesk_attachment_id) return NextResponse.json({ error: "This invoice is already attached to a ticket. Remove it there first." }, { status: 400 });
      const tn = ticketNumberFromPo(String(body.ticket ?? ""));
      if (!tn) return NextResponse.json({ error: "Enter a Help Desk ticket number, like HD-002703." }, { status: 400 });
      const { data: request } = await admin.from("helpdesk_requests").select("id").eq("ticket_number", tn).maybeSingle();
      if (!request) return NextResponse.json({ error: `No ticket ${tn}.` }, { status: 404 });
      const { data: legs } = await admin
        .from("helpdesk_request_legs")
        .select("id, category, hardware_gate")
        .eq("request_id", request.id)
        .eq("department", "it")
        .order("created_at", { ascending: false });
      const leg = (legs ?? []).find((l: any) => l.hardware_gate) ?? (legs ?? [])[0];
      if (!leg) return NextResponse.json({ error: `${tn} has no IT part to attach an invoice to.` }, { status: 400 });
      await admin
        .from("amzb_purchases")
        .update({ matched_request_id: request.id, matched_leg_id: leg.id, match_method: "manual", status: p.status === "sent_to_finance" ? p.status : "matched", handled_by: viewer.employeeId, note: null })
        .eq("id", p.id)
        .is("helpdesk_attachment_id", null);
      const att = await attachToTicket(admin, p);
      return NextResponse.json({ ok: true, attached: att.ok, note: att.ok ? `Linked to ${tn} and the invoice was attached.` : `Linked to ${tn}. ${att.reason ?? ""}` });
    }
    if (action === "unlink") {
      if (p.helpdesk_attachment_id) return NextResponse.json({ error: "The invoice is already on the ticket. Remove it there first." }, { status: 400 });
      await admin.from("amzb_purchases").update({ matched_request_id: null, matched_leg_id: null, match_method: null, status: p.finance_ticket_id ? "sent_to_finance" : "new" }).eq("id", p.id);
      return NextResponse.json({ ok: true });
    }
    if (action === "send_to_finance") {
      if (p.payment_type !== "pay_by_invoice" && body.confirm !== true) {
        return NextResponse.json({ error: "This wasn't Pay by Invoice, so Amazon has already been paid by card. Confirm if Finance still needs it." }, { status: 409 });
      }
      const r = await sendToFinance(admin, p, viewer.employeeId);
      return NextResponse.json(r.ok ? { ok: true, note: `Finance ticket ${r.ticketNumber} created.` } : { error: r.reason }, { status: r.ok ? 200 : 400 });
    }
    if (action === "ignore" || action === "restore") {
      if (action === "ignore" && p.finance_ticket_id) return NextResponse.json({ error: "Already sent to Finance." }, { status: 400 });
      await admin
        .from("amzb_purchases")
        .update({ status: action === "ignore" ? "ignored" : p.matched_leg_id ? "matched" : "new", note: action === "ignore" ? String(body.note ?? "").slice(0, 300) || "Marked as not needing action" : null, handled_by: viewer.employeeId })
        .eq("id", p.id);
      return NextResponse.json({ ok: true });
    }
    if (action === "retry_pdf") {
      await admin.from("amzb_purchases").update({ pdf_status: "pending", pdf_report_id: null, pdf_attempts: 0, pdf_error: null }).eq("id", p.id);
      return NextResponse.json({ ok: true, note: "Queued. It'll be fetched on the next sync (or press Sync now)." });
    }
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
