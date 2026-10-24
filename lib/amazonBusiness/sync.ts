// Amazon Business sync (server only). Nightly cron + "Sync now".
//
//   1. Pull recent transactions (Reconciliation API) and group them into
//      purchases: one per Amazon invoice, or per transaction when Amazon
//      hasn't issued an invoice number (card orders).
//   2. Match each purchase to a Help Desk hardware ticket: the PO number
//      typed at checkout is the ticket number (HD-002703), or IT added
//      the Amazon order number to the ticket.
//   3. Fetch each invoice PDF (Document API; the order summary when
//      there's no invoice number).
//   4. Matched + PDF ready: attach it to the ticket as the invoice (with
//      amount, vendor and how it was paid), which unlocks Close.
//   5. Pay by Invoice + matched to an approved hardware ticket: create a
//      Finance vendor-payment ticket, already approved, PDF attached.
//   6. Refresh Amazon's payment status on Pay by Invoice invoices.
// Every step is idempotent, so re-running (or overlapping) is safe.

import { randomUUID } from "crypto";
import { createAdminClient } from "@/lib/supabase/server";
import { RECEIPT_BUCKET } from "@/lib/financeReceipts";
import { startFinanceTicketApproval } from "@/lib/financeTickets";
import { logHardwareEvent, usd } from "@/lib/helpdeskHardware";
import { getIntegrationSetting } from "@/lib/integrationSettings";
import {
  getAmzbConfig,
  getTransactions,
  getInvoiceNumbers,
  getPaymentDetails,
  requestInvoicePdf,
  getReportStatus,
  downloadReportPdf,
  type AmzbConfig,
  type AmzbTransaction,
} from "./client";

export const AMZB_BUCKET = "amazon-business-invoices";
const INVOICE_BUCKET = "helpdesk-invoices";
const HARDWARE = "Hardware Request";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type Admin = ReturnType<typeof createAdminClient>;

export type AmzbPurchase = {
  id: string;
  purchase_key: string;
  invoice_number: string | null;
  transaction_ids: string[];
  order_ids: string[];
  po_numbers: string[];
  transaction_type: string | null;
  payment_type: "pay_by_invoice" | "card" | "other";
  payment_instrument: string | null;
  card_last4: string | null;
  amount: number | null;
  currency: string | null;
  transaction_date: string | null;
  buyer_name: string | null;
  buyer_email: string | null;
  items: { title: string; quantity: number; unit_price: number | null; total: number | null; asin: string | null; order_id: string | null; po: string | null; txn?: string }[];
  pdf_status: string;
  pdf_report_id: string | null;
  pdf_storage_path: string | null;
  pdf_error: string | null;
  pdf_attempts: number;
  matched_request_id: string | null;
  matched_leg_id: string | null;
  match_method: string | null;
  helpdesk_attachment_id: string | null;
  finance_ticket_id: string | null;
  payment_status: string | null;
  payment_due_date: string | null;
  status: string;
  note: string | null;
  finance_claimed_at?: string | null;
  raw: { transactions?: Record<string, number> } | null;
};

// Exact, case-insensitive email lookup (escape ilike's wildcards so
// j_doe@ can't match jXdoe@).
async function employeeIdByEmail(admin: Admin, email: string | null | undefined): Promise<string | null> {
  if (!email) return null;
  const pattern = email.trim().replace(/[\\%_]/g, (c) => `\\${c}`);
  const { data } = await admin.from("employees").select("id").ilike("email", pattern).limit(1);
  return (data?.[0] as { id: string } | undefined)?.id ?? null;
}

const num = (m?: { amount: string } | null) => (m?.amount != null && m.amount !== "" ? Number(m.amount) : null);
const r2 = (n: number) => Math.round(n * 100) / 100;

export function paymentTypeOf(instrument: string | null | undefined): AmzbPurchase["payment_type"] {
  const s = (instrument ?? "").toUpperCase();
  if (/INVOICE|PBI|PAY_BY|PAYBY/.test(s)) return "pay_by_invoice";
  if (/CARD|CREDIT|DEBIT|VISA|MASTER|AMEX|DISCOVER/.test(s)) return "card";
  return "other";
}

// PO number -> Help Desk ticket number. Accepts "HD-002703", "hd2703",
// "HD 2703" or "Ticket HD-2703"; anything else isn't ours.
export function ticketNumberFromPo(po: string | null | undefined): string | null {
  const m = String(po ?? "").match(/\bHD[\s-]*0*(\d{1,8})\b/i);
  return m ? `HD-${m[1].padStart(6, "0")}` : null;
}

// ---------- 1. transactions -> purchases ----------
async function upsertPurchases(admin: Admin, cfg: AmzbConfig, txns: AmzbTransaction[]) {
  // Card orders often have no invoice number on the transaction; ask for
  // it by line item so each shipment's invoice can still be fetched.
  const needInvoice = txns
    .filter((t) => !t.invoiceNumber && t.transactionType === "CHARGE")
    .flatMap((t) => (t.transactionLineItems ?? []).filter((l) => l.orderId && l.orderLineItemId && l.shipmentId))
    .map((l) => ({ orderId: l.orderId!, orderLineItemId: l.orderLineItemId!, shipmentId: l.shipmentId! }));
  let lookup = new Map<string, string>();
  if (needInvoice.length) lookup = await getInvoiceNumbers(cfg, needInvoice).catch(() => new Map());

  type Draft = Omit<AmzbPurchase, "id" | "pdf_status" | "pdf_report_id" | "pdf_storage_path" | "pdf_error" | "pdf_attempts" | "matched_request_id" | "matched_leg_id" | "match_method" | "helpdesk_attachment_id" | "finance_ticket_id" | "payment_status" | "payment_due_date" | "status" | "note" | "finance_claimed_at">;
  const drafts = new Map<string, Draft>();
  for (const t of txns) {
    if (!t.transactionId) continue;
    const lines = t.transactionLineItems ?? [];
    const invoice =
      t.invoiceNumber ||
      lines.map((l) => (l.orderId && l.orderLineItemId && l.shipmentId ? lookup.get(`${l.orderId}|${l.orderLineItemId}|${l.shipmentId}`) : undefined)).find(Boolean) ||
      null;
    const refund = t.transactionType && t.transactionType !== "CHARGE";
    // Refunds stay separate from the invoice they credit.
    const key = !refund && invoice ? `inv:${invoice}` : `txn:${t.transactionId}`;
    const d: Draft = drafts.get(key) ?? {
      purchase_key: key,
      invoice_number: invoice,
      transaction_ids: [],
      order_ids: [],
      po_numbers: [],
      transaction_type: t.transactionType ?? null,
      payment_type: paymentTypeOf(t.paymentInstrumentType),
      payment_instrument: t.paymentInstrumentType ?? null,
      card_last4: t.paymentInstrumentLast4Digits ?? null,
      amount: null,
      currency: t.amount?.currencyCode ?? null,
      transaction_date: t.transactionDate ?? t.feedDate ?? null,
      buyer_name: t.buyer?.name ?? null,
      buyer_email: t.buyer?.email ?? null,
      items: [],
      raw: { transactions: {} },
    };
    if (!d.transaction_ids.includes(t.transactionId)) {
      d.transaction_ids.push(t.transactionId);
      d.raw!.transactions![t.transactionId] = num(t.amount) ?? 0;
      for (const l of lines) {
        if (l.orderId && !d.order_ids.includes(l.orderId)) d.order_ids.push(l.orderId);
        if (l.purchaseOrderNumber && !d.po_numbers.includes(l.purchaseOrderNumber)) d.po_numbers.push(l.purchaseOrderNumber);
        d.items.push({
          title: l.productTitle ?? "Item",
          quantity: l.itemQuantity ?? 1,
          unit_price: num(l.unitPrice),
          total: num(l.totalAmount),
          asin: l.asin ?? null,
          order_id: l.orderId ?? null,
          po: l.purchaseOrderNumber ?? null,
          txn: t.transactionId,
        });
      }
    }
    drafts.set(key, d);
  }
  if (!drafts.size) return { created: 0, updated: 0 };

  let created = 0;
  let updated = 0;
  for (const d of drafts.values()) {
    // Which purchase already owns these transactions? A transaction can
    // first arrive without its invoice number and later with it, so the
    // key alone isn't enough to recognise it (amzb_purchase_transactions
    // is the hard guarantee: one transaction, one purchase).
    const { data: owned } = await admin.from("amzb_purchase_transactions").select("transaction_id, purchase_id").in("transaction_id", d.transaction_ids);
    const ownedIds = new Set((owned ?? []).map((o: { transaction_id: string }) => o.transaction_id));
    let target: AmzbPurchase | null = null;
    if (owned?.length) {
      const { data } = await admin.from("amzb_purchases").select("*").eq("id", (owned[0] as { purchase_id: string }).purchase_id).maybeSingle();
      target = (data as AmzbPurchase) ?? null;
    }
    if (!target) {
      const { data } = await admin.from("amzb_purchases").select("*").eq("purchase_key", d.purchase_key).maybeSingle();
      target = (data as AmzbPurchase) ?? null;
    }

    const fresh = d.transaction_ids.filter((id) => !ownedIds.has(id) && !(target?.transaction_ids ?? []).includes(id));

    if (!target) {
      d.amount = r2(Object.values(d.raw!.transactions!).reduce((s, n) => s + n, 0));
      const charge = d.transaction_type === "CHARGE";
      const { data: ins, error } = await admin
        .from("amzb_purchases")
        .insert({ ...d, status: charge ? "new" : "ignored", note: charge ? null : "Refund / credit" })
        .select("id")
        .single();
      if (error || !ins) continue; // key taken by a concurrent run; the next sync merges it
      const { error: ownErr } = await admin.from("amzb_purchase_transactions").insert(d.transaction_ids.map((transaction_id) => ({ transaction_id, purchase_id: ins.id })));
      if (ownErr) {
        // Another run claimed these transactions first - drop ours.
        await admin.from("amzb_purchases").delete().eq("id", ins.id);
        continue;
      }
      created++;
      continue;
    }

    // Known purchase: pick up a newly issued invoice number and any
    // transactions (e.g. a second shipment) we hadn't seen.
    const patch: Record<string, unknown> = {};
    if (!target.invoice_number && d.invoice_number) patch.invoice_number = d.invoice_number;
    if (fresh.length) {
      const { error: ownErr } = await admin.from("amzb_purchase_transactions").insert(fresh.map((transaction_id) => ({ transaction_id, purchase_id: target!.id })));
      if (!ownErr) {
        const txMap = { ...(target.raw?.transactions ?? {}) };
        for (const id of fresh) txMap[id] = d.raw!.transactions![id] ?? 0;
        const amount = r2(Object.values(txMap).reduce((s, n) => s + n, 0));
        patch.transaction_ids = [...target.transaction_ids, ...fresh];
        patch.order_ids = [...new Set([...target.order_ids, ...d.order_ids])];
        patch.po_numbers = [...new Set([...target.po_numbers, ...d.po_numbers])];
        patch.items = [...(target.items ?? []), ...d.items.filter((it) => it.txn && fresh.includes(it.txn))];
        patch.amount = amount;
        patch.raw = { ...(target.raw ?? {}), transactions: txMap };
        if (amount !== Number(target.amount) && (target.helpdesk_attachment_id || target.finance_ticket_id)) {
          patch.note = `Amazon added another charge: the total changed from ${usd(target.amount)} to ${usd(amount)} after it was ${
            target.finance_ticket_id ? "sent to Finance" : "attached to the ticket"
          }. Check the ${target.finance_ticket_id ? "Finance ticket" : "ticket's invoice"} amount.`;
        }
      }
    }
    if (Object.keys(patch).length) {
      patch.updated_at = new Date().toISOString();
      await admin.from("amzb_purchases").update(patch).eq("id", target.id);
      updated++;
    }
  }
  return { created, updated };
}

// ---------- 2. matching ----------
async function hardwareLegFor(admin: Admin, requestId: string) {
  const { data: legs } = await admin
    .from("helpdesk_request_legs")
    .select("id, request_id, department, category, status, hardware_gate, hardware_approval_status, created_at")
    .eq("request_id", requestId)
    .eq("department", "it")
    .order("created_at", { ascending: false });
  const rows = (legs ?? []) as { id: string; category: string | null; hardware_gate: boolean }[];
  return rows.find((l) => l.hardware_gate) ?? rows.find((l) => l.category === HARDWARE) ?? rows[0] ?? null;
}

async function matchPurchases(admin: Admin) {
  const { data } = await admin.from("amzb_purchases").select("*").eq("status", "new").is("matched_leg_id", null).eq("transaction_type", "CHARGE").limit(500);
  let matched = 0;
  for (const p of (data ?? []) as AmzbPurchase[]) {
    let legId: string | null = null;
    let requestId: string | null = null;
    let method: "po_number" | "order_number" | null = null;

    for (const po of p.po_numbers) {
      const tn = ticketNumberFromPo(po);
      if (!tn) continue;
      const { data: req } = await admin.from("helpdesk_requests").select("id").eq("ticket_number", tn).maybeSingle();
      if (!req) continue;
      const leg = await hardwareLegFor(admin, req.id);
      if (leg) {
        legId = (leg as { id: string }).id;
        requestId = req.id;
        method = "po_number";
        break;
      }
    }
    if (!legId && p.order_ids.length) {
      const { data: det } = await admin.from("helpdesk_leg_details_it").select("leg_id").overlaps("amazon_order_ids", p.order_ids).limit(1).maybeSingle();
      if (det) {
        const { data: leg } = await admin.from("helpdesk_request_legs").select("id, request_id").eq("id", det.leg_id).maybeSingle();
        if (leg) {
          legId = leg.id;
          requestId = leg.request_id;
          method = "order_number";
        }
      }
    }
    if (legId && requestId && method) {
      await admin
        .from("amzb_purchases")
        .update({ matched_leg_id: legId, matched_request_id: requestId, match_method: method, status: "matched", updated_at: new Date().toISOString() })
        .eq("id", p.id)
        .is("matched_leg_id", null);
      matched++;
    }
  }
  return matched;
}

// ---------- 3. PDFs ----------
async function fetchPdfs(admin: Admin, cfg: AmzbConfig, deadline: number) {
  const { data } = await admin
    .from("amzb_purchases")
    .select("*")
    .in("pdf_status", ["pending", "requested"])
    .eq("transaction_type", "CHARGE")
    .lt("pdf_attempts", 6)
    .order("transaction_date", { ascending: false })
    .limit(60);
  const rows = (data ?? []) as AmzbPurchase[];
  let ready = 0;
  let failed = 0;

  // Ask for every report up front, then poll them together.
  for (const p of rows) {
    if (Date.now() > deadline) break;
    if (p.pdf_status === "requested" && p.pdf_report_id) continue;
    const docRef = p.invoice_number ? { invoiceId: p.invoice_number } : p.order_ids[0] ? { orderId: p.order_ids[0] } : null;
    if (!docRef) {
      await admin.from("amzb_purchases").update({ pdf_status: "unavailable", pdf_error: "No invoice or order number from Amazon." }).eq("id", p.id);
      continue;
    }
    try {
      const reportId = await requestInvoicePdf(cfg, docRef);
      p.pdf_report_id = reportId;
      p.pdf_status = "requested";
      await admin.from("amzb_purchases").update({ pdf_status: "requested", pdf_report_id: reportId, pdf_attempts: p.pdf_attempts + 1, pdf_error: null }).eq("id", p.id);
    } catch (e) {
      failed++;
      await admin
        .from("amzb_purchases")
        .update({ pdf_status: p.pdf_attempts + 1 >= 6 ? "failed" : "pending", pdf_error: e instanceof Error ? e.message : String(e), pdf_attempts: p.pdf_attempts + 1 })
        .eq("id", p.id);
    }
    await sleep(550);
  }

  let waiting = rows.filter((p) => p.pdf_status === "requested" && p.pdf_report_id);
  while (waiting.length && Date.now() < deadline) {
    const still: AmzbPurchase[] = [];
    for (const p of waiting) {
      if (Date.now() > deadline) {
        still.push(p);
        continue;
      }
      try {
        const st = await getReportStatus(cfg, p.pdf_report_id!);
        if (st.status === "DONE" && st.documentId) {
          const pdf = await downloadReportPdf(cfg, st.documentId);
          const path = `${p.id}.pdf`;
          const up = await admin.storage.from(AMZB_BUCKET).upload(path, pdf, { contentType: "application/pdf", upsert: true });
          if (up.error) throw new Error(up.error.message);
          await admin.from("amzb_purchases").update({ pdf_status: "ready", pdf_storage_path: path, pdf_error: null, updated_at: new Date().toISOString() }).eq("id", p.id);
          ready++;
        } else if (st.status === "CANCELLED" || st.status === "FATAL") {
          // Amazon only serves invoices from the last 30 days.
          const old = p.transaction_date && Date.now() - new Date(p.transaction_date).getTime() > 29 * 86400000;
          await admin
            .from("amzb_purchases")
            .update({
              pdf_status: old || p.pdf_attempts >= 5 ? "unavailable" : "pending",
              pdf_report_id: null,
              pdf_error: `Amazon couldn't produce the PDF (${st.status}).${old ? " It's older than 30 days, so download it from Amazon Business and upload it to the ticket." : ""}`,
            })
            .eq("id", p.id);
          failed++;
        } else still.push(p);
      } catch (e) {
        await admin.from("amzb_purchases").update({ pdf_status: "pending", pdf_report_id: null, pdf_error: e instanceof Error ? e.message : String(e) }).eq("id", p.id);
        failed++;
      }
      await sleep(550);
    }
    waiting = still;
    // Amazon suggests polling about every 15 seconds.
    if (waiting.length && Date.now() + 15000 < deadline) await sleep(15000);
    else break;
  }
  return { ready, failed, stillProcessing: waiting.length };
}

// ---------- 4. attach to the ticket ----------
const PAYMENT_FOR_TICKET: Record<AmzbPurchase["payment_type"], string> = { pay_by_invoice: "pay_by_invoice", card: "corporate_card", other: "other" };

export async function attachToTicket(admin: Admin, stale: AmzbPurchase): Promise<{ ok: boolean; reason?: string }> {
  // Always work from the current row, not whatever the caller loaded earlier.
  const { data: freshRow } = await admin.from("amzb_purchases").select("*").eq("id", stale.id).maybeSingle();
  const p = (freshRow as AmzbPurchase) ?? stale;
  if (!p.matched_leg_id || p.helpdesk_attachment_id) return { ok: false, reason: "Not matched or already attached." };
  if (p.pdf_status !== "ready" || !p.pdf_storage_path) return { ok: false, reason: "Waiting on the PDF from Amazon." };
  const { data: leg } = await admin.from("helpdesk_request_legs").select("id, request_id, status, hardware_gate, hardware_approval_status").eq("id", p.matched_leg_id).maybeSingle();
  if (!leg) return { ok: false, reason: "The ticket no longer exists." };
  if (leg.hardware_approval_status === "denied") return { ok: false, reason: "The ticket's purchase was denied." };
  if (leg.hardware_gate && leg.hardware_approval_status === "pending") return { ok: false, reason: "Waiting on the ticket's purchase approval." };

  // Don't double-count against something IT already uploaded by hand.
  const { data: existing } = await admin.from("helpdesk_attachments").select("id, source").eq("leg_id", leg.id).eq("kind", "invoice");
  if ((existing ?? []).some((a: { source: string }) => a.source !== "amazon_business")) {
    await admin.from("amzb_purchases").update({ note: "The ticket already has an invoice uploaded by hand, so this one wasn't attached again." }).eq("id", p.id);
    return { ok: false, reason: "Ticket already has a hand-uploaded invoice." };
  }
  if (leg.status === "closed" || leg.status === "handed_off") {
    await admin.from("amzb_purchases").update({ note: "The ticket was already closed when this invoice arrived." }).eq("id", p.id);
    return { ok: false, reason: "Ticket already closed." };
  }

  const file = await admin.storage.from(AMZB_BUCKET).download(p.pdf_storage_path);
  if (!file.data) return { ok: false, reason: "Couldn't read the stored PDF." };
  const buf = Buffer.from(await file.data.arrayBuffer());
  const path = `${leg.id}/${randomUUID()}.pdf`;
  const up = await admin.storage.from(INVOICE_BUCKET).upload(path, buf, { contentType: "application/pdf", upsert: false });
  if (up.error) return { ok: false, reason: up.error.message };

  const label = p.invoice_number ? `invoice ${p.invoice_number}` : `order ${p.order_ids[0] ?? ""}`.trim();
  const { data: att, error } = await admin
    .from("helpdesk_attachments")
    .insert({
      request_id: leg.request_id,
      leg_id: leg.id,
      uploaded_by_employee_id: null,
      file_name: `Amazon Business ${label}.pdf`,
      storage_path: path,
      kind: "invoice",
      source: "amazon_business",
      content_type: "application/pdf",
      size_bytes: buf.length,
      amount: p.amount && p.amount > 0 ? p.amount : null,
      vendor: "Amazon Business",
      payment_method: PAYMENT_FOR_TICKET[p.payment_type],
      amzb_purchase_id: p.id,
    })
    .select("id")
    .single();
  if (error || !att) {
    await admin.storage.from(INVOICE_BUCKET).remove([path]);
    // Unique per purchase: another run attached it a moment ago.
    if (error?.code === "23505") {
      const { data: other } = await admin.from("helpdesk_attachments").select("id").eq("amzb_purchase_id", p.id).maybeSingle();
      if (other) await admin.from("amzb_purchases").update({ helpdesk_attachment_id: other.id }).eq("id", p.id);
      return { ok: false, reason: "Already attached." };
    }
    return { ok: false, reason: error?.message ?? "Couldn't attach." };
  }
  await admin.from("amzb_purchases").update({ helpdesk_attachment_id: att.id, note: null, updated_at: new Date().toISOString() }).eq("id", p.id);
  if (leg.hardware_gate) {
    await logHardwareEvent(
      leg.id,
      "invoice",
      `Amazon Business ${label} (${usd(p.amount)}${p.payment_type === "pay_by_invoice" ? ", Pay by Invoice" : p.card_last4 ? `, card ending ${p.card_last4}` : ""}) attached automatically.`
    );
  }
  return { ok: true };
}

// ---------- 5. Finance ----------
export async function sendToFinance(admin: Admin, p: AmzbPurchase, actorId: string | null): Promise<{ ok: boolean; ticketNumber?: string; reason?: string }> {
  if (p.finance_ticket_id) return { ok: false, reason: "Already sent to Finance." };
  if (!(Number(p.amount) > 0)) return { ok: false, reason: "No amount to pay." };

  // Claim it so two runs can't both create a ticket. The claim expires
  // after 10 minutes, so a run that dies half way doesn't strand it.
  const staleBefore = new Date(Date.now() - 10 * 60000).toISOString();
  const { data: claimed } = await admin
    .from("amzb_purchases")
    .update({ finance_claimed_at: new Date().toISOString(), handled_by: actorId })
    .eq("id", p.id)
    .is("finance_ticket_id", null)
    .or(`finance_claimed_at.is.null,finance_claimed_at.lt.${staleBefore}`)
    .select("id")
    .maybeSingle();
  if (!claimed) return { ok: false, reason: "Already being sent to Finance. Try again in a few minutes." };
  const revert = async () => admin.from("amzb_purchases").update({ finance_claimed_at: null }).eq("id", p.id);

  try {
    // Who the ticket is under: the Amazon buyer, else the hardware
    // ticket's requester, else whoever clicked.
    let requestorId: string | null = await employeeIdByEmail(admin, p.buyer_email);
    let hw: { leg: any; request: any; detail: any; approvals: { approver_name: string; roles: string[] }[] } | null = null;
    if (p.matched_leg_id) {
      const [{ data: leg }, { data: request }, { data: detail }, { data: approvals }] = await Promise.all([
        admin.from("helpdesk_request_legs").select("*").eq("id", p.matched_leg_id).maybeSingle(),
        admin.from("helpdesk_requests").select("id, ticket_number, title, submitted_by_email").eq("id", p.matched_request_id).maybeSingle(),
        admin.from("helpdesk_leg_details_it").select("*").eq("leg_id", p.matched_leg_id).maybeSingle(),
        admin.from("helpdesk_hardware_approvals").select("approver_name, roles").eq("leg_id", p.matched_leg_id).eq("decision", "approved").order("decided_at"),
      ]);
      hw = { leg, request, detail, approvals: (approvals ?? []) as { approver_name: string; roles: string[] }[] };
      if (!requestorId) requestorId = await employeeIdByEmail(admin, request?.submitted_by_email);
    }
    requestorId = requestorId ?? actorId;
    if (!requestorId) {
      await revert();
      return { ok: false, reason: "Couldn't tell who placed the order. Use Send to Finance on the Amazon Business page." };
    }

    const preApproved = !!hw?.leg?.hardware_gate && hw.leg.hardware_approval_status === "approved";
    const label = p.invoice_number ? `invoice ${p.invoice_number}` : `order ${p.order_ids[0] ?? ""}`;
    const itemsText = p.items.map((i) => `${i.quantity}× ${i.title}`).join("; ");
    const approvalText = preApproved
      ? `Approved through IT hardware ticket ${hw!.request?.ticket_number}: ${hw!.approvals.map((a) => `${a.approver_name} (${a.roles.join("+")})`).join(", ")}. Approved budget ${usd(hw!.leg.hardware_approved_amount)}.`
      : "";
    const site = (process.env.NEXT_PUBLIC_SITE_URL ?? "").replace(/\/$/, "");
    const notes = [
      `Amazon Business Pay by Invoice ${label}.`,
      p.order_ids.length ? `Order${p.order_ids.length > 1 ? "s" : ""}: ${p.order_ids.join(", ")}.` : "",
      p.buyer_name || p.buyer_email ? `Placed by ${p.buyer_name ?? p.buyer_email}.` : "",
      itemsText ? `Items: ${itemsText}.` : "",
      approvalText,
    ]
      .filter(Boolean)
      .join(" ")
      .slice(0, 2000);

    const { data: vendor, error: vErr } = await admin
      .from("finance_vendors")
      .insert({
        requestor_id: requestorId,
        vendor_name: "Amazon Business",
        vendor_type: "other",
        billing_office_id: hw?.detail?.office_id ?? null,
        expense_date: (p.transaction_date ?? new Date().toISOString()).slice(0, 10),
        grant_eligible: !!hw?.detail?.is_grant_purchase,
        total_amount: p.amount,
        invoice_url: `${site}/api/admin/amazon-business/invoice/${p.id}`,
        notes,
      })
      .select("id")
      .single();
    if (vErr || !vendor) throw new Error(vErr?.message ?? "Couldn't create the vendor payment detail.");

    const title = `Amazon Business ${label}${hw?.request?.ticket_number ? ` — ${hw.request.ticket_number}` : ""}${p.items[0] ? ` — ${p.items[0].title}` : ""}`.slice(0, 200);
    const { data: ticket, error: tErr } = await admin
      .from("finance_tickets")
      .insert({
        title,
        category: "vendor_payment",
        detail: { source: "amazon_business", amzb_purchase_id: p.id, invoice_number: p.invoice_number, order_ids: p.order_ids, helpdesk_ticket: hw?.request?.ticket_number ?? null },
        requestor_id: requestorId,
        billing_office_id: hw?.detail?.office_id ?? null,
        grant_eligible: !!hw?.detail?.is_grant_purchase,
        total: p.amount,
        priority: "normal",
        submitted_at: new Date().toISOString(),
        vendor_id: vendor.id,
      })
      .select("id, ticket_number")
      .single();
    if (tErr || !ticket) {
      await admin.from("finance_vendors").delete().eq("id", vendor.id);
      // Unique per purchase: it already has a Finance ticket - link that one.
      if (tErr?.code === "23505") {
        const { data: existingTicket } = await admin.from("finance_tickets").select("id, ticket_number").eq("detail->>amzb_purchase_id", p.id).maybeSingle();
        if (existingTicket) {
          await admin.from("amzb_purchases").update({ finance_ticket_id: existingTicket.id, status: "sent_to_finance", finance_claimed_at: null }).eq("id", p.id);
          return { ok: true, ticketNumber: existingTicket.ticket_number };
        }
      }
      throw new Error(tErr?.message ?? "Couldn't create the finance ticket.");
    }
    const { error: linkErr } = await admin
      .from("amzb_purchases")
      .update({ finance_ticket_id: ticket.id, status: "sent_to_finance", finance_claimed_at: null, updated_at: new Date().toISOString() })
      .eq("id", p.id);
    if (linkErr) {
      // Don't retry: the unique index would stop a duplicate anyway, but say so.
      await admin.from("finance_ticket_log").insert({
        finance_ticket_id: ticket.id,
        comment: `Created from Amazon Business, but couldn't be linked back to the Amazon purchase (${linkErr.message}).`,
        comment_type: "comment",
        notify_user: false,
      });
    }

    // The PDF rides along as the ticket's receipt.
    if (p.pdf_storage_path) {
      const f = await admin.storage.from(AMZB_BUCKET).download(p.pdf_storage_path);
      if (f.data) {
        const path = `${ticket.id}/${randomUUID()}.pdf`;
        const up = await admin.storage.from(RECEIPT_BUCKET).upload(path, Buffer.from(await f.data.arrayBuffer()), { contentType: "application/pdf", upsert: false });
        if (!up.error) await admin.from("finance_ticket_receipts").insert({ finance_ticket_id: ticket.id, uploaded_by: actorId, storage_path: path, content_type: "application/pdf" });
      }
    }

    if (preApproved) {
      await admin.from("finance_tickets").update({ status: "open" }).eq("id", ticket.id);
      await admin.from("finance_ticket_log").insert({
        finance_ticket_id: ticket.id,
        comment: `Created automatically from Amazon Business. ${approvalText} Ready to pay.`,
        comment_type: "approval",
        notify_user: false,
      });
      await logHardwareEvent(p.matched_leg_id!, "finance", `Finance ticket ${ticket.ticket_number} created to pay Amazon ${label} (${usd(p.amount)}). Already approved through this ticket.`);
    } else {
      await admin.from("finance_ticket_log").insert({
        finance_ticket_id: ticket.id,
        comment: `Created from Amazon Business ${label}. Routed through the normal finance approval chain.`,
        comment_type: "comment",
        notify_user: false,
      });
      await startFinanceTicketApproval(ticket.id).catch(async (e) => {
        await admin.from("finance_ticket_log").insert({ finance_ticket_id: ticket.id, comment: `Approval routing failed: ${e instanceof Error ? e.message : e}`, comment_type: "comment", notify_user: false });
      });
    }
    return { ok: true, ticketNumber: ticket.ticket_number };
  } catch (e) {
    await revert();
    return { ok: false, reason: e instanceof Error ? e.message : String(e) };
  }
}

// ---------- 6. payment status ----------
async function refreshPaymentStatus(admin: Admin, cfg: AmzbConfig) {
  const { data } = await admin
    .from("amzb_purchases")
    .select("id, invoice_number, payment_status, finance_ticket_id")
    .eq("payment_type", "pay_by_invoice")
    .not("invoice_number", "is", null)
    .or("payment_status.is.null,payment_status.neq.Closed")
    .limit(300);
  const rows = (data ?? []) as { id: string; invoice_number: string; payment_status: string | null; finance_ticket_id: string | null }[];
  if (!rows.length) return 0;
  const details = await getPaymentDetails(cfg, rows.map((r) => r.invoice_number));
  let changed = 0;
  for (const r of rows) {
    const d = details.get(r.invoice_number);
    if (!d) continue;
    await admin.from("amzb_purchases").update({ payment_status: d.status, payment_due_date: d.dueDate, payment_checked_at: new Date().toISOString() }).eq("id", r.id);
    if (d.status !== r.payment_status) {
      changed++;
      if (d.status === "Closed" && r.finance_ticket_id) {
        await admin.from("finance_ticket_log").insert({
          finance_ticket_id: r.finance_ticket_id,
          comment: `Amazon Business shows invoice ${r.invoice_number} as paid (Closed).`,
          comment_type: "status_change",
          notify_user: false,
        });
      }
    }
  }
  return changed;
}

// ---------- the run ----------
export async function runAmazonSync(opts: { trigger: "cron" | "manual"; startedBy?: string | null; days?: number; budgetMs?: number }) {
  const admin = createAdminClient();
  const cfg = await getAmzbConfig();
  if (!cfg) return { ok: false as const, error: "Amazon Business isn't connected. Add the credentials on Admin → Connectors." };

  const started = Date.now();
  const deadline = started + (opts.budgetMs ?? 240_000);
  const { data: run } = await admin.from("amzb_sync_runs").insert({ trigger: opts.trigger, started_by: opts.startedBy ?? null }).select("id").single();
  const summary: Record<string, unknown> = {};
  try {
    const days = Math.min(Math.max(opts.days ?? 10, 1), 30);
    const end = new Date();
    const txns = await getTransactions(cfg, new Date(end.getTime() - days * 86400000), end);
    summary.transactions = txns.length;
    Object.assign(summary, await upsertPurchases(admin, cfg, txns));
    summary.matched = await matchPurchases(admin);
    summary.pdfs = await fetchPdfs(admin, cfg, deadline);

    // Attach + Finance for everything matched that's ready.
    // Only rows that still need something (attaching, or a Finance ticket).
    const { data: ready } = await admin
      .from("amzb_purchases")
      .select("*")
      .eq("status", "matched")
      .or("helpdesk_attachment_id.is.null,and(payment_type.eq.pay_by_invoice,finance_ticket_id.is.null)")
      .order("transaction_date", { ascending: false })
      .limit(200);
    let attached = 0;
    let financed = 0;
    const autoUnmatched = (await getIntegrationSetting("amazon_business_auto_finance_unmatched", "")) === "true";
    // Leave time for these steps (and to finish the run record) inside the
    // function's limit; anything left is picked up next sync.
    const stepDeadline = started + (opts.budgetMs ?? 240_000) + 40_000;
    for (const p of (ready ?? []) as AmzbPurchase[]) {
      if (Date.now() > stepDeadline) break;
      if (!p.helpdesk_attachment_id && (await attachToTicket(admin, p)).ok) attached++;
      if (p.payment_type === "pay_by_invoice" && !p.finance_ticket_id && p.pdf_status === "ready") {
        const { data: leg } = await admin.from("helpdesk_request_legs").select("hardware_gate, hardware_approval_status").eq("id", p.matched_leg_id).maybeSingle();
        // Only approved hardware purchases skip the finance chain; wait otherwise.
        if (leg?.hardware_gate && leg.hardware_approval_status === "approved" && (await sendToFinance(admin, p, null)).ok) financed++;
      }
    }
    // Optional: unmatched Pay by Invoice purchases go to Finance on their own.
    if (autoUnmatched) {
      const { data: loose } = await admin.from("amzb_purchases").select("*").eq("status", "new").eq("payment_type", "pay_by_invoice").eq("pdf_status", "ready").limit(100);
      for (const p of (loose ?? []) as AmzbPurchase[]) {
        if (Date.now() > stepDeadline) break;
        if ((await sendToFinance(admin, p, null)).ok) financed++;
      }
    }
    summary.attached = attached;
    summary.sent_to_finance = financed;
    summary.payment_status_changes = Date.now() < stepDeadline ? await refreshPaymentStatus(admin, cfg).catch((e) => `failed: ${e instanceof Error ? e.message : e}`) : "skipped (out of time)";

    if (run) await admin.from("amzb_sync_runs").update({ finished_at: new Date().toISOString(), ok: true, summary }).eq("id", run.id);
    return { ok: true as const, summary };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (run) await admin.from("amzb_sync_runs").update({ finished_at: new Date().toISOString(), ok: false, summary, error: msg }).eq("id", run.id);
    return { ok: false as const, error: msg, summary };
  }
}
