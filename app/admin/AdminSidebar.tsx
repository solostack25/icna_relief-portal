"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { AdminAccess } from "@/lib/adminAccess";
import { useLanguage } from "@/lib/i18n/LanguageContext";
import { HUBS, MARKETING_PREFIXES, MARKETING_TABS, type HubKey } from "@/lib/adminNav";

const ICONS: Record<string, React.ReactNode> = {
  dashboard: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="3" width="7" height="9" rx="1" />
      <rect x="14" y="3" width="7" height="5" rx="1" />
      <rect x="14" y="12" width="7" height="9" rx="1" />
      <rect x="3" y="16" width="7" height="5" rx="1" />
    </svg>
  ),
  tickets: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M9 11l3 3L22 4" />
      <path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" />
    </svg>
  ),
  workload: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M4 20V10M12 20V4M20 20v-7" />
    </svg>
  ),
  finance: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 3" />
    </svg>
  ),
  fliers: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="4" y="2" width="16" height="20" rx="2" />
      <path d="M8 8h8M8 12h8M8 16h5" />
    </svg>
  ),
  library: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <path d="M21 15l-5-5L5 21" />
    </svg>
  ),
  contentFolders: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
      <path d="M17 8l-5-5-5 5M12 3v12" />
    </svg>
  ),
  inkind: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M21 8l-9-5-9 5 9 5 9-5zM3 8v8l9 5 9-5V8M12 13v8" />
    </svg>
  ),
  review: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M22 11.08V12a10 10 0 11-5.93-9.14" />
      <path d="M22 4L12 14.01l-3-3" />
    </svg>
  ),
  training: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M22 10L12 5 2 10l10 5 10-5z" />
      <path d="M6 12v5c0 1.5 2.5 3 6 3s6-1.5 6-3v-5" />
    </svg>
  ),
  addEmployee: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="9" cy="8" r="4" />
      <path d="M2 21c0-4 3-7 7-7s7 3 7 7M18 8v6M15 11h6" />
    </svg>
  ),
  mappings: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M9 17H7a5 5 0 010-10h2M15 7h2a5 5 0 010 10h-2M8 12h8" />
    </svg>
  ),
  preview: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  ),
  bell: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M18 8a6 6 0 10-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 01-3.46 0" />
    </svg>
  ),
  connectors: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M9 17H7a5 5 0 010-10h2M15 7h2a5 5 0 010 10h-2M8 12h8" />
    </svg>
  ),
  workboards: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M9 3v18M15 3v18" />
    </svg>
  ),
  contacts: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c0-4.4 3.6-8 8-8s8 3.6 8 8" />
    </svg>
  ),
  segments: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="8" cy="12" r="5" />
      <circle cx="15" cy="12" r="5" />
    </svg>
  ),
  campaigns: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M4 4l16 8-16 8V4z" />
    </svg>
  ),
  sms: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2v10z" />
    </svg>
  ),
  sequences: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M3 6h18M3 12h18M3 18h12" />
    </svg>
  ),
  donorCalling: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M22 16.9v3a2 2 0 01-2.2 2 19.8 19.8 0 01-8.6-3.1 19.5 19.5 0 01-6-6 19.8 19.8 0 01-3.1-8.7A2 2 0 014.1 2h3a2 2 0 012 1.7c.1 1 .3 2 .6 2.9a2 2 0 01-.5 2.1L8 10a16 16 0 006 6l1.3-1.3a2 2 0 012.1-.5c.9.3 1.9.5 2.9.6a2 2 0 011.7 2.1z" />
    </svg>
  ),
  officeInfo: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 3" />
      <path d="M8 3l-2 2M16 3l2 2" />
    </svg>
  ),
  security: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 3l8 3v6c0 4.5-3.4 8.3-8 9-4.6-.7-8-4.5-8-9V6l8-3z" />
      <path d="M9 12l2 2 4-4" />
    </svg>
  ),
  devices: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="2" y="4" width="14" height="10" rx="1.5" />
      <path d="M6 18h6M9 14v4" />
      <rect x="17" y="8" width="5" height="11" rx="1" />
    </svg>
  ),
  entraDirectory: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M3 9h18M8 4v5" />
      <circle cx="12" cy="14" r="2" />
      <path d="M9 18c0-1.5 1.3-2.5 3-2.5s3 1 3 2.5" />
    </svg>
  ),
};

// `match` lets one item stay highlighted across a group of routes (the
// Reports hub and Revenue are several pages behind one sidebar item).
type NavItem = { href: string; label: string; icon: keyof typeof ICONS; external?: boolean; match?: string[] };
type NavSection = { title: string; items: NavItem[] };

export default function AdminSidebar({ access }: { access: AdminAccess }) {
  const pathname = usePathname();
  const { t } = useLanguage();

  // A hub item opens on the first tab this person can see, and stays
  // highlighted on every page in the hub (see lib/adminNav.ts).
  const hub = (key: HubKey, label: string, icon: keyof typeof ICONS): NavItem | false => {
    const first = HUBS[key].tabs(access)[0];
    return first ? { href: first.href, label, icon, match: HUBS[key].prefixes } : false;
  };

  // Day-to-day work up top, set-once setup at the bottom. Pages that used
  // to be separate sidebar items now live as tabs inside one item.
  const sections: NavSection[] = [
    {
      title: t("sidebar.section.overview"),
      items: [
        { href: "/admin", label: t("sidebar.nav.dashboard"), icon: "dashboard" },
        hub("reports", t("sidebar.nav.reports"), "dashboard"),
        hub("revenue", t("sidebar.nav.revenue"), "finance"),
        access.canManageFinance && { href: "/admin/expenses", label: t("sidebar.nav.expenses"), icon: "finance" },
        access.isAdmin && { href: "/admin/workflows", label: t("sidebar.nav.workflows"), icon: "dashboard" },
        { href: "/irfas", label: t("sidebar.nav.irfas"), icon: "finance" },
      ].filter(Boolean) as NavItem[],
    },
    {
      title: t("sidebar.section.requests"),
      items: [
        hub("helpDesk", t("sidebar.section.helpDesk"), "tickets"),
        // Finance staff get the one Finance Tickets area (queue, approval
        // coverage, PEX cards as tabs); everyone else gets their own tickets.
        access.canManageFinance
          ? { href: "/admin/finance-tickets", label: t("sidebar.nav.financeTickets"), icon: "finance" }
          : { href: "/finance-tickets", label: t("sidebar.nav.financeTickets"), icon: "finance" },
        access.canManageFinance && { href: "/admin/amazon-business", label: t("sidebar.nav.amazonBusiness"), icon: "finance" },
        access.canZakatFinance && { href: "/admin/zakat-finance", label: t("sidebar.nav.zakatFinance"), icon: "finance" },
        access.canManageFinance && { href: "/admin/speaker-requests", label: t("sidebar.nav.speakerRequests"), icon: "finance" },
        { href: "/admin/workboards", label: t("sidebar.nav.workboards"), icon: "workboards" },
      ].filter(Boolean) as NavItem[],
    },
    {
      title: t("sidebar.section.programs"),
      items: [
        access.canInkind && { href: "/admin/inkind", label: t("sidebar.nav.inkindAdmin"), icon: "inkind" },
        access.canReview && { href: "/admin/review", label: t("sidebar.nav.reviewSubmissions"), icon: "review" },
        (access.hasOfficeInfo || access.hasOfficeEmployees) && { href: "/admin/office-info", label: t("sidebar.nav.officeDashboard"), icon: "officeInfo" },
        access.isAdmin && { href: "/admin/training", label: t("sidebar.nav.trainingCourses"), icon: "training" },
      ].filter(Boolean) as NavItem[],
    },
    {
      title: t("sidebar.section.marketing"),
      items: [
        access.canManageMarketing && {
          href: MARKETING_TABS[0].href,
          label: t("sidebar.nav.marketing"),
          icon: "campaigns",
          match: MARKETING_PREFIXES,
        },
        hub("fliers", t("sidebar.nav.fliers"), "fliers"),
      ].filter(Boolean) as NavItem[],
    },
    {
      title: t("sidebar.section.system"),
      items: [
        hub("people", t("sidebar.section.peopleAccess"), "entraDirectory"),
        hub("devices", t("sidebar.nav.devices"), "devices"),
        hub("security", t("sidebar.nav.security"), "security"),
        hub("settings", t("sidebar.nav.settings"), "connectors"),
      ].filter(Boolean) as NavItem[],
    },
  ].filter((s) => s.items.length > 0);

  // Closed by default on mobile, and auto-closes on route change so
  // tapping a nav link doesn't leave the drawer open over the new page.
  const [mobileOpen, setMobileOpen] = useState(false);
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  // Desktop-only collapse, persisted so it stays collapsed across
  // navigation - mainly for tools like the flier builder where the
  // canvas benefits from the extra width. Starts expanded (false)
  // until localStorage says otherwise, read after mount to avoid an
  // SSR/client mismatch flash.
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    if (localStorage.getItem("adminSidebarCollapsed") === "1") setCollapsed(true);
  }, []);
  function toggleCollapsed() {
    setCollapsed((c) => {
      const next = !c;
      localStorage.setItem("adminSidebarCollapsed", next ? "1" : "0");
      return next;
    });
  }

  const navContent = (
    <>
      <Link
        href="/admin"
        className="block text-sm font-bold mb-6 px-2"
        style={{ color: pathname === "/admin" ? "var(--portal-emerald)" : "#16302B" }}
        onClick={() => setMobileOpen(false)}
      >
        {t("sidebar.adminPortal")}
      </Link>
      {sections.map((section) => (
        <div key={section.title} className="mb-5">
          <div
            className="text-[10px] font-semibold uppercase tracking-wide mb-1.5 px-2"
            style={{ color: "rgba(22,48,43,0.4)" }}
          >
            {section.title}
          </div>
          <div className="space-y-0.5">
            {section.items.map((item) => {
              const active = item.match
                ? item.match.some((p) => pathname === p || pathname.startsWith(p + "/"))
                : pathname === item.href || (item.href.split("/").length > 2 && pathname.startsWith(item.href + "/"));
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg text-sm transition-colors"
                  style={{
                    background: active ? "#EAF3EF" : "transparent",
                    color: active ? "var(--portal-emerald)" : "#333",
                    fontWeight: active ? 600 : 400,
                  }}
                >
                  <span style={{ width: 15, height: 15, flexShrink: 0, opacity: active ? 1 : 0.6 }}>
                    {ICONS[item.icon]}
                  </span>
                  <span className="truncate">{item.label}</span>
                </Link>
              );
            })}
          </div>
        </div>
      ))}
      <Link
        href="/select-app"
        className="block text-xs px-2 mt-6"
        style={{ color: "rgba(22,48,43,0.4)" }}
        onClick={() => setMobileOpen(false)}
      >
        {t("sidebar.backToApps")}
      </Link>
    </>
  );

  return (
    <>
      {/* Mobile top bar: hamburger toggle, only shown below md */}
      <div className="md:hidden flex items-center justify-between w-full mb-4">
        <span className="text-sm font-bold" style={{ color: "#16302B" }}>
          {t("sidebar.adminPortal")}
        </span>
        <button
          onClick={() => setMobileOpen(true)}
          aria-label={t("sidebar.openMenu")}
          className="p-2 rounded-lg border"
          style={{ borderColor: "var(--portal-line)" }}
        >
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="#16302B" strokeWidth="2">
            <path d="M3 6h18M3 12h18M3 18h18" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      {/* Static sidebar on md+ */}
      <nav
        className={`hidden md:flex flex-col flex-shrink-0 transition-all duration-200 ${collapsed ? "w-[36px]" : "w-[220px] pr-2"}`}
      >
        <button
          onClick={toggleCollapsed}
          aria-label={collapsed ? t("sidebar.showMenu") : t("sidebar.hideMenu")}
          title={collapsed ? t("sidebar.showMenu") : t("sidebar.hideMenu")}
          className="flex items-center justify-center rounded-full mb-4 flex-shrink-0 hover:scale-110 active:scale-95 transition-all duration-150"
          style={{ width: 30, height: 30, background: "#fff", boxShadow: "0 2px 6px rgba(22,48,43,0.1)", color: "var(--portal-emerald)" }}
        >
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5">
            {collapsed ? <path d="M9 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" /> : <path d="M15 6l-6 6 6 6" strokeLinecap="round" strokeLinejoin="round" />}
          </svg>
        </button>
        {!collapsed && navContent}
      </nav>

      {/* Mobile drawer: backdrop + sliding panel, md:hidden */}
      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          <div className="absolute inset-0 bg-black/40" onClick={() => setMobileOpen(false)} />
          <nav
            className="relative w-[260px] max-w-[80vw] h-full overflow-y-auto p-4"
            style={{ background: "var(--portal-sand)" }}
          >
            <button
              onClick={() => setMobileOpen(false)}
              aria-label={t("sidebar.closeMenu")}
              className="absolute top-4 right-4 p-1"
            >
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#16302B" strokeWidth="2">
                <path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" />
              </svg>
            </button>
            {navContent}
          </nav>
        </div>
      )}
    </>
  );
}
