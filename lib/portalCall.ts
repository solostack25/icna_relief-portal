"use client";

// Client side of portal calling. Every "Call" button goes through
// placePortalCall() so the call bar (components/PortalCallBar) can show and
// control the call, and so the 3CX web client gets opened as the "phone"
// when the employee has nothing signed in on their extension.

export type CallTarget = {
  toNumber: string;
  toName?: string;
  targetType: "client" | "contact" | "employee" | "manual";
  targetId?: string;
};

export type CallConfig = {
  extension: string | null;
  connected?: boolean;
  webclientUrl?: string;
  hasDevice?: boolean | null;
};

export type CallEvent =
  | { type: "starting"; target: CallTarget }
  | { type: "placed"; target: CallTarget; logId: string | null }
  | { type: "failed"; target: CallTarget; error: string; code?: string; logId: string | null };

const EVENT = "portal-call";
const PHONE_WINDOW = "icna-3cx-phone";

let config: CallConfig | null = null;
let configAt = 0;
let inflight: Promise<CallConfig | null> | null = null;

export async function loadCallConfig(force = false): Promise<CallConfig | null> {
  if (!force && config && Date.now() - configAt < 120_000) return config;
  if (inflight) return inflight;
  inflight = fetch("/api/calling/my-call?mode=config", { cache: "no-store" })
    .then(async (r) => (r.ok ? ((await r.json()) as CallConfig) : null))
    .catch(() => null)
    .then((c) => {
      if (c) {
        config = c;
        configAt = Date.now();
      }
      inflight = null;
      return c;
    });
  return inflight;
}

export function getCallConfig() {
  return config;
}

function isTouchDevice() {
  return typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)").matches;
}

/**
 * Opens the 3CX web client in a small window, or brings back the one that's
 * already open WITHOUT reloading it (a reload would drop a live call).
 * Must run inside a click handler or the browser blocks the popup.
 * Returns false if there's no URL or the popup was blocked.
 */
export function openPhoneWindow(focusPhone = false): boolean {
  const url = config?.webclientUrl;
  if (!url || typeof window === "undefined") return false;
  const w = window.open("", PHONE_WINDOW, "popup,width=420,height=720");
  if (!w) return false;
  let fresh = false;
  try {
    // Same-origin blank page = newly created; cross-origin = 3CX already loaded.
    fresh = w.location.href === "about:blank";
  } catch {
    fresh = false;
  }
  if (fresh) w.location.href = url;
  if (focusPhone) w.focus();
  else {
    try {
      window.focus();
    } catch {}
  }
  return true;
}

function emit(e: CallEvent) {
  window.dispatchEvent(new CustomEvent<CallEvent>(EVENT, { detail: e }));
}

export function onPortalCall(handler: (e: CallEvent) => void) {
  const fn = (e: Event) => handler((e as CustomEvent<CallEvent>).detail);
  window.addEventListener(EVENT, fn);
  return () => window.removeEventListener(EVENT, fn);
}

/**
 * Place a call from the signed-in employee's extension. Call this directly
 * from the click handler (not after an await) so the phone window can open.
 * forcePhone: open the 3CX web client even if a device looks signed in.
 */
export async function placePortalCall(
  target: CallTarget,
  opts: { forcePhone?: boolean } = {}
): Promise<{ ok: boolean; error?: string; code?: string }> {
  let openedPhone = false;
  const needsPhone = opts.forcePhone || config?.hasDevice === false;
  if (needsPhone && !isTouchDevice()) openedPhone = openPhoneWindow();

  emit({ type: "starting", target });
  try {
    const res = await fetch("/api/calling/click-to-call", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...target, waitForDevice: openedPhone }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const error = data.error ?? "Call failed";
      if (data.code === "no_device" && config) config.hasDevice = false;
      emit({ type: "failed", target, error, code: data.code, logId: data.logId ?? null });
      return { ok: false, error, code: data.code };
    }
    if (config) config.hasDevice = true;
    emit({ type: "placed", target, logId: data.logId ?? null });
    return { ok: true };
  } catch {
    emit({ type: "failed", target, error: "Couldn't reach the portal. Check your connection.", logId: null });
    return { ok: false, error: "Network error" };
  }
}
