"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { dim, emerald, gold, ink, line, relTime, rose } from "./style";

// Small shared pieces for the Device Management pages.

export function Button({
  children,
  onClick,
  variant = "ghost",
  disabled,
  small,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  variant?: "primary" | "ghost" | "danger";
  disabled?: boolean;
  small?: boolean;
}) {
  const styles: Record<string, React.CSSProperties> = {
    primary: { background: emerald, color: "#fff", border: `1.5px solid ${emerald}` },
    ghost: { background: "#fff", color: ink, border: `1.5px solid ${line}` },
    danger: { background: "#fff", color: rose, border: `1.5px solid ${rose}55` },
  };
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center justify-center gap-1.5 rounded-full font-bold transition-transform active:scale-95 disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed ${
        small ? "px-3 py-1.5 text-xs" : "px-4 py-2 text-sm"
      }`}
      style={styles[variant]}
    >
      {children}
    </button>
  );
}

export function SyncButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  async function sync() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/devices/sync", { method: "POST" });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "Sync failed");
      setMsg(d.status === "ok" ? "Synced." : d.status === "partial" ? "Synced, with some problems (see below)." : "Sync failed (see below).");
      router.refresh();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Sync failed");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="flex items-center gap-3">
      {msg && (
        <span className="text-xs" style={{ color: dim }}>
          {msg}
        </span>
      )}
      <Button variant="primary" onClick={sync} disabled={busy}>
        {busy ? "Syncing… (up to a minute)" : "Sync now"}
      </Button>
    </div>
  );
}

export function RequestDecision({ id, mine }: { id: string; mine: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  async function decide(decision: "approve" | "deny" | "cancel") {
    const verb = decision === "approve" ? "Approve and run this now? It can't be undone." : decision === "deny" ? "Deny this request?" : "Cancel your request?";
    if (!confirm(verb)) return;
    const note = decision === "cancel" ? null : prompt("Optional note:") ?? null;
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(`/api/devices/requests/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision, note }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "Failed");
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      {mine ? (
        <>
          <span className="text-xs" style={{ color: dim }}>
            Waiting for another IT person
          </span>
          <Button small onClick={() => decide("cancel")} disabled={busy}>
            Cancel
          </Button>
        </>
      ) : (
        <>
          <Button small variant="danger" onClick={() => decide("approve")} disabled={busy}>
            Approve &amp; run
          </Button>
          <Button small onClick={() => decide("deny")} disabled={busy}>
            Deny
          </Button>
        </>
      )}
      {err && (
        <span className="text-xs" style={{ color: rose }}>
          {err}
        </span>
      )}
    </div>
  );
}

export function SyncStatus({ run }: { run: { started_at: string; finished_at: string | null; status: string; errors: Record<string, string> | null } | null }) {
  if (!run) {
    return (
      <div className="rounded-2xl px-4 py-3 text-sm mb-6" style={{ background: `${gold}10`, border: `1px solid ${gold}40`, color: ink }}>
        Devices haven&apos;t been synced from Microsoft yet. Grant the permissions listed in the setup notes, then press <b>Sync now</b>.
      </div>
    );
  }
  const errs = Object.entries(run.errors ?? {});
  const SOURCE: Record<string, string> = {
    entra: "Entra devices",
    intune: "Intune",
    users: "Users & licenses",
    licenses: "License catalog",
    signins: "Sign-in activity",
    owners: "Device owners",
    compliance: "Compliance details",
    save: "Saving",
  };
  return (
    <div className="mb-6">
      <div className="text-xs" style={{ color: dim }}>
        Last sync {relTime(run.finished_at ?? run.started_at)} · {run.status === "running" ? "running…" : run.status === "ok" ? "all sources OK" : run.status}
      </div>
      {errs.length > 0 && (
        <div className="mt-2 rounded-2xl px-4 py-3 text-sm grid gap-1.5" style={{ background: `${gold}10`, border: `1px solid ${gold}40`, color: ink }}>
          {errs.map(([k, v]) => (
            <div key={k}>
              <b>{SOURCE[k] ?? k}:</b> {v}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
