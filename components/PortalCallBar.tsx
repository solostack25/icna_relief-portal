"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import {
  getCallConfig,
  loadCallConfig,
  onPortalCall,
  openPhoneWindow,
  placePortalCall,
  type CallTarget,
} from "@/lib/portalCall";
import type { MyCallParticipant } from "@/lib/threecx";

// Floating call bar: shows any call placed from the portal (client profile,
// contacts, donor calling, Portal Assistant) and lets staff hang up or
// transfer it without touching the 3CX app. Audio still runs through the
// employee's 3CX device - usually the 3CX web client the portal opens.

const LIVE_POLL_MS = 1500;
const PROBE_MS = 12_000;
const NO_ANSWER_GIVE_UP_MS = 45_000;

type CallBarState =
  | {
      kind: "call";
      target: CallTarget;
      phase: "starting" | "ringing" | "connected" | "ended";
      startedAt: number;
      connectedAt?: number;
      sawParticipant: boolean;
      participants: MyCallParticipant[];
      endNote?: string;
    }
  | { kind: "error"; target: CallTarget; error: string; noDevice: boolean };

function isExcludedPath(pathname: string | null) {
  if (!pathname || pathname === "/") return true;
  return ["/inkind", "/finance-approvals/", "/volunteer/public/", "/login", "/auth"].some((p) => pathname.startsWith(p));
}

function fmt(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function isTouch() {
  return typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)").matches;
}

type ProbeLog = {
  id: string;
  status: string;
  error: string | null;
  target_type: CallTarget["targetType"] | null;
  target_id: string | null;
  target_name: string | null;
  target_number: string | null;
  created_at: string;
};

const targetFromLog = (l: ProbeLog): CallTarget => ({
  toNumber: l.target_number ?? "",
  toName: l.target_name ?? undefined,
  targetType: l.target_type ?? "manual",
  targetId: l.target_id ?? undefined,
});

export default function PortalCallBar() {
  const pathname = usePathname();
  const excluded = isExcludedPath(pathname);
  const [enabled, setEnabled] = useState(false);
  const [bar, setBar] = useState<CallBarState | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [showTransfer, setShowTransfer] = useState(false);
  const [transferTo, setTransferTo] = useState("");
  const [, setTick] = useState(0);
  const barRef = useRef<CallBarState | null>(null);
  const seenLogs = useRef(new Set<string>());
  barRef.current = bar;

  const startCall = useCallback((target: CallTarget, startedAt = Date.now()) => {
    setActionError(null);
    setShowTransfer(false);
    setBar({ kind: "call", target, phase: "starting", startedAt, sawParticipant: false, participants: [] });
  }, []);

  // Turn on only for signed-in staff with a 3CX extension and 3CX connected.
  useEffect(() => {
    if (excluded) return;
    let cancelled = false;
    loadCallConfig().then(async (c) => {
      if (cancelled || !c?.extension || !c.connected) return;
      setEnabled(true);
      // Page reloaded mid-call? Pick the call back up.
      const r = await fetch("/api/calling/my-call?mode=live", { cache: "no-store" }).catch(() => null);
      const d = r?.ok ? await r.json() : null;
      const p: MyCallParticipant[] = d?.participants ?? [];
      if (!cancelled && p.length && !barRef.current) {
        startCall({ toNumber: p[0].partyNumber ?? "", toName: p[0].partyName ?? undefined, targetType: "manual" });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [excluded, startCall]);

  // Calls placed from buttons in this tab.
  useEffect(
    () =>
      onPortalCall((e) => {
        if (e.type === "starting") startCall(e.target);
        if (e.type === "placed" && e.logId) seenLogs.current.add(e.logId);
        if (e.type === "failed") {
          if (e.logId) seenLogs.current.add(e.logId);
          setBar({ kind: "error", target: e.target, error: e.error, noDevice: e.code === "no_device" });
        }
      }),
    [startCall]
  );

  // Calls the Portal Assistant placed (server side) - cheap DB probe.
  useEffect(() => {
    if (!enabled || excluded) return;
    const probe = async () => {
      if (document.visibilityState !== "visible" || barRef.current?.kind === "call") return;
      const r = await fetch("/api/calling/my-call?mode=probe", { cache: "no-store" }).catch(() => null);
      const log: ProbeLog | null = r?.ok ? (await r.json()).log : null;
      if (!log || seenLogs.current.has(log.id)) return;
      seenLogs.current.add(log.id);
      if (log.status === "initiated") startCall(targetFromLog(log), new Date(log.created_at).getTime());
      else if (log.status === "failed") {
        const noDevice = (log.error ?? "").startsWith("no_device:");
        setBar({
          kind: "error",
          target: targetFromLog(log),
          error: noDevice ? "No phone is signed in on your extension." : log.error ?? "Call failed",
          noDevice,
        });
      }
    };
    probe();
    const id = setInterval(probe, PROBE_MS);
    return () => clearInterval(id);
  }, [enabled, excluded, startCall]);

  // Live call state from 3CX while a call is up.
  const live = bar?.kind === "call" && bar.phase !== "ended";
  useEffect(() => {
    if (!live) return;
    let stop = false;
    const poll = async () => {
      const r = await fetch("/api/calling/my-call?mode=live", { cache: "no-store" }).catch(() => null);
      if (stop || !r?.ok) return;
      const parts: MyCallParticipant[] = (await r.json()).participants ?? [];
      setBar((b) => {
        if (!b || b.kind !== "call" || b.phase === "ended") return b;
        if (parts.length) {
          const connected = parts.some((p) => /connect/i.test(p.status));
          return {
            ...b,
            participants: parts,
            sawParticipant: true,
            phase: connected ? "connected" : "ringing",
            connectedAt: connected ? b.connectedAt ?? Date.now() : b.connectedAt,
            target: b.target.toNumber ? b.target : { ...b.target, toNumber: parts[0].partyNumber ?? "", toName: parts[0].partyName ?? undefined },
          };
        }
        if (b.sawParticipant) return { ...b, participants: [], phase: "ended", endNote: b.endNote ?? "Call ended" };
        if (Date.now() - b.startedAt > NO_ANSWER_GIVE_UP_MS) {
          return { kind: "error", target: b.target, error: "The call didn't start. Make sure your phone window is open and signed in.", noDevice: true };
        }
        return b;
      });
    };
    poll();
    const id = setInterval(poll, LIVE_POLL_MS);
    const tick = setInterval(() => setTick((t) => t + 1), 1000);
    return () => {
      stop = true;
      clearInterval(id);
      clearInterval(tick);
    };
  }, [live]);

  // Fade out after the call ends.
  useEffect(() => {
    if (bar?.kind !== "call" || bar.phase !== "ended") return;
    const id = setTimeout(() => setBar(null), 3500);
    return () => clearTimeout(id);
  }, [bar]);

  const act = async (action: "drop" | "transfer") => {
    if (bar?.kind !== "call") return;
    const p = bar.participants[0];
    if (!p) return;
    setBusy(action);
    setActionError(null);
    try {
      const ids = action === "drop" ? bar.participants.map((x) => x.id) : [p.id];
      for (const participantId of ids) {
        const r = await fetch("/api/calling/my-call", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action, participantId, destination: transferTo }),
        });
        if (!r.ok && r.status !== 404) throw new Error((await r.json().catch(() => ({}))).error ?? "Something went wrong");
      }
      setShowTransfer(false);
      setBar((b) =>
        b?.kind === "call" ? { ...b, phase: "ended", participants: [], endNote: action === "drop" ? "Call ended" : `Transferred to ${transferTo}` } : b
      );
      setTransferTo("");
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(null);
    }
  };

  if (!enabled || excluded || !bar) return null;

  const name = bar.target.toName || bar.target.toNumber || "Call";
  const webclientUrl = getCallConfig()?.webclientUrl;
  const statusText =
    bar.kind === "error"
      ? bar.error
      : bar.phase === "starting"
        ? "Starting call…"
        : bar.phase === "ringing"
          ? "Ringing…"
          : bar.phase === "connected"
            ? `Connected · ${fmt(Date.now() - (bar.connectedAt ?? Date.now()))}`
            : bar.endNote;
  const dot =
    bar.kind === "error" ? "#e8a598" : bar.kind === "call" && bar.phase === "connected" ? "#7ee2b0" : bar.kind === "call" && bar.phase === "ended" ? "#c8d1cc" : "#e9ce3f";

  const btn = "rounded-full px-4 py-2 text-sm font-semibold disabled:opacity-50 transition-opacity";

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed z-[60] left-1/2 -translate-x-1/2"
      style={{
        bottom: "calc(var(--mobile-tabbar-h, 0px) + 16px + env(safe-area-inset-bottom))",
        width: "min(600px, calc(100vw - 24px))",
      }}
    >
      <div
        className="rounded-2xl px-4 py-3 text-white"
        style={{ background: "var(--color-brand-dark, #154a38)", boxShadow: "0 12px 32px rgba(22,48,43,0.28)" }}
      >
        <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <span
              aria-hidden
              className={bar.kind === "call" && (bar.phase === "ringing" || bar.phase === "starting") ? "animate-pulse" : ""}
              style={{ width: 10, height: 10, borderRadius: 999, background: dot, flexShrink: 0 }}
            />
            <div className="min-w-0">
              <div className="truncate font-semibold" style={{ fontFamily: "Fraunces, serif", fontStyle: "italic", fontSize: 17 }}>
                {name}
              </div>
              <div className="truncate text-xs" style={{ color: "rgba(255,255,255,0.75)" }}>
                {bar.target.toName && bar.target.toNumber ? `${bar.target.toNumber} · ` : ""}
                {statusText}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {bar.kind === "call" && bar.phase !== "ended" && (
              <>
                {webclientUrl && !isTouch() && (
                  <button className={btn} style={{ background: "rgba(255,255,255,0.12)" }} onClick={() => openPhoneWindow(true)} title="Show the 3CX phone window">
                    Phone
                  </button>
                )}
                {bar.phase === "connected" && (
                  <button
                    className={btn}
                    style={{ background: "rgba(255,255,255,0.12)" }}
                    onClick={() => setShowTransfer((v) => !v)}
                    disabled={!!busy}
                  >
                    Transfer
                  </button>
                )}
                <button
                  className={btn}
                  style={{ background: "#c4472f" }}
                  onClick={() => act("drop")}
                  disabled={!!busy || bar.participants.length === 0}
                >
                  {busy === "drop" ? "Hanging up…" : "Hang up"}
                </button>
              </>
            )}

            {bar.kind === "error" && (
              <>
                {bar.noDevice && bar.target.toNumber && !isTouch() && webclientUrl && (
                  <button
                    className={btn}
                    style={{ background: "var(--color-accent-orange, #c99a3d)", color: "#16302b" }}
                    onClick={() => placePortalCall(bar.target, { forcePhone: true })}
                  >
                    Open phone &amp; call
                  </button>
                )}
                {bar.noDevice && isTouch() && (
                  <a className={btn} style={{ background: "var(--color-accent-orange, #c99a3d)", color: "#16302b" }} href={webclientUrl ?? "#"} target="_blank" rel="noreferrer">
                    Open 3CX
                  </a>
                )}
                {bar.target.toNumber && (!bar.noDevice || isTouch()) && (
                  <button className={btn} style={{ background: "rgba(255,255,255,0.12)" }} onClick={() => placePortalCall(bar.target)}>
                    Try again
                  </button>
                )}
                <button className={btn} style={{ background: "rgba(255,255,255,0.12)" }} onClick={() => setBar(null)} aria-label="Dismiss">
                  ✕
                </button>
              </>
            )}
          </div>
        </div>

        {bar.kind === "call" && showTransfer && bar.phase === "connected" && (
          <form
            className="mt-3 flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              act("transfer");
            }}
          >
            <input
              autoFocus
              inputMode="tel"
              value={transferTo}
              onChange={(e) => setTransferTo(e.target.value)}
              placeholder="Extension or phone number"
              className="min-w-0 flex-1 rounded-full px-4 py-2 text-sm"
              style={{ background: "#fff", color: "#16302b" }}
            />
            <button className={btn} style={{ background: "var(--color-accent-orange, #c99a3d)", color: "#16302b" }} disabled={!transferTo.trim() || !!busy}>
              {busy === "transfer" ? "Transferring…" : "Transfer"}
            </button>
          </form>
        )}

        {actionError && <p className="mt-2 text-xs" style={{ color: "#f6c9bf" }}>{actionError}</p>}
      </div>
    </div>
  );
}
