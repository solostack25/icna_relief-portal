"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

// Phone app (PWA) support:
//  1. Registers /sw.js (offline page + push notifications).
//  2. Shows a one-line "install the app" tip on phones that aren't already
//     using the installed app:
//       • Android/Chrome: an Install button (the browser's own prompt).
//       • iPhone/iPad Safari: how to do Share → Add to Home Screen, since
//         iOS has no install prompt.
//     Dismissing hides it for 30 days.

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

const DISMISS_KEY = "icna-pwa-install-dismissed-at";
const DISMISS_DAYS = 30;

// Pages used by the public / on kiosks: no install tip there.
const NO_TIP_PREFIXES = ["/volunteer/public", "/inkind", "/speaker-portal", "/speaker-requests/approve", "/finance-approvals/"];

function isStandalone() {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    // iOS Safari's own flag for home-screen apps
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function isIosSafari() {
  const ua = navigator.userAgent;
  const iOS = /iPhone|iPad|iPod/.test(ua) || (ua.includes("Macintosh") && navigator.maxTouchPoints > 1);
  // Chrome/Firefox/Edge on iOS can also add to home screen now, but the
  // steps differ; Safari is what nearly everyone uses.
  const safari = /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua);
  return iOS && safari;
}

function recentlyDismissed() {
  try {
    const at = Number(localStorage.getItem(DISMISS_KEY) || 0);
    return at > 0 && Date.now() - at < DISMISS_DAYS * 24 * 60 * 60 * 1000;
  } catch {
    return false;
  }
}

export default function PwaSetup() {
  const pathname = usePathname() || "/";
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [showIosTip, setShowIosTip] = useState(false);
  const [hidden, setHidden] = useState(true);

  // Service worker (production only, so local dev never serves stale code).
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {
      /* not fatal: the portal works the same without it */
    });
  }, []);

  useEffect(() => {
    if (isStandalone() || recentlyDismissed()) return;
    const isPhone = window.matchMedia?.("(max-width: 900px)").matches;

    const onPrompt = (e: Event) => {
      e.preventDefault(); // we show our own, quieter tip instead of Chrome's mini-bar
      setInstallEvent(e as BeforeInstallPromptEvent);
      if (isPhone) setHidden(false);
    };
    const onInstalled = () => {
      setInstallEvent(null);
      setHidden(true);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);

    if (isPhone && isIosSafari()) {
      setShowIosTip(true);
      setHidden(false);
    }
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  function dismiss() {
    setHidden(true);
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {
      /* private mode: just hide for now */
    }
  }

  async function install() {
    if (!installEvent) return;
    await installEvent.prompt();
    const { outcome } = await installEvent.userChoice.catch(() => ({ outcome: "dismissed" as const }));
    setInstallEvent(null);
    if (outcome === "accepted") setHidden(true);
    else dismiss();
  }

  const onPublicPage = pathname === "/" ? false : NO_TIP_PREFIXES.some((p) => pathname.startsWith(p));
  if (hidden || onPublicPage || (!installEvent && !showIosTip)) return null;

  return (
    <div
      role="dialog"
      aria-label="Install the ICNA Relief app"
      className="fixed inset-x-3 z-[60] flex items-center gap-3 rounded-2xl border border-[var(--color-border)] bg-white px-4 py-3 shadow-[0_10px_30px_rgba(18,59,45,0.18)]"
      style={{ bottom: "calc(12px + env(safe-area-inset-bottom))" }}
    >
      <img src="/icons/icon-192.png" alt="" className="h-10 w-10 shrink-0 rounded-xl" />
      <div className="min-w-0 flex-1 text-[13px] leading-snug text-[var(--color-text)]">
        <div className="font-semibold">Get the ICNA Relief app</div>
        {installEvent ? (
          <div className="text-[var(--color-text-dim)]">Add the portal to your home screen.</div>
        ) : (
          <div className="text-[var(--color-text-dim)]">
            Tap <ShareIcon /> <span className="font-semibold">Share</span>, then{" "}
            <span className="font-semibold">Add to Home Screen</span>.
          </div>
        )}
      </div>
      {installEvent && (
        <button
          onClick={install}
          className="shrink-0 rounded-full bg-[var(--color-accent)] px-4 py-2 text-[13px] font-bold text-white"
        >
          Install
        </button>
      )}
      <button
        onClick={dismiss}
        aria-label="Not now"
        className="shrink-0 rounded-full px-2 py-1 text-lg leading-none text-[var(--color-text-dim)]"
      >
        ×
      </button>
    </div>
  );
}

function ShareIcon() {
  // iOS "share" glyph (box with an up arrow), inline with the text
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" className="inline -mt-0.5 align-middle">
      <path
        d="M12 3v12M12 3l-4 4M12 3l4 4M6 11H5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1h-1"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
