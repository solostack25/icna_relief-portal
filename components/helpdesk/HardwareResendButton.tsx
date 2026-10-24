"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const OUTCOMES: Record<string, string> = {
  reminded: "Reminder sent.",
  started: "Sent to the direct supervisor.",
  escalated: "Sent to the CIO and CSO.",
  approved: "Nothing left to approve, so it's now approved.",
  stuck: "Still can't route it. Check the latest history note.",
  already_started: "Already with an approver.",
  already_escalated: "Already with the CIO and CSO.",
};

export default function HardwareResendButton({ legId, tone, stuck }: { legId: string; tone: "quest" | "plain"; stuck: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function resend() {
    setBusy(true);
    setMsg(null);
    const res = await fetch("/api/helpdesk/hardware-approval", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ legId, action: "resend" }),
    });
    const body = await res.json().catch(() => ({}));
    setBusy(false);
    setMsg(res.ok ? OUTCOMES[body.outcome] ?? "Done." : body.error ?? "Couldn't re-send.");
    router.refresh();
  }

  const quest = tone === "quest";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
      <button
        onClick={resend}
        disabled={busy}
        className={
          quest
            ? "text-xs px-3 py-1.5 rounded-lg border border-[#4A3B7A] text-[#B5A8E8] hover:border-[#FF3EA5] disabled:opacity-50 cursor-pointer"
            : "text-xs px-3 py-1.5 rounded-lg border border-[var(--color-border)] hover:border-[var(--color-accent)] disabled:opacity-50 cursor-pointer"
        }
      >
        {busy ? "Sending…" : stuck ? "Re-route approval" : "Send a reminder"}
      </button>
      {msg && <span style={{ fontSize: 12, color: quest ? "#9C8FD9" : "var(--color-text-dim)" }}>{msg}</span>}
    </div>
  );
}
