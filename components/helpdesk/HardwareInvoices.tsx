"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type Invoice = { id: string; file_name: string; content_type: string | null; size_bytes: number | null; uploaded_at: string; uploaded_by: string | null; url: string | null };

// Invoice(s) for a hardware purchase. The IT team uploads; the requester
// can view. A gated hardware ticket can't be closed until one is here.
export default function HardwareInvoices({
  legId,
  tone,
  canUpload,
  canRemove,
  waitingOnApproval,
}: {
  legId: string;
  tone: "quest" | "plain";
  canUpload: boolean;
  canRemove: boolean;
  waitingOnApproval: boolean;
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [invoices, setInvoices] = useState<Invoice[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/helpdesk/invoices?legId=${legId}`)
      .then(async (r) => {
        const b = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(b.error ?? "Couldn't load invoices.");
        setInvoices(b.invoices ?? []);
      })
      .catch((e) => {
        setInvoices([]);
        setError(e.message);
      });
  }, [legId]);

  async function upload(file: File) {
    setBusy(true);
    setError(null);
    const fd = new FormData();
    fd.append("legId", legId);
    fd.append("file", file);
    const res = await fetch("/api/helpdesk/invoices", { method: "POST", body: fd });
    const b = await res.json().catch(() => ({}));
    setBusy(false);
    if (fileRef.current) fileRef.current.value = "";
    if (!res.ok) {
      setError(b.error ?? "Upload failed.");
      return;
    }
    setInvoices(b.invoices ?? []);
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

  const quest = tone === "quest";
  const dim = quest ? "#9C8FD9" : "var(--color-text-dim)";
  const link = quest ? "#00E5FF" : "var(--color-accent)";
  const bad = quest ? "#FF6B9C" : "#dc2626";

  return (
    <div style={{ fontSize: 12.5 }}>
      {invoices === null ? (
        <p style={{ color: dim, margin: 0 }}>Loading…</p>
      ) : invoices.length === 0 ? (
        <p style={{ color: dim, margin: "0 0 8px" }}>
          {waitingOnApproval ? "Upload the invoice once the purchase is approved and bought." : "No invoice uploaded yet."}
        </p>
      ) : (
        <div style={{ display: "grid", gap: 4, marginBottom: 8 }}>
          {invoices.map((inv) => (
            <div key={inv.id} style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
              <span>
                {inv.url ? (
                  <a href={inv.url} target="_blank" rel="noreferrer" style={{ color: link, textDecoration: "underline" }}>
                    {inv.file_name}
                  </a>
                ) : (
                  inv.file_name
                )}{" "}
                <span style={{ color: dim }}>
                  · {inv.uploaded_by ? `${inv.uploaded_by}, ` : ""}
                  {new Date(inv.uploaded_at).toLocaleDateString()}
                </span>
              </span>
              {canRemove && (
                <button onClick={() => remove(inv.id)} disabled={busy} style={{ color: bad, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                  Remove
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {canUpload && (
        <label
          className={
            quest
              ? "inline-block text-xs px-3 py-1.5 rounded-lg text-white cursor-pointer"
              : "inline-block text-xs px-3 py-1.5 rounded-lg text-white cursor-pointer"
          }
          style={{ background: quest ? "linear-gradient(90deg,#FF3EA5,#7B3EFF)" : "var(--color-accent)", opacity: busy ? 0.6 : 1 }}
        >
          {busy ? "Uploading…" : invoices && invoices.length > 0 ? "+ Add another invoice" : "Upload invoice (PDF or photo)"}
          <input
            ref={fileRef}
            type="file"
            accept="application/pdf,image/*"
            disabled={busy}
            style={{ display: "none" }}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) upload(f);
            }}
          />
        </label>
      )}
      {error && <p style={{ color: bad, margin: "6px 0 0" }}>{error}</p>}
    </div>
  );
}
