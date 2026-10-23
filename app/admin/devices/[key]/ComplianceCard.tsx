"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ComplianceReason } from "@/lib/devices/compliance";
import { Button } from "../ui";
import { card, dim, emerald, faint, gold, ink, line, relTime, rose } from "../style";

// "Why isn't this device compliant?" with a fix per failing setting.
export default function ComplianceCard({
  deviceKey,
  state,
  reasons,
  checkedAt,
}: {
  deviceKey: string;
  state: string | null;
  reasons: ComplianceReason[] | null;
  checkedAt: string | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function recheck() {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(`/api/devices/${encodeURIComponent(deviceKey)}/compliance`, { method: "POST" });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "Couldn't check");
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn't check");
    } finally {
      setBusy(false);
    }
  }

  const ok = state === "compliant";
  const grace = state === "inGracePeriod";
  const color = ok ? emerald : grace ? gold : rose;
  const list = reasons ?? [];

  return (
    <section className="p-5 mb-6" style={{ ...card, borderColor: ok ? line : `${color}55` }}>
      <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
        <div>
          <div className="text-xs font-bold uppercase tracking-wider" style={{ color }}>
            Compliance
          </div>
          <div className="text-lg font-bold mt-0.5" style={{ color: ink }}>
            {ok ? "Compliant" : grace ? "In grace period: will become non-compliant soon" : state ? "Not compliant" : "Status unknown"}
          </div>
          <div className="text-xs mt-0.5" style={{ color: faint }}>
            {checkedAt ? `Details checked ${relTime(checkedAt)}` : "Details not checked yet"}
          </div>
        </div>
        <Button small onClick={recheck} disabled={busy}>
          {busy ? "Checking…" : "Recheck now"}
        </Button>
      </div>

      {!ok && list.length === 0 && (
        <p className="text-sm" style={{ color: dim }}>
          {checkedAt ? "Intune didn't report a failing setting. Press Sync in Actions, wait about 15 minutes, then recheck." : "Press Recheck now to see which settings are failing."}
        </p>
      )}

      {!ok && list.length > 0 && (
        <ol className="grid gap-3">
          {list.map((r, i) => (
            <li key={`${r.setting}-${i}`} className="text-sm pl-3" style={{ borderLeft: `3px solid ${r.state === "conflict" ? gold : rose}` }}>
              <div className="font-bold" style={{ color: ink }}>
                {r.title}
              </div>
              <div style={{ color: ink }}>{r.fix}</div>
              <div className="text-xs mt-0.5" style={{ color: faint }}>
                {r.policy}
                {r.currentValue ? ` · device reports: ${r.currentValue}` : ""}
                {r.detail ? ` · ${r.detail}` : ""}
              </div>
            </li>
          ))}
        </ol>
      )}

      {ok && (
        <p className="text-sm" style={{ color: dim }}>
          Meets every compliance policy assigned to it.
        </p>
      )}
      {err && (
        <div className="text-xs mt-2" style={{ color: rose }}>
          {err}
        </div>
      )}
    </section>
  );
}
