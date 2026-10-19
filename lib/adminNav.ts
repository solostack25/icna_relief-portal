import type { AdminAccess } from "@/lib/adminAccess";
import type { SectionTab } from "@/components/admin/SectionTabs";

// The Reports hub: one sidebar item, four tabs. Overview (the old
// Executive Dashboard) is admin-only; Programs (old Insights) and
// Standard reports (old Dashboards, the Power BI rebuilds) need review or
// office access; Custom reports (the report builder) is open to everyone
// in the admin portal and scopes itself to their office/region.
export function reportsHubTabs(access: Pick<AdminAccess, "isAdmin" | "canReview" | "hasOfficeInfo">): SectionTab[] {
  const canInsights = access.canReview || access.hasOfficeInfo;
  return [
    access.isAdmin && { href: "/admin/exec-dashboard", labelKey: "reportsHub.tab.overview" },
    canInsights && { href: "/admin/insights", labelKey: "reportsHub.tab.programs" },
    canInsights && { href: "/admin/insights/reports", labelKey: "reportsHub.tab.standard" },
    { href: "/admin/reports", labelKey: "reportsHub.tab.custom" },
  ].filter(Boolean) as SectionTab[];
}

// Every route that belongs to the Reports hub, for the sidebar's active state.
export const REPORTS_HUB_PREFIXES = ["/admin/exec-dashboard", "/admin/insights", "/admin/reports"];

// Revenue: all streams plus the grants-only view of the same data.
export const REVENUE_TABS: SectionTab[] = [
  { href: "/admin/revenue", labelKey: "revenueHub.tab.all" },
  { href: "/admin/grants", labelKey: "revenueHub.tab.grants" },
];

export const REVENUE_PREFIXES = ["/admin/revenue", "/admin/grants"];
