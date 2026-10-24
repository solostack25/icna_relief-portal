"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// Amazon Business order number(s) for a hardware ticket. With these (or
// the ticket number typed as the PO number at checkout), the nightly
// Amazon Business sync attaches the invoice to this ticket by itself.
export default function AmazonOrderField({
  legId,
  ticketNumber,
  initial,
  tone,
  canEdit,
}: {
  legId: string;
  ticketNumber: string | null;
  initial: string[];
  tone: "quest" | "plain";
  canEdit: boolean;
}) {
  const router = useRouter();
  const [orders, setOrders] = useState<string[]>(initial);
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(initial.join(", "));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const quest = tone === "quest";
  const dim = quest ? "#9C8FD9" : "var(--color-text-dim)";
  const ok = quest ? "#5FFFAE" : "#15803d";
  const bad = quest ? "#FF6B9C" : "#dc2626";
  const inputCls = quest
    ? "w-full rounded-lg px-2.5 py-1.5 text-sm bg-[#1A1035] border border-[#4A3B7A] text-[#EDE6FF] placeholder:text-[#9C8FD9]"
    : "w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 py-1.5 text-sm";

  async function save() {
    setBusy(true);
    setMsg(null);
    const res = await fetch("/api/helpdesk/amazon-orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ legId, orderIds: text }),
    });
    const b = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setMsg({ ok: false, text: b.error ?? "Couldn't save." });
      return;
    }
    setOrders(b.orderIds ?? []);
    setEditing(false);
    setMsg({
      ok: true,
      text: b.attached ? `Saved. Found the Amazon invoice and attached it.` : b.linked ? "Saved and linked. The invoice attaches once Amazon has the PDF ready." : "Saved. The invoice attaches automatically after the next Amazon sync.",
    });
    if (b.attached) router.refresh();
  }

  return (
    <div style={{ fontSize: 12.5, marginBottom: 10 }}>
      <div style={{ display: "flex", gap: 8, alignItems: "baseline", flexWrap: "wrap" }}>
        <span style={{ color: dim }}>Amazon Business order #:</span>
        {orders.length ? <strong style={{ fontFamily: "'IBM Plex Mono', monospace" }}>{orders.join(", ")}</strong> : <span style={{ color: dim }}>none yet</span>}
        {canEdit && !editing && (
          <button onClick={() => setEditing(true)} style={{ color: quest ? "#00E5FF" : "var(--color-accent)", fontWeight: 700, cursor: "pointer" }}>
            {orders.length ? "Edit" : "Add"}
          </button>
        )}
      </div>
      {canEdit && !orders.length && !editing && ticketNumber && (
        <div style={{ color: dim, marginTop: 2 }}>
          Tip: type <strong>{ticketNumber}</strong> in the PO number box at Amazon checkout and the invoice attaches itself.
        </div>
      )}
      {editing && (
        <div style={{ display: "flex", gap: 8, marginTop: 6, alignItems: "center" }}>
          <input value={text} onChange={(e) => setText(e.target.value)} placeholder="111-1234567-1234567 (comma-separate several)" className={inputCls} />
          <button
            onClick={save}
            disabled={busy}
            className="text-xs px-3 py-1.5 rounded-lg text-white cursor-pointer"
            style={{ background: quest ? "linear-gradient(90deg,#FF3EA5,#7B3EFF)" : "var(--color-accent)", opacity: busy ? 0.6 : 1, whiteSpace: "nowrap" }}
          >
            {busy ? "Saving…" : "Save"}
          </button>
          <button onClick={() => setEditing(false)} style={{ color: dim, fontSize: 12, cursor: "pointer" }}>
            Cancel
          </button>
        </div>
      )}
      {msg && <div style={{ color: msg.ok ? ok : bad, marginTop: 4 }}>{msg.text}</div>}
    </div>
  );
}
