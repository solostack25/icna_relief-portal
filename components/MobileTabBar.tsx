"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import PortalAssistantBoundary from "@/components/PortalAssistant/PortalAssistantBoundary";

const PortalAssistantPanel = dynamic(() => import("@/components/PortalAssistant/PortalAssistantPanel"), {
  ssr: false,
  loading: () => null,
});

// Phone-only bottom navigation for the installed app (PWA). Hidden at
// sm and up, where the home page has the ask bar instead. The center
// button opens the Portal Assistant full screen.
//
// Add it to a page with <MobileTabBar active="..." />; it renders its own
// spacer so the page's last content isn't hidden behind the bar.

export type TabKey = "home" | "tickets" | "time" | "more";

const MORE_LINKS: { href: string; label: string; adminOnly?: boolean }[] = [
  { href: "/mileage", label: "Mileage" },
  { href: "/training", label: "Training" },
  { href: "/directory", label: "Employee Directory" },
  { href: "/calendar", label: "Calendar" },
  { href: "/finance-tickets", label: "Finance Tickets" },
  { href: "/volunteer", label: "Volunteer" },
  { href: "/resources", label: "Resources" },
  { href: "/admin", label: "Admin Portal", adminOnly: true },
];

const BAR_H = 72;

export default function MobileTabBar({ active, showAdmin = false }: { active?: TabKey; showAdmin?: boolean }) {
  const [askOpen, setAskOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);

  // Lets other fixed bottom UI (the install prompt) sit above the bar.
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 639.98px)");
    const apply = () => document.documentElement.style.setProperty("--mobile-tabbar-h", mq.matches ? `${BAR_H}px` : "0px");
    apply();
    mq.addEventListener("change", apply);
    return () => {
      mq.removeEventListener("change", apply);
      document.documentElement.style.removeProperty("--mobile-tabbar-h");
    };
  }, []);

  useEffect(() => {
    if (!askOpen && !moreOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setAskOpen(false);
        setMoreOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [askOpen, moreOpen]);

  return (
    <>
      <div aria-hidden className="sm:hidden" style={{ height: `calc(${BAR_H + 16}px + env(safe-area-inset-bottom))` }} />

      <nav
        aria-label="App"
        className="sm:hidden fixed inset-x-0 bottom-0 z-40 flex items-end justify-around px-2"
        style={{
          background: "#fff",
          borderTop: "1px solid var(--portal-line)",
          paddingBottom: "calc(6px + env(safe-area-inset-bottom))",
          paddingTop: 6,
          boxShadow: "0 -6px 20px rgba(22,48,43,0.06)",
        }}
      >
        <Tab href="/select-app" label="Home" on={active === "home"} icon={<path d="M4 11l8-7 8 7v9H4z" />} />
        <Tab
          href="/helpdesk"
          label="Tickets"
          on={active === "tickets"}
          icon={<path d="M4 7h16v3a2 2 0 000 4v3H4v-3a2 2 0 000-4z" />}
        />
        <button
          type="button"
          onClick={() => setAskOpen(true)}
          aria-haspopup="dialog"
          className="flex flex-col items-center gap-0.5 text-[11px] font-semibold"
          style={{ minWidth: 64, marginTop: -26, color: "var(--portal-emerald)" }}
        >
          <span
            className="flex items-center justify-center rounded-full"
            style={{
              width: 58,
              height: 58,
              border: "4px solid #fff",
              background: "var(--portal-emerald)",
              color: "var(--portal-gold-soft)",
              boxShadow: "0 8px 20px rgba(31,111,84,0.32)",
            }}
          >
            <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" aria-hidden>
              <path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z" />
              <path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z" />
            </svg>
          </span>
          Ask
        </button>
        <Tab
          href="/time"
          label="Time"
          on={active === "time"}
          icon={
            <>
              <circle cx="12" cy="12" r="8.5" />
              <path d="M12 7.5V12l3 2" />
            </>
          }
        />
        <button
          type="button"
          onClick={() => setMoreOpen(true)}
          aria-haspopup="dialog"
          className="flex flex-col items-center justify-center gap-0.5 text-[11px]"
          style={{ minWidth: 64, minHeight: 48, color: active === "more" ? "var(--portal-emerald)" : "rgba(22,48,43,0.7)", fontWeight: active === "more" ? 600 : 400 }}
        >
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
            <path d="M5 7h14M5 12h14M5 17h14" />
          </svg>
          More
        </button>
      </nav>

      {askOpen && (
        <div className="sm:hidden fixed inset-0 z-[70] flex flex-col" style={{ background: "#fff" }}>
          <PortalAssistantBoundary onClose={() => setAskOpen(false)}>
            <PortalAssistantPanel variant="sheet" onClose={() => setAskOpen(false)} />
          </PortalAssistantBoundary>
        </div>
      )}

      {moreOpen && (
        <div className="sm:hidden fixed inset-0 z-[70] flex items-end" role="dialog" aria-modal="true" aria-label="More">
          <button
            type="button"
            aria-label="Close"
            className="absolute inset-0 cursor-default"
            style={{ background: "rgba(22,48,43,0.45)" }}
            onClick={() => setMoreOpen(false)}
          />
          <div
            className="relative w-full rounded-t-3xl px-4 pt-3"
            style={{ background: "var(--portal-sand)", paddingBottom: "calc(20px + env(safe-area-inset-bottom))" }}
          >
            <div className="mx-auto mb-3 h-1.5 w-10 rounded-full" style={{ background: "var(--portal-line)" }} aria-hidden />
            <div className="grid grid-cols-2 gap-2">
              {MORE_LINKS.filter((l) => !l.adminOnly || showAdmin).map((l) => (
                <Link
                  key={l.href}
                  href={l.href}
                  onClick={() => setMoreOpen(false)}
                  className="flex items-center rounded-2xl bg-white px-4 text-sm font-semibold"
                  style={{ minHeight: 52, border: "1px solid var(--portal-line)", color: "var(--portal-ink)" }}
                >
                  {l.label}
                </Link>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function Tab({ href, label, on, icon }: { href: string; label: string; on: boolean; icon: React.ReactNode }) {
  return (
    <Link
      href={href}
      aria-current={on ? "page" : undefined}
      className="flex flex-col items-center justify-center gap-0.5 text-[11px]"
      style={{ minWidth: 64, minHeight: 48, color: on ? "var(--portal-emerald)" : "rgba(22,48,43,0.7)", fontWeight: on ? 600 : 400 }}
    >
      <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        {icon}
      </svg>
      {label}
    </Link>
  );
}
