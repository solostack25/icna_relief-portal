"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { AdminAccess } from "@/lib/adminAccess";

const ICONS: Record<string, React.ReactNode> = {
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
};

type NavItem = { href: string; label: string; icon: keyof typeof ICONS; external?: boolean };
type NavSection = { title: string; items: NavItem[] };

export default function AdminSidebar({ access }: { access: AdminAccess }) {
  const pathname = usePathname();

  const sections: NavSection[] = [
    {
      title: "Help Desk",
      items: [
        access.canManageTickets && { href: "/admin/helpdesk/manage", label: "Manage Tickets", icon: "tickets" },
        access.isAdmin && { href: "/admin/helpdesk", label: "Help Desk Workload", icon: "workload" },
      ].filter(Boolean) as NavItem[],
    },
    {
      title: "Finance",
      items: [access.canManageFinance && { href: "/admin/finance", label: "Finance Approvals", icon: "finance" }].filter(
        Boolean
      ) as NavItem[],
    },
    {
      title: "Marketing & Content",
      items: [
        access.canManageFliers && { href: "/admin/fliers/builder", label: "Flier Templates", icon: "fliers" },
        access.canManageFliers && { href: "/admin/fliers/images", label: "Content Library", icon: "library" },
        access.isAdmin && { href: "/admin/content-folders", label: "Upload Folders", icon: "contentFolders" },
      ].filter(Boolean) as NavItem[],
    },
    {
      title: "Programs",
      items: [
        access.canInkind && { href: "/admin/inkind", label: "InKind Admin", icon: "inkind" },
        access.canReview && { href: "/admin/review", label: "Review Submissions", icon: "review" },
      ].filter(Boolean) as NavItem[],
    },
    {
      title: "Training",
      items: [access.isAdmin && { href: "/admin/training", label: "Training Courses", icon: "training" }].filter(
        Boolean
      ) as NavItem[],
    },
    {
      title: "People & Access",
      items: [
        access.isAdmin && { href: "/admin/employees/new", label: "Add Employee", icon: "addEmployee" },
        access.isAdmin && { href: "/admin/ad-mappings", label: "AD Mappings", icon: "mappings" },
        access.isAdmin && { href: "/admin/ad-preview", label: "AD Provisioning Preview", icon: "preview" },
      ].filter(Boolean) as NavItem[],
    },
    {
      title: "System",
      items: [access.isAdmin && { href: "/admin/connectors", label: "Connectors", icon: "connectors" }].filter(
        Boolean
      ) as NavItem[],
    },
    {
      title: "General",
      items: [{ href: "/admin/workboards", label: "Workboards", icon: "workboards" }],
    },
  ].filter((s) => s.items.length > 0);

  return (
    <nav className="w-[220px] flex-shrink-0 pr-2">
      <Link
        href="/admin"
        className="block text-sm font-bold mb-6 px-2"
        style={{ color: pathname === "/admin" ? "var(--portal-emerald)" : "#16302B" }}
      >
        Admin Portal
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
              const active = pathname === item.href;
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
      <Link href="/select-app" className="block text-xs px-2 mt-6" style={{ color: "rgba(22,48,43,0.4)" }}>
        ← Back to apps
      </Link>
    </nav>
  );
}
