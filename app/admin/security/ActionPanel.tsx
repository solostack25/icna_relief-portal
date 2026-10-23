"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "../devices/ui";
import { dim, emerald, ink, line, rose } from "../devices/style";

export type PanelAction = { key: string; label: string; help: string; danger?: boolean; hidden?: boolean };

// Buttons for response actions. Picking one opens a short "why?" box;
// confirming POSTs { action, reason } to the endpoint.
export default function ActionPanel({ endpoint, actions, note }: { endpoint: string; actions: PanelAction[]; note?: string }) {
  const router = useRouter();
  const [pick, setPick] = useState<PanelAction | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  async function go() {
    if (!pick) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: pick.key, reason }) });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "Failed");
      setMsg(`${pick.label}: sent.${d.via === "intune" ? " (through Intune)" : ""}`);
      setPick(null);
      setReason("");
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-3">
      {note && (
        <div className="text-xs" style={{ color: dim }}>
          {note}
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        {actions
          .filter((a) => !a.hidden)
          .map((a) => (
            <Button
              key={a.key}
              small
              variant={a.danger ? "danger" : "ghost"}
              onClick={() => {
                setPick(a);
                setErr(null);
                setMsg(null);
              }}
            >
              {a.label}
            </Button>
          ))}
      </div>
      {msg && (
        <div className="text-sm" style={{ color: emerald }}>
          {msg}
        </div>
      )}
      {pick && (
        <div className="rounded-xl p-3 grid gap-2" style={{ border: `1.5px solid ${line}`, background: "rgba(22,48,43,0.02)" }}>
          <div className="text-sm font-bold" style={{ color: pick.danger ? rose : ink }}>
            {pick.label}
          </div>
          <div className="text-xs" style={{ color: dim }}>
            {pick.help}
          </div>
          <input autoFocus value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason (required, e.g. incident # or what happened)" className="w-full rounded-xl px-3 py-2 text-sm bg-white outline-none" style={{ border: `1.5px solid ${line}` }} />
          {err && (
            <div className="text-xs" style={{ color: rose }}>
              {err}
            </div>
          )}
          <div className="flex gap-2">
            <Button small variant={pick.danger ? "danger" : "primary"} onClick={go} disabled={busy || reason.trim().length < 5}>
              {busy ? "Working…" : "Confirm"}
            </Button>
            <Button small onClick={() => setPick(null)} disabled={busy}>
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
