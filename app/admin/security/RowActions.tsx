"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "../devices/ui";
import { line, rose } from "../devices/style";

export type RowAction = { key: string; label: string; danger?: boolean; needsReason?: boolean; body?: Record<string, unknown> };

// Compact buttons for one row (a sign-in method, an inbox rule, an
// indicator). Actions that need a reason open a one-line prompt first.
export default function RowActions({ endpoint, actions, method = "POST" }: { endpoint: string; actions: RowAction[]; method?: "POST" | "DELETE" }) {
  const router = useRouter();
  const [pick, setPick] = useState<RowAction | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function run(a: RowAction, why: string) {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(endpoint, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...(a.body ?? {}), action: a.key, reason: why }) });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? "Failed");
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
    <div className="grid gap-1.5 justify-items-end">
      {!pick ? (
        <div className="flex flex-wrap gap-1.5 justify-end">
          {actions.map((a) => (
            <Button key={a.key} small variant={a.danger ? "danger" : "ghost"} disabled={busy} onClick={() => (a.needsReason ? setPick(a) : run(a, ""))}>
              {a.label}
            </Button>
          ))}
        </div>
      ) : (
        <div className="flex flex-wrap gap-1.5 justify-end items-center">
          <input
            autoFocus
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && reason.trim().length >= 5 && run(pick, reason)}
            placeholder="Reason (required)"
            className="rounded-lg px-2 py-1 text-xs bg-white outline-none w-48"
            style={{ border: `1.5px solid ${line}` }}
          />
          <Button small variant={pick.danger ? "danger" : "primary"} disabled={busy || reason.trim().length < 5} onClick={() => run(pick, reason)}>
            {busy ? "…" : pick.label}
          </Button>
          <Button small disabled={busy} onClick={() => setPick(null)}>
            Cancel
          </Button>
        </div>
      )}
      {err && (
        <div className="text-xs text-right max-w-xs" style={{ color: rose }}>
          {err}
        </div>
      )}
    </div>
  );
}
