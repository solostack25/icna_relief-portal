"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type Invoice = {
  id: string;
  file_name: string;
  content_type: string | null;
  size_bytes: number | null;
  uploaded_at: string;
  uploaded_by: string | null;
  url: string | null;
  amount: number | null;
  vendor: string | null;
  payment_method: string | null;
  gm_expense_id: string | null;
  source?: string;
};
type GrantCtx = { grantId: string; grantName: string; lines: { id: string; label: string }[]; suggested: string | null } | null;

const PAID_BY: [string, string][] = [
  ["corporate_card", "Corporate card"],
  ["pay_by_invoice", "Amazon Business – Pay by Invoice"],
  ["pex", "PEX card"],
  ["check", "Check"],
  ["ach", "ACH / wire"],
  ["reimbursement", "Employee reimbursement"],
  ["other", "Other"],
];
const usd = (n: number | null | undefined) => (n == null ? "—" : n.toLocaleString("en-US", { style: "currency", currency: "USD" }));

// Invoice(s) for a hardware purchase. The IT team uploads (with the
// invoice total, vendor, how it was paid and - for grant purchases - the
// budget line); the requester can view and download. A gated hardware
// ticket can't be closed until one is here. Once the ticket closes, the
// requester is emailed the invoice and grant purchases post to Grant
// Management; this also shows that close-out and lets IT retry it.
export default function HardwareInvoices({
  legId,
  tone,
  canUpload,
  canRemove,
  waitingOnApproval,
  budget = null,
  legClosed = false,
  closeoutEmailedAt = null,
  canRetryCloseout = false,
}: {
  legId: string;
  tone: "quest" | "plain";
  canUpload: boolean;
  canRemove: boolean;
  waitingOnApproval: boolean;
  budget?: number | null;
  legClosed?: boolean;
  closeoutEmailedAt?: string | null;
  canRetryCloseout?: boolean;
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [invoices, setInvoices] = useState<Invoice[] | null>(null);
  const [grant, setGrant] = useState<GrantCtx>(null);
  const [gated, setGated] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [amount, setAmount] = useState("");
  const [vendor, setVendor] = useState("");
  const [paidBy, setPaidBy] = useState("corporate_card");
  const [lineId, setLineId] = useState("");

  useEffect(() => {
    fetch(`/api/helpdesk/invoices?legId=${legId}`)
      .then(async (r) => {
        const b = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(b.error ?? "Couldn't load invoices.");
        setInvoices(b.invoices ?? []);
        setGrant(b.grant ?? null);
        setGated(!!b.gated);
        setLineId(b.grant?.suggested ?? "");
      })
      .catch((e) => {
        setInvoices([]);
        setError(e.message);
      });
  }, [legId]);

  function reset() {
    setFile(null);
    setAmount("");
    setVendor("");
    if (fileRef.current) fileRef.current.value = "";
  }

  async function upload() {
    if (!file) return;
    if (gated && !(Number(amount.replace(/[$,\s]/g, "")) > 0)) {
      setError("Enter the invoice total.");
      return;
    }
    if (gated && grant && grant.lines.length && !lineId) {
      setError(`Pick the ${grant.grantName} budget line.`);
      return;
    }
    setBusy(true);
    setError(null);
    const fd = new FormData();
    fd.append("legId", legId);
    fd.append("file", file);
    fd.append("amount", amount);
    fd.append("vendor", vendor);
    fd.append("payment_method", paidBy);
    if (lineId) fd.append("gm_line_id", lineId);
    const res = await fetch("/api/helpdesk/invoices", { method: "POST", body: fd });
    const b = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(b.error ?? "Upload failed.");
      return;
    }
    setInvoices(b.invoices ?? []);
    reset();
    router.refresh(); // unlocks Close on the ticket
  }

  async function remove(id: string) {
    if (!confirm("Remove this invoice?")) return;
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/helpdesk/invoices?legId=${legId}&id=${id}`, { method: "DELETE" });
    const b = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(b.error ?? "Couldn't remove it.");
      return;
    }
    setInvoices(b.invoices ?? []);
    router.refresh();
  }

  async function retryCloseout() {
    setBusy(true);
    setError(null);
    setMsg(null);
    const res = await fetch("/api/helpdesk/hardware-closeout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ legId }),
    });
    const b = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(b.error ?? "Close-out failed.");
      return;
    }
    setMsg(b.warnings?.length ? b.warnings.join(" ") : "Done.");
    router.refresh();
  }

  const quest = tone === "quest";
  const dim = quest ? "#9C8FD9" : "var(--color-text-dim)";
  const link = quest ? "#00E5FF" : "var(--color-accent)";
  const bad = quest ? "#FF6B9C" : "#dc2626";
  const ok = quest ? "#5FFFAE" : "#15803d";
  const inputCls = quest
    ? "w-full rounded-lg px-2.5 py-1.5 text-sm bg-[#1A1035] border border-[#4A3B7A] text-[#EDE6FF] placeholder:text-[#9C8FD9]"
    : "w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 py-1.5 text-sm";
  const primary = { background: quest ? "linear-gradient(90deg,#FF3EA5,#7B3EFF)" : "var(--color-accent)", opacity: busy ? 0.6 : 1 };

  const invoiced = (invoices ?? []).reduce((s, i) => s + (i.amount ?? 0), 0);
  const unposted = !!grant && (invoices ?? []).some((i) => !i.gm_expense_id);
  const closeoutIncomplete = gated && legClosed && (invoices ?? []).length > 0 && (!closeoutEmailedAt || unposted);

  return (
    <div style={{ fontSize: 12.5 }}>
      {invoices === null ? (
        <p style={{ color: dim, margin: 0 }}>Loading…</p>
      ) : invoices.length === 0 ? (
        <p style={{ color: dim, margin: "0 0 8px" }}>
          {waitingOnApproval ? "Upload the invoice once the purchase is approved and bought." : "No invoice uploaded yet."}
        </p>
      ) : (
        <div style={{ display: "grid", gap: 6, marginBottom: 8 }}>
          {invoices.map((inv) => (
            <div key={inv.id} style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "flex-start" }}>
              <span>
                {inv.url ? (
                  <a href={inv.url} target="_blank" rel="noreferrer" download={inv.file_name} style={{ color: link, textDecoration: "underline" }}>
                    ⬇ {inv.file_name}
                  </a>
                ) : (
                  inv.file_name
                )}
                {inv.amount != null && <strong> · {usd(inv.amount)}</strong>}
                {inv.vendor && <span style={{ color: dim }}> · {inv.vendor}</span>}
                {inv.source === "amazon_business" && <span style={{ color: ok }}> · pulled from Amazon</span>}
                <span style={{ color: dim }}>
                  {" "}
                  · {inv.uploaded_by ? `${inv.uploaded_by}, ` : ""}
                  {new Date(inv.uploaded_at).toLocaleDateString()}
                </span>
                {inv.gm_expense_id && (
                  <>
                    {" "}
                    ·{" "}
                    <a href={`/grant-management/expenses/${inv.gm_expense_id}`} style={{ color: ok, fontWeight: 700 }}>
                      ✓ Posted to {grant?.grantName ?? "grant"}
                    </a>
                  </>
                )}
              </span>
              {canRemove && !inv.gm_expense_id && (
                <button onClick={() => remove(inv.id)} disabled={busy} style={{ color: bad, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                  Remove
                </button>
              )}
            </div>
          ))}
          {invoiced > 0 && (
            <div style={{ color: budget != null && invoiced > budget ? bad : dim, fontWeight: 600 }}>
              Invoiced {usd(invoiced)}
              {budget != null ? ` of the ${usd(budget)} approved budget${invoiced > budget ? ` — ${usd(invoiced - budget)} over` : ""}` : ""}
            </div>
          )}
        </div>
      )}

      {gated && legClosed && invoices && invoices.length > 0 && (
        <div style={{ marginBottom: 8, color: dim }}>
          {closeoutEmailedAt ? (
            <span style={{ color: ok }}>✓ Requester emailed the invoice on {new Date(closeoutEmailedAt).toLocaleDateString()}</span>
          ) : (
            <span style={{ color: bad }}>The requester hasn&apos;t been emailed the invoice yet.</span>
          )}
          {grant && unposted && <div style={{ color: bad }}>Not every invoice is posted to {grant.grantName} yet. See the approval history for why.</div>}
          {closeoutIncomplete && canRetryCloseout && (
            <button
              onClick={retryCloseout}
              disabled={busy}
              className="text-xs px-3 py-1.5 rounded-lg text-white cursor-pointer mt-2"
              style={primary}
            >
              {busy ? "Working…" : "Retry close-out"}
            </button>
          )}
          {msg && <div style={{ marginTop: 4 }}>{msg}</div>}
        </div>
      )}

      {canUpload && !file && (
        <label className="inline-block text-xs px-3 py-1.5 rounded-lg text-white cursor-pointer" style={primary}>
          {invoices && invoices.length > 0 ? "+ Add another invoice" : "Upload invoice (PDF or photo)"}
          <input
            ref={fileRef}
            type="file"
            accept="application/pdf,image/*"
            disabled={busy}
            style={{ display: "none" }}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) {
                setFile(f);
                setError(null);
              }
            }}
          />
        </label>
      )}

      {canUpload && file && (
        <div style={{ display: "grid", gap: 8, marginTop: 4, padding: 10, borderRadius: 10, border: quest ? "1px solid #3A2C68" : "1px solid var(--color-border)" }}>
          <div style={{ fontWeight: 700 }}>📄 {file.name}</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <label style={{ color: dim, fontSize: 12 }}>
              Invoice total{gated ? " *" : ""}
              <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" placeholder="$0.00" className={inputCls} />
            </label>
            <label style={{ color: dim, fontSize: 12 }}>
              Vendor
              <input value={vendor} onChange={(e) => setVendor(e.target.value)} placeholder="e.g. Dell, CDW, Amazon" className={inputCls} />
            </label>
          </div>
          <label style={{ color: dim, fontSize: 12 }}>
            Paid by{gated ? " *" : ""}
            <select value={paidBy} onChange={(e) => setPaidBy(e.target.value)} className={inputCls}>
              {PAID_BY.map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </label>
          {grant && grant.lines.length > 0 && (
            <label style={{ color: dim, fontSize: 12 }}>
              {grant.grantName} budget line *
              <select value={lineId} onChange={(e) => setLineId(e.target.value)} className={inputCls}>
                <option value="">Pick a budget line…</option>
                {grant.lines.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.label}
                  </option>
                ))}
              </select>
              <span style={{ display: "block", marginTop: 2 }}>When the ticket closes, this invoice is posted to the grant on this line.</span>
            </label>
          )}
          {grant && paidBy === "pex" && (
            <span style={{ color: dim, fontSize: 12 }}>
              Paid by PEX: this posts to the grant when the ticket closes, so the grant team shouldn&apos;t code the same PEX transaction again.
            </span>
          )}
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={upload} disabled={busy} className="text-xs px-3 py-1.5 rounded-lg text-white cursor-pointer" style={primary}>
              {busy ? "Uploading…" : "Save invoice"}
            </button>
            <button onClick={reset} disabled={busy} style={{ color: dim, fontSize: 12, cursor: "pointer" }}>
              Cancel
            </button>
          </div>
        </div>
      )}
      {error && <p style={{ color: bad, margin: "6px 0 0" }}>{error}</p>}
    </div>
  );
}
