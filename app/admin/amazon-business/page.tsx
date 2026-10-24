"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card, Eyebrow, PageTitle, PillButton, inputStyle, dim, faint, ink, emerald, gold, rose } from "@/components/speaker/ui";

type Purchase = {
  id: string;
  invoice_number: string | null;
  order_ids: string[];
  po_numbers: string[];
  transaction_type: string | null;
  payment_type: "pay_by_invoice" | "card" | "other";
  card_last4: string | null;
  amount: number | null;
  transaction_date: string | null;
  buyer_name: string | null;
  buyer_email: string | null;
  items: { title: string; quantity: number; unit_price: number | null; total: number | null }[];
  pdf_status: string;
  pdf_error: string | null;
  status: "new" | "matched" | "sent_to_finance" | "ignored";
  note: string | null;
  match_method: string | null;
  ticket: { id: string; ticket_number: string; title: string } | null;
  attached: boolean;
  finance_ticket: { id: string; ticket_number: string; status: string } | null;
  payment_status: string | null;
  payment_due_date: string | null;
};
type Run = { trigger: string; started_at: string; finished_at: string | null; ok: boolean | null; summary: Record<string, unknown> | null; error: string | null };
type Data = { connected: boolean; counts: Record<string, number>; runs: Run[]; purchases: Purchase[] };

const TABS: { key: string; label: string; count?: string }[] = [
  { key: "needs_action", label: "Needs action", count: "new" },
  { key: "matched", label: "Matched to tickets", count: "matched" },
  { key: "finance", label: "Sent to Finance", count: "sent_to_finance" },
  { key: "ignored", label: "Ignored", count: "ignored" },
  { key: "all", label: "All" },
];
const usd = (n: number | null | undefined) => (n == null ? "—" : n.toLocaleString("en-US", { style: "currency", currency: "USD" }));
const day = (d: string | null) => (d ? new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—");
const PAY_COLORS: Record<string, string> = { Closed: emerald, "Past Due": rose, Issued: gold, "Payment Processing": "#4A7BB7" };
const MATCH_LABEL: Record<string, string> = { po_number: "by PO number", order_number: "by order number", manual: "linked by hand" };

function Pill({ text, color }: { text: string; color: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] font-bold rounded-full px-2.5 py-1 whitespace-nowrap" style={{ color, background: `${color}14`, border: `1px solid ${color}33` }}>
      {text}
    </span>
  );
}

export default function AmazonBusinessPage() {
  const [view, setView] = useState("needs_action");
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [linkFor, setLinkFor] = useState<string | null>(null);
  const [ticketInput, setTicketInput] = useState("");

  async function load(v = view) {
    const res = await fetch(`/api/admin/amazon-business?view=${v}`);
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(body.error ?? "Couldn't load.");
      return;
    }
    setError(null);
    setData(body);
  }
  useEffect(() => {
    load(view);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view]);

  async function act(id: string, action: string, extra: Record<string, unknown> = {}) {
    setBusy(id + action);
    setNotice(null);
    setError(null);
    let res = await fetch("/api/admin/amazon-business", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, id, ...extra }) });
    let body = await res.json().catch(() => ({}));
    if (res.status === 409 && confirm(body.error)) {
      res = await fetch("/api/admin/amazon-business", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, id, ...extra, confirm: true }) });
      body = await res.json().catch(() => ({}));
    }
    setBusy(null);
    if (!res.ok) setError(body.error ?? "Something went wrong.");
    else if (body.note) setNotice(body.note);
    setLinkFor(null);
    setTicketInput("");
    load();
  }

  async function syncNow() {
    setSyncing(true);
    setNotice(null);
    setError(null);
    const res = await fetch("/api/admin/amazon-business", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "sync" }) });
    const body = await res.json().catch(() => ({}));
    setSyncing(false);
    if (!res.ok) setError(body.error ?? "Sync failed.");
    else {
      const s = body.summary ?? {};
      setNotice(
        `Synced ${s.transactions ?? 0} Amazon transactions: ${s.created ?? 0} new purchases, ${s.matched ?? 0} matched to tickets, ${s.attached ?? 0} invoices attached, ${s.sent_to_finance ?? 0} sent to Finance.`
      );
    }
    load();
  }

  const last = data?.runs?.[0];

  return (
    <div className="max-w-5xl">
      <PageTitle
        eyebrow="IT & Finance"
        title="Amazon Business"
        right={
          data?.connected ? (
            <PillButton onClick={syncNow} disabled={syncing}>
              {syncing ? "Syncing… (up to a few minutes)" : "Sync now"}
            </PillButton>
          ) : null
        }
      />

      {data && !data.connected && (
        <Card className="mb-4">
          <p className="text-sm m-0" style={{ color: ink }}>
            Amazon Business isn&apos;t connected yet. An admin can connect it on{" "}
            <Link href="/admin/connectors#amazon-business" style={{ color: emerald, fontWeight: 700 }}>
              Admin → Connectors
            </Link>
            .
          </p>
        </Card>
      )}

      <Card className="mb-4">
        <Eyebrow>How purchases match a ticket</Eyebrow>
        <p className="text-sm m-0" style={{ color: ink }}>
          At Amazon checkout, type the <strong>Help Desk ticket number</strong> (like <code>HD-002703</code>) in the <strong>PO number</strong> box. The invoice then
          attaches to that ticket on the next sync. Otherwise, add the Amazon order number on the ticket, or link it below.{" "}
          <span style={{ color: dim }}>
            Pay by Invoice purchases from an approved hardware ticket go to Finance automatically, already approved.
          </span>
        </p>
        {last && (
          <p className="text-xs mt-3 mb-0" style={{ color: last.ok === false ? rose : faint }}>
            Last sync {new Date(last.started_at).toLocaleString()} ({last.trigger}){last.ok === false ? ` failed: ${last.error}` : last.finished_at ? "" : " — still running"}
          </p>
        )}
      </Card>

      <div className="flex flex-wrap gap-2 mb-4">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setView(t.key)}
            className="rounded-full px-4 py-2 text-sm font-bold"
            style={view === t.key ? { background: emerald, color: "#fff" } : { background: "#fff", color: ink, border: "1.5px solid var(--portal-line)" }}
          >
            {t.label}
            {t.count && data?.counts?.[t.count] ? ` · ${data.counts[t.count]}` : ""}
          </button>
        ))}
      </div>

      {error && (
        <div className="text-sm rounded-xl p-3 mb-3 font-semibold" style={{ background: `${rose}12`, color: rose }}>
          {error}
        </div>
      )}
      {notice && (
        <div className="text-sm rounded-xl p-3 mb-3 font-semibold" style={{ background: `${emerald}12`, color: emerald }}>
          {notice}
        </div>
      )}

      {!data ? (
        <p className="text-sm" style={{ color: faint }}>
          Loading…
        </p>
      ) : data.purchases.length === 0 ? (
        <Card>
          <p className="text-sm m-0" style={{ color: dim }}>
            {view === "needs_action" ? "Nothing waiting. Every synced purchase is matched, with Finance, or ignored." : "Nothing here yet."}
          </p>
        </Card>
      ) : (
        <div className="grid gap-3">
          {data.purchases.map((p) => {
            const refund = p.transaction_type && p.transaction_type !== "CHARGE";
            const label = p.invoice_number ? `Invoice ${p.invoice_number}` : p.order_ids[0] ? `Order ${p.order_ids[0]}` : "Amazon purchase";
            return (
              <Card key={p.id}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-xs" style={{ color: faint, fontFamily: "'IBM Plex Mono', monospace" }}>
                      {day(p.transaction_date)} · {label}
                      {p.order_ids.length > 1 ? ` · ${p.order_ids.length} orders` : ""}
                    </div>
                    <div className="text-lg font-bold" style={{ color: ink }}>
                      {usd(p.amount)}{" "}
                      <span className="text-sm font-normal" style={{ color: dim }}>
                        {p.items[0]?.title ? `· ${p.items[0].title}${p.items.length > 1 ? ` + ${p.items.length - 1} more` : ""}` : ""}
                      </span>
                    </div>
                    <div className="text-xs mt-1" style={{ color: dim }}>
                      Ordered by {p.buyer_name ?? p.buyer_email ?? "unknown"}
                      {p.po_numbers.length ? ` · PO ${p.po_numbers.join(", ")}` : " · no PO number"}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1.5 justify-end">
                    {refund ? (
                      <Pill text="Refund / credit" color={dim} />
                    ) : p.payment_type === "pay_by_invoice" ? (
                      <Pill text="Pay by Invoice" color={gold} />
                    ) : p.payment_type === "card" ? (
                      <Pill text={`Card${p.card_last4 ? ` ••${p.card_last4}` : ""}`} color="#4A7BB7" />
                    ) : (
                      <Pill text="Other payment" color={dim} />
                    )}
                    {p.payment_status && <Pill text={`Amazon: ${p.payment_status}${p.payment_due_date && p.payment_status !== "Closed" ? ` · due ${day(p.payment_due_date)}` : ""}`} color={PAY_COLORS[p.payment_status] ?? dim} />}
                  </div>
                </div>

                {p.items.length > 1 && (
                  <details className="mt-2">
                    <summary className="text-xs cursor-pointer" style={{ color: dim }}>
                      {p.items.length} items
                    </summary>
                    <div className="mt-1 grid gap-1">
                      {p.items.map((it, i) => (
                        <div key={i} className="flex justify-between gap-3 text-xs" style={{ color: ink }}>
                          <span>
                            {it.quantity}× {it.title}
                          </span>
                          <span>{usd(it.total)}</span>
                        </div>
                      ))}
                    </div>
                  </details>
                )}

                <div className="mt-3 pt-3 grid sm:grid-cols-3 gap-2 text-sm" style={{ borderTop: "1px dashed var(--portal-line)" }}>
                  <div>
                    <div className="text-[11px] uppercase tracking-wide" style={{ color: faint }}>
                      Invoice PDF
                    </div>
                    {p.pdf_status === "ready" ? (
                      <a href={`/api/admin/amazon-business/invoice/${p.id}`} target="_blank" rel="noreferrer" style={{ color: emerald, fontWeight: 700 }}>
                        📄 Open PDF
                      </a>
                    ) : p.pdf_status === "unavailable" || p.pdf_status === "failed" ? (
                      <span style={{ color: rose }} title={p.pdf_error ?? ""}>
                        Not available{p.pdf_error ? ` — ${p.pdf_error}` : ""}
                      </span>
                    ) : (
                      <span style={{ color: dim }}>Fetching from Amazon…</span>
                    )}
                  </div>
                  <div>
                    <div className="text-[11px] uppercase tracking-wide" style={{ color: faint }}>
                      Help Desk ticket
                    </div>
                    {p.ticket ? (
                      <span>
                        <Link href={`/helpdesk/${p.ticket.id}`} style={{ color: emerald, fontWeight: 700 }}>
                          {p.ticket.ticket_number}
                        </Link>{" "}
                        <span className="text-xs" style={{ color: dim }}>
                          {p.match_method ? MATCH_LABEL[p.match_method] : ""}
                          {p.attached ? " · invoice attached" : ""}
                        </span>
                      </span>
                    ) : (
                      <span style={{ color: dim }}>Not matched</span>
                    )}
                  </div>
                  <div>
                    <div className="text-[11px] uppercase tracking-wide" style={{ color: faint }}>
                      Finance
                    </div>
                    {p.finance_ticket ? (
                      <Link href={`/finance-tickets/${p.finance_ticket.id}`} style={{ color: emerald, fontWeight: 700 }}>
                        {p.finance_ticket.ticket_number} <span className="text-xs font-normal" style={{ color: dim }}>· {p.finance_ticket.status.replace(/_/g, " ")}</span>
                      </Link>
                    ) : p.payment_type === "pay_by_invoice" && !refund ? (
                      <span style={{ color: gold }}>Not sent yet</span>
                    ) : (
                      <span style={{ color: dim }}>Paid by card — nothing to pay</span>
                    )}
                  </div>
                </div>

                {p.note && (
                  <p className="text-xs mt-2 mb-0" style={{ color: dim }}>
                    {p.note}
                  </p>
                )}

                {!refund && (
                  <div className="flex flex-wrap items-center gap-2 mt-3">
                    {!p.ticket && p.status !== "ignored" && (linkFor === p.id ? (
                      <span className="flex items-center gap-2">
                        <input value={ticketInput} onChange={(e) => setTicketInput(e.target.value)} placeholder="HD-002703" style={{ ...inputStyle, width: 140, padding: "7px 10px" }} autoFocus />
                        <PillButton onClick={() => act(p.id, "link", { ticket: ticketInput })} disabled={!!busy}>
                          Link
                        </PillButton>
                        <button className="text-xs" style={{ color: dim }} onClick={() => setLinkFor(null)}>
                          Cancel
                        </button>
                      </span>
                    ) : (
                      <PillButton variant="ghost" onClick={() => setLinkFor(p.id)}>
                        Link to ticket
                      </PillButton>
                    ))}
                    {p.ticket && !p.attached && (
                      <PillButton variant="ghost" onClick={() => act(p.id, "unlink")} disabled={!!busy}>
                        Unlink
                      </PillButton>
                    )}
                    {!p.finance_ticket && p.status !== "ignored" && (p.payment_type === "pay_by_invoice" || p.payment_type === "other") && (
                      <PillButton onClick={() => act(p.id, "send_to_finance")} disabled={!!busy || p.pdf_status !== "ready"}>
                        {busy === p.id + "send_to_finance" ? "Sending…" : "Send to Finance"}
                      </PillButton>
                    )}
                    {(p.pdf_status === "failed" || p.pdf_status === "unavailable") && (
                      <PillButton variant="ghost" onClick={() => act(p.id, "retry_pdf")} disabled={!!busy}>
                        Retry PDF
                      </PillButton>
                    )}
                    {p.status === "ignored" ? (
                      <PillButton variant="ghost" onClick={() => act(p.id, "restore")} disabled={!!busy}>
                        Restore
                      </PillButton>
                    ) : (
                      !p.finance_ticket && (
                        <PillButton variant="danger" onClick={() => act(p.id, "ignore", { note: prompt("Why doesn't this need anything? (optional)") ?? "" })} disabled={!!busy}>
                          Ignore
                        </PillButton>
                      )
                    )}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
