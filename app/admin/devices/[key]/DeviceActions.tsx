"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ACTION_LABELS, APPROVAL_ACTIONS, type DeviceAction } from "@/lib/devices/shared";
import { Button } from "../ui";
import { dim, faint, ink, line, rose } from "../style";

type Secret =
  | { type: "bitlocker"; keys: { id: string; key: string; createdAt: string | null; volumeType: string | null }[] }
  | { type: "laps"; account: string; password: string; backedUpAt: string | null };

type Pending = { kind: "secret"; type: "bitlocker" | "laps" } | { kind: "action"; action: DeviceAction };

const ACTION_HELP: Partial<Record<DeviceAction, string>> = {
  sync: "Tells the device to check in with Intune now.",
  restart: "Restarts the device right away. Unsaved work is lost.",
  lock: "Locks the screen remotely (phones and tablets; limited on Windows).",
  disable: "Blocks every sign-in to ICNA accounts from this device. Reversible.",
  enable: "Lets the device sign in again.",
  retire: "Removes ICNA data, apps and settings; personal data stays. Needs a second IT approval.",
  wipe: "Factory-resets the device. Everything on it is erased. Needs a second IT approval.",
};

export default function DeviceActions({
  deviceKey,
  hasEntra,
  hasIntune,
  isWindows,
  enabled,
  pendingActions,
}: {
  deviceKey: string;
  hasEntra: boolean;
  hasIntune: boolean;
  isWindows: boolean;
  enabled: boolean;
  pendingActions: string[];
}) {
  const router = useRouter();
  const [ask, setAsk] = useState<Pending | null>(null);
  const [reason, setReason] = useState("");
  const [ticket, setTicket] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [secret, setSecret] = useState<Secret | null>(null);

  // Secrets disappear from the screen after 2 minutes.
  useEffect(() => {
    if (!secret) return;
    const t = setTimeout(() => setSecret(null), 120_000);
    return () => clearTimeout(t);
  }, [secret]);

  function open(p: Pending) {
    setAsk(p);
    setReason("");
    setTicket("");
    setErr(null);
    setMsg(null);
  }

  async function submit() {
    if (!ask) return;
    setBusy(true);
    setErr(null);
    try {
      if (ask.kind === "secret") {
        const res = await fetch(`/api/devices/${encodeURIComponent(deviceKey)}/secret`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type: ask.type, reason, ticket_ref: ticket }),
        });
        const d = await res.json();
        if (!res.ok) throw new Error(d.error ?? "Couldn't get it");
        setSecret(ask.type === "bitlocker" ? { type: "bitlocker", keys: d.keys ?? [] } : { type: "laps", account: d.account, password: d.password, backedUpAt: d.backedUpAt });
      } else {
        const res = await fetch(`/api/devices/${encodeURIComponent(deviceKey)}/action`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: ask.action, reason, ticket_ref: ticket }),
        });
        const d = await res.json();
        if (!res.ok) throw new Error(d.error ?? "Action failed");
        setMsg(d.requested ? "Request sent. Another IT person needs to approve it." : `${ACTION_LABELS[ask.action]} sent.`);
      }
      setAsk(null);
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  const actions: DeviceAction[] = [
    ...(hasIntune ? (["sync", "restart", "lock"] as DeviceAction[]) : []),
    ...(hasEntra ? [enabled ? ("disable" as const) : ("enable" as const)] : []),
    ...(hasIntune ? (["retire", "wipe"] as DeviceAction[]) : []),
  ];

  const field = "w-full rounded-xl px-3 py-2 text-sm bg-white outline-none";

  return (
    <div className="grid gap-4">
      <div>
        <div className="text-xs mb-2" style={{ color: dim }}>
          Recovery secrets: fetched live from Microsoft, never stored, and every look is logged.
        </div>
        <div className="flex flex-wrap gap-2">
          <Button small onClick={() => open({ kind: "secret", type: "bitlocker" })} disabled={!hasEntra}>
            Show BitLocker key
          </Button>
          {isWindows && (
            <Button small onClick={() => open({ kind: "secret", type: "laps" })} disabled={!hasEntra}>
              Show local admin password
            </Button>
          )}
        </div>
      </div>

      {secret && (
        <div className="rounded-xl p-3 text-sm" style={{ background: "#FFFBEA", border: "1px solid #E9D48A" }}>
          {secret.type === "bitlocker" ? (
            secret.keys.length ? (
              secret.keys.map((k) => (
                <div key={k.id} className="mb-2 last:mb-0">
                  <div className="text-xs" style={{ color: dim }}>
                    Key ID {k.id.slice(0, 8)} · {k.volumeType ?? "volume"} · {k.createdAt ? new Date(k.createdAt).toLocaleDateString() : ""}
                  </div>
                  <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 15, letterSpacing: "0.02em", userSelect: "all", wordBreak: "break-all", color: ink }}>{k.key}</div>
                </div>
              ))
            ) : (
              <span>No BitLocker keys are saved in Entra for this device. Make sure BitLocker is set to back up keys to Entra ID.</span>
            )
          ) : (
            <div>
              <div className="text-xs" style={{ color: dim }}>
                Account <b>{secret.account}</b>
                {secret.backedUpAt ? ` · rotated ${new Date(secret.backedUpAt).toLocaleString()}` : ""}
              </div>
              <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 15, userSelect: "all", wordBreak: "break-all", color: ink }}>{secret.password}</div>
            </div>
          )}
          <div className="flex justify-between items-center mt-2">
            <span className="text-[11px]" style={{ color: faint }}>
              Hides itself in 2 minutes.
            </span>
            <button type="button" className="text-xs underline cursor-pointer" style={{ color: dim }} onClick={() => setSecret(null)}>
              Hide now
            </button>
          </div>
        </div>
      )}

      <div>
        <div className="text-xs mb-2" style={{ color: dim }}>
          {hasIntune ? "Remote actions" : "Device not in Intune: only Entra actions are available."}
        </div>
        <div className="flex flex-wrap gap-2">
          {actions.map((a) => (
            <Button
              key={a}
              small
              variant={a === "wipe" || a === "retire" || a === "disable" ? "danger" : "ghost"}
              onClick={() => open({ kind: "action", action: a })}
              disabled={pendingActions.includes(a)}
            >
              {pendingActions.includes(a) ? `${ACTION_LABELS[a]} (pending)` : ACTION_LABELS[a]}
            </Button>
          ))}
        </div>
      </div>

      {msg && (
        <div className="text-sm" style={{ color: "#1F6F54" }}>
          {msg}
        </div>
      )}

      {ask && (
        <div className="rounded-xl p-3 grid gap-2" style={{ border: `1.5px solid ${line}`, background: "rgba(22,48,43,0.02)" }}>
          <div className="text-sm font-bold" style={{ color: ask.kind === "action" && (ask.action === "wipe" || ask.action === "retire") ? rose : ink }}>
            {ask.kind === "secret" ? (ask.type === "bitlocker" ? "Show BitLocker recovery key" : "Show local admin password") : ACTION_LABELS[ask.action]}
          </div>
          {ask.kind === "action" && ACTION_HELP[ask.action] && (
            <div className="text-xs" style={{ color: dim }}>
              {ACTION_HELP[ask.action]}
            </div>
          )}
          {!(ask.kind === "action" && ask.action === "sync") && (
            <>
              <input
                autoFocus
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder={ask.kind === "secret" ? "Why? e.g. user stuck at BitLocker screen after BIOS update" : "Reason (required)"}
                className={field}
                style={{ border: `1.5px solid ${line}` }}
              />
              <input value={ticket} onChange={(e) => setTicket(e.target.value)} placeholder="Ticket # (optional)" className={field} style={{ border: `1.5px solid ${line}` }} />
            </>
          )}
          {ask.kind === "action" && APPROVAL_ACTIONS.includes(ask.action) && (
            <div className="text-xs font-semibold" style={{ color: rose }}>
              This creates a request. It runs only after a different IT person approves it.
            </div>
          )}
          {err && (
            <div className="text-xs" style={{ color: rose }}>
              {err}
            </div>
          )}
          <div className="flex gap-2">
            <Button
              small
              variant={ask.kind === "action" && (ask.action === "wipe" || ask.action === "retire" || ask.action === "disable") ? "danger" : "primary"}
              onClick={submit}
              disabled={busy || (!(ask.kind === "action" && ask.action === "sync") && reason.trim().length < 5)}
            >
              {busy ? "Working…" : ask.kind === "secret" ? "Show" : ask.kind === "action" && APPROVAL_ACTIONS.includes(ask.action) ? "Request approval" : "Confirm"}
            </Button>
            <Button small onClick={() => setAsk(null)} disabled={busy}>
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
