"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLanguage } from "@/lib/i18n/LanguageContext";

// Tab bar that groups several admin pages under one sidebar item
// (Reports hub, Revenue). Each tab is still its own route, so existing
// links and bookmarks keep working. `exact` tabs only light up on their
// own URL; the rest also match their sub-pages.
export type SectionTab = { href: string; labelKey: string; exact?: boolean };

export default function SectionTabs({ tabs, ariaLabel }: { tabs: SectionTab[]; ariaLabel: string }) {
  const pathname = usePathname();
  const { t } = useLanguage();
  if (tabs.length < 2) return null;

  // Longest matching href wins, so /admin/insights/reports/x lights up
  // "Standard reports" rather than "Programs" (/admin/insights).
  const activeHref = tabs
    .filter((tab) => pathname === tab.href || (!tab.exact && pathname.startsWith(tab.href + "/")))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;

  return (
    <nav
      aria-label={ariaLabel}
      style={{ display: "flex", gap: 4, borderBottom: "1px solid rgba(22,48,43,0.1)", marginBottom: 24, flexWrap: "wrap" }}
    >
      {tabs.map((tab) => {
        const active = tab.href === activeHref;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            style={{
              padding: "8px 14px",
              fontSize: 13,
              fontWeight: 600,
              marginBottom: -1,
              borderBottom: active ? "2px solid var(--portal-emerald)" : "2px solid transparent",
              color: active ? "var(--portal-emerald)" : "rgba(22,48,43,0.6)",
            }}
          >
            {t(tab.labelKey)}
          </Link>
        );
      })}
    </nav>
  );
}
