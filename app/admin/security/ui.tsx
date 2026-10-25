"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "../devices/ui";
import { dim, gold, ink, relTime } from "../devices/style";

export function SecSyncButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  async function sync() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/security/sync", { method: "POST" });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "Sync failed");
      setMsg(d.status === "ok" ? "Synced." : d.status === "partial" ? "Synced, with some gaps (see below)." : "Sync failed (see below).");
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
        {busy ? "Syncing…" : "Sync now"}
      </Button>
    </div>
  );
}

const SOURCE: Record<string, string> = {
  secure_score: "Secure Score",
  incidents: "Incidents",
  mfa: "MFA report",
  risky_users: "Risky users",
  defender: "Defender devices",
  defender_vulns: "Vulnerabilities",
  mailbox_rules: "Mailbox rules",
};

export function SecSyncStatus({ run }: { run: { started_at: string; finished_at: string | null; status: string; errors: Record<string, string> | null } | null }) {
  if (!run) {
    return (
      <div className="rounded-2xl px-4 py-3 text-sm mb-6" style={{ background: `${gold}10`, border: `1px solid ${gold}40`, color: ink }}>
        Security data hasn&apos;t been synced yet. Grant the security permissions on the Portal app, then press <b>Sync now</b>.
      </div>
    );
  }
  const errs = Object.entries(run.errors ?? {});
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
