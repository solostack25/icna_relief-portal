"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { donorDisplayName, money, sumAmounts, type CashDonationRow, type MoneyOrderRow } from "@/lib/inkind/cashCheck.shared";

type PushResult = { id: string; receipt_number: string; success: boolean; error?: string };

const card = "rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]";

function StatusPill({ d }: { d: CashDonationRow }) {
  const map = {
    received: ["Not deposited", "bg-amber-100 text-amber-800"],
    batched: ["In money order", "bg-blue-100 text-blue-800"],
    synced: ["In Salesforce", "bg-emerald-100 text-emerald-800"],
  } as const;
  const [label, cls] = map[d.status];
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>{label}</span>;
}

function MethodLabel({ d }: { d: CashDonationRow }) {
  return (
    <span className="text-sm">
      {d.method === "cash" ? "Cash" : `Check${d.check_number ? ` #${d.check_number}` : ""}`}
      {d.check_image_path && (
        <a href={`/api/inkind-admin/cash-check/image/${d.id}`} target="_blank" rel="noreferrer" className="ml-2 text-xs text-[var(--color-brand)] underline">
          {d.check_image_blurred ? "image (blurred)" : "image"}
        </a>
      )}
    </span>
  );
}

export default function CashCheckAdminPage() {
  const [donations, setDonations] = useState<CashDonationRow[]>([]);
  const [moneyOrders, setMoneyOrders] = useState<MoneyOrderRow[]>([]);
  const [salesforceReady, setSalesforceReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showBatchForm, setShowBatchForm] = useState(false);
  const [moNumber, setMoNumber] = useState("");
  const [moAmount, setMoAmount] = useState("");
  const [moDate, setMoDate] = useState(new Date().toISOString().slice(0, 10));
  const [moNotes, setMoNotes] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [pushResults, setPushResults] = useState<Record<string, PushResult[]>>({});

  const load = useCallback(async () => {
    setError(null);
    const res = await fetch("/api/inkind-admin/cash-check");
    const json = await res.json();
    if (!res.ok) {
      setError(json.error ?? "Couldn't load donations");
    } else {
      setDonations(json.donations);
      setMoneyOrders(json.moneyOrders);
      setSalesforceReady(json.salesforceReady);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const undeposited = useMemo(() => donations.filter((d) => d.status === "received"), [donations]);
  const byMoneyOrder = useMemo(() => {
    const m = new Map<string, CashDonationRow[]>();
    for (const d of donations) if (d.money_order_id) m.set(d.money_order_id, [...(m.get(d.money_order_id) ?? []), d]);
    return m;
  }, [donations]);

  const selectedRows = undeposited.filter((d) => selected.has(d.id));
  const selectedTotal = sumAmounts(selectedRows);
  const allSelected = undeposited.length > 0 && selectedRows.length === undeposited.length;

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function openBatchForm() {
    setMoAmount(selectedTotal.toFixed(2));
    setShowBatchForm(true);
  }

  async function call(url: string, method: string, body: unknown) {
    const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw Object.assign(new Error(json.error ?? "Request failed"), { json });
    return json;
  }

  async function createMoneyOrder() {
    setBusy("batch");
    setError(null);
    try {
      await call("/api/inkind-admin/cash-check/money-orders", "POST", {
        donationIds: selectedRows.map((d) => d.id),
        moneyOrderNumber: moNumber,
        amount: Number(moAmount),
        purchasedOn: moDate,
        notes: moNotes,
      });
      setNotice(`Money order ${moNumber} created with ${selectedRows.length} donation${selectedRows.length === 1 ? "" : "s"}.`);
      setSelected(new Set());
      setShowBatchForm(false);
      setMoNumber("");
      setMoNotes("");
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function undoMoneyOrder(mo: MoneyOrderRow) {
    if (!confirm(`Undo money order ${mo.money_order_number}? Its donations go back to "Not deposited".`)) return;
    setBusy(mo.id);
    try {
      await call("/api/inkind-admin/cash-check/money-orders", "DELETE", { id: mo.id });
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function push(mo: MoneyOrderRow) {
    const count = (byMoneyOrder.get(mo.id) ?? []).filter((d) => d.status !== "synced").length;
    if (!confirm(`Push ${count} donation${count === 1 ? "" : "s"} to Salesforce? Donor details will be removed from the portal and check images blurred once each is pushed.`)) return;
    setBusy(mo.id);
    setError(null);
    try {
      const json = await call("/api/inkind-admin/cash-check/money-orders/push", "POST", { moneyOrderId: mo.id });
      setPushResults((p) => ({ ...p, [mo.id]: json.results }));
      const failed = (json.results as PushResult[]).filter((r) => !r.success).length;
      setNotice(failed ? `${failed} donation(s) failed to push - see the money order for details.` : `Money order ${mo.money_order_number} pushed to Salesforce.`);
      setExpanded(mo.id);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function removeDonation(d: CashDonationRow) {
    if (!confirm(`Delete receipt ${d.receipt_number} (${money(d.amount)})? Only do this for an entry made by mistake.`)) return;
    try {
      await call("/api/inkind-admin/cash-check", "DELETE", { id: d.id });
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function resendReceipt(d: CashDonationRow) {
    try {
      await call("/api/inkind-admin/cash-check/receipt", "POST", { id: d.id });
      setNotice(`Receipt sent to ${d.donor_email}.`);
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  if (loading) return <div className="p-6 text-[var(--color-text-dim)]">Loading…</div>;

  return (
    <div className="p-4 sm:p-6 space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-[var(--color-text)]">Cash &amp; Check</h1>
        <p className="text-sm text-[var(--color-text-dim)]">
          Select the donations that went into a money order, record it, then push them to Salesforce.
        </p>
      </div>

      {!salesforceReady && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Salesforce mapping for cash/check isn&apos;t set up yet. You can record donations and money orders now; pushing will be enabled once the mapping is configured.
        </div>
      )}
      {error && <div className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>}
      {notice && (
        <div className="rounded-lg border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm text-emerald-900 flex justify-between gap-4">
          {notice}
          <button onClick={() => setNotice(null)}>✕</button>
        </div>
      )}

      {/* ---------------------------------------------- Not deposited */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-[var(--color-text)]">
            Not deposited <span className="text-[var(--color-text-dim)] font-normal">({undeposited.length} · {money(sumAmounts(undeposited))})</span>
          </h2>
          {selectedRows.length > 0 && (
            <button onClick={openBatchForm} className="rounded-full bg-[var(--color-brand)] px-5 py-2 text-sm font-semibold text-white">
              Create money order · {selectedRows.length} selected · {money(selectedTotal)}
            </button>
          )}
        </div>

        {showBatchForm && selectedRows.length > 0 && (
          <div className={`${card} p-4 space-y-3`}>
            <div className="grid gap-3 sm:grid-cols-3">
              <label className="text-sm">
                Money order #
                <input value={moNumber} onChange={(e) => setMoNumber(e.target.value)} className="mt-1 w-full rounded-lg border border-[var(--color-border)] px-3 py-2" />
              </label>
              <label className="text-sm">
                Amount
                <input inputMode="decimal" value={moAmount} onChange={(e) => setMoAmount(e.target.value.replace(/[^0-9.]/g, ""))} className="mt-1 w-full rounded-lg border border-[var(--color-border)] px-3 py-2" />
              </label>
              <label className="text-sm">
                Purchased on
                <input type="date" value={moDate} onChange={(e) => setMoDate(e.target.value)} className="mt-1 w-full rounded-lg border border-[var(--color-border)] px-3 py-2" />
              </label>
            </div>
            {Number(moAmount) > 0 && Math.round(Number(moAmount) * 100) !== Math.round(selectedTotal * 100) && (
              <p className="text-sm text-amber-700">
                Amount differs from the selected donations ({money(selectedTotal)}). Add a note explaining why.
              </p>
            )}
            <textarea value={moNotes} onChange={(e) => setMoNotes(e.target.value)} placeholder="Notes (optional)" rows={2} className="w-full rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm" />
            <div className="flex gap-3 justify-end">
              <button onClick={() => setShowBatchForm(false)} className="rounded-full px-4 py-2 text-sm text-[var(--color-text-dim)]">
                Cancel
              </button>
              <button
                onClick={createMoneyOrder}
                disabled={busy === "batch" || !moNumber.trim()}
                className="rounded-full bg-[var(--color-brand)] px-5 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                {busy === "batch" ? "Saving…" : "Save money order"}
              </button>
            </div>
          </div>
        )}

        {undeposited.length === 0 ? (
          <p className={`${card} p-6 text-center text-sm text-[var(--color-text-dim)]`}>Nothing waiting to be deposited.</p>
        ) : (
          <div className={`${card} overflow-x-auto`}>
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase text-[var(--color-text-dim)]">
                <tr className="border-b border-[var(--color-border)]">
                  <th className="p-3 w-10">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={() => setSelected(allSelected ? new Set() : new Set(undeposited.map((d) => d.id)))}
                      aria-label="Select all"
                    />
                  </th>
                  <th className="p-3">Date</th>
                  <th className="p-3">Receipt</th>
                  <th className="p-3">Donor</th>
                  <th className="p-3">Method</th>
                  <th className="p-3 text-right">Amount</th>
                  <th className="p-3" />
                </tr>
              </thead>
              <tbody>
                {undeposited.map((d) => (
                  <tr key={d.id} className="border-b border-[var(--color-border)] last:border-0 hover:bg-[var(--color-brand-light)]/40">
                    <td className="p-3">
                      <input type="checkbox" checked={selected.has(d.id)} onChange={() => toggle(d.id)} aria-label={`Select ${d.receipt_number}`} />
                    </td>
                    <td className="p-3 whitespace-nowrap">{d.date_received}</td>
                    <td className="p-3 whitespace-nowrap font-mono text-xs">{d.receipt_number}</td>
                    <td className="p-3">
                      {donorDisplayName(d)}
                      {d.email_receipt && !d.receipt_sent_at && d.donor_email && (
                        <button onClick={() => resendReceipt(d)} className="ml-2 text-xs text-amber-700 underline">
                          receipt not sent - retry
                        </button>
                      )}
                    </td>
                    <td className="p-3 whitespace-nowrap">
                      <MethodLabel d={d} />
                    </td>
                    <td className="p-3 text-right font-semibold whitespace-nowrap">{money(d.amount)}</td>
                    <td className="p-3 text-right">
                      <button onClick={() => removeDonation(d)} className="text-xs text-red-600">
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ------------------------------------------------ Money orders */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-[var(--color-text)]">Money orders</h2>
        {moneyOrders.length === 0 && <p className={`${card} p-6 text-center text-sm text-[var(--color-text-dim)]`}>No money orders yet.</p>}
        {moneyOrders.map((mo) => {
          const rows = byMoneyOrder.get(mo.id) ?? [];
          const synced = rows.filter((d) => d.status === "synced").length;
          const pending = rows.length - synced;
          const results = pushResults[mo.id];
          return (
            <div key={mo.id} className={card}>
              <button onClick={() => setExpanded(expanded === mo.id ? null : mo.id)} className="w-full flex flex-wrap items-center justify-between gap-3 p-4 text-left">
                <div>
                  <p className="font-semibold">Money order #{mo.money_order_number}</p>
                  <p className="text-xs text-[var(--color-text-dim)]">
                    {mo.purchased_on} · {rows.length} donation{rows.length === 1 ? "" : "s"} · {mo.office}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-semibold">{money(mo.amount)}</span>
                  {pending === 0 && rows.length > 0 ? (
                    <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800">In Salesforce</span>
                  ) : synced > 0 ? (
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">{synced}/{rows.length} pushed</span>
                  ) : (
                    <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-800">Ready to push</span>
                  )}
                </div>
              </button>

              {expanded === mo.id && (
                <div className="border-t border-[var(--color-border)] p-4 space-y-3">
                  {Math.round(mo.amount * 100) !== Math.round(mo.donations_total * 100) && (
                    <p className="text-sm text-amber-700">
                      Money order {money(mo.amount)} vs donations {money(mo.donations_total)}
                      {mo.notes ? ` — ${mo.notes}` : ""}
                    </p>
                  )}
                  <table className="w-full text-sm">
                    <tbody>
                      {rows.map((d) => {
                        const r = results?.find((x) => x.id === d.id);
                        return (
                          <tr key={d.id} className="border-b border-[var(--color-border)] last:border-0">
                            <td className="py-2 pr-3 font-mono text-xs whitespace-nowrap">{d.receipt_number}</td>
                            <td className="py-2 pr-3">{donorDisplayName(d)}</td>
                            <td className="py-2 pr-3 whitespace-nowrap">
                              <MethodLabel d={d} />
                            </td>
                            <td className="py-2 pr-3 text-right whitespace-nowrap">{money(d.amount)}</td>
                            <td className="py-2 text-right">
                              <StatusPill d={d} />
                              {d.salesforce_record_id && <p className="text-[10px] text-[var(--color-text-dim)] font-mono">{d.salesforce_record_id}</p>}
                              {(r?.error || (d.status !== "synced" && d.sync_error)) && (
                                <p className="text-xs text-red-600 max-w-xs ml-auto">{r?.error ?? d.sync_error}</p>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  <div className="flex flex-wrap justify-end gap-3">
                    {synced === 0 && (
                      <button onClick={() => undoMoneyOrder(mo)} disabled={busy === mo.id} className="rounded-full px-4 py-2 text-sm text-red-600 disabled:opacity-50">
                        Undo money order
                      </button>
                    )}
                    {pending > 0 && (
                      <button
                        onClick={() => push(mo)}
                        disabled={busy === mo.id || !salesforceReady}
                        title={salesforceReady ? undefined : "Salesforce mapping not configured yet"}
                        className="rounded-full bg-[var(--color-brand)] px-5 py-2 text-sm font-semibold text-white disabled:opacity-50"
                      >
                        {busy === mo.id ? "Pushing…" : synced > 0 ? `Retry ${pending} to Salesforce` : "Push to Salesforce"}
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </section>
    </div>
  );
}
