import type { AdminAccess } from "@/lib/adminAccess";
import type { SectionTab } from "@/components/admin/SectionTabs";

// Hubs: several admin pages behind one sidebar item, shown as tabs.
// Every page keeps its own URL (old links and bookmarks still work); the
// hub just decides which tabs this person can see and which routes keep
// the sidebar item highlighted. Labels reuse the sidebar translation keys.
type Hub = {
  tabs: (access: AdminAccess) => SectionTab[];
  prefixes: string[];
};

const tabs = (list: (SectionTab | false)[]) => list.filter(Boolean) as SectionTab[];

export const HUBS = {
  // Overview (old Executive Dashboard) is admin-only; Programs (old
  // Insights) and Standard reports (old Dashboards, the Power BI
  // rebuilds) need review or office access; Custom reports is open to
  // everyone and scopes itself to their office/region.
  reports: {
    tabs: (a) =>
      tabs([
        a.isAdmin && { href: "/admin/exec-dashboard", labelKey: "reportsHub.tab.overview" },
        (a.canReview || a.hasOfficeInfo) && { href: "/admin/insights", labelKey: "reportsHub.tab.programs" },
        (a.canReview || a.hasOfficeInfo) && { href: "/admin/insights/reports", labelKey: "reportsHub.tab.standard" },
        { href: "/admin/reports", labelKey: "reportsHub.tab.custom" },
        // Temporary, until Power BI is retired.
        a.isAdmin && { href: "/admin/powerbi-compare", labelKey: "reportsHub.tab.powerbi" },
      ]),
    prefixes: ["/admin/exec-dashboard", "/admin/insights", "/admin/reports", "/admin/powerbi-compare"],
  },
  revenue: {
    tabs: (a) =>
      tabs([
        a.isAdmin && { href: "/admin/revenue", labelKey: "revenueHub.tab.all" },
        a.isAdmin && { href: "/admin/grants", labelKey: "revenueHub.tab.grants" },
      ]),
    prefixes: ["/admin/revenue", "/admin/grants"],
  },
  helpDesk: {
    tabs: (a) =>
      tabs([
        a.canManageTickets && { href: "/admin/helpdesk/manage", labelKey: "sidebar.nav.manageTickets" },
        a.isAdmin && { href: "/admin/helpdesk", labelKey: "sidebar.nav.helpDeskWorkload", exact: true },
      ]),
    prefixes: ["/admin/helpdesk"],
  },
  fliers: {
    tabs: (a) =>
      tabs([
        a.canManageFliers && { href: "/admin/fliers/builder", labelKey: "sidebar.nav.flierTemplates" },
        a.canManageFliers && { href: "/admin/fliers/images", labelKey: "sidebar.nav.contentLibrary" },
      ]),
    prefixes: ["/admin/fliers"],
  },
  people: {
    tabs: (a) =>
      tabs([
        a.isAdmin && { href: "/admin/employees", labelKey: "sidebar.nav.employees" },
        a.isAdmin && { href: "/admin/employees/new", labelKey: "sidebar.nav.setUpPortalAccess" },
        a.isAdmin && { href: "/admin/entra-directory", labelKey: "sidebar.nav.entraDirectory" },
        a.isAdmin && { href: "/admin/ad-mappings", labelKey: "sidebar.nav.adMappings" },
        a.isAdmin && { href: "/admin/ad-preview", labelKey: "sidebar.nav.adProvisioningPreview" },
      ]),
    prefixes: ["/admin/employees", "/admin/entra-directory", "/admin/ad-mappings", "/admin/ad-preview"],
  },
  // Set-once setup screens, out of the day-to-day sidebar.
  settings: {
    tabs: (a) =>
      tabs([
        a.isAdmin && { href: "/admin/connectors", labelKey: "sidebar.nav.connectors" },
        a.isAdmin && { href: "/admin/salesforce-sync", labelKey: "sidebar.nav.salesforceSync" },
        a.isAdmin && { href: "/admin/push", labelKey: "sidebar.nav.pushNotifications" },
        a.isAdmin && { href: "/admin/goals", labelKey: "sidebar.nav.goals" },
        a.isAdmin && { href: "/admin/rates", labelKey: "sidebar.nav.ratesValues" },
        a.isAdmin && { href: "/admin/geography", labelKey: "sidebar.nav.geography" },
        a.isAdmin && { href: "/admin/data-quality", labelKey: "sidebar.nav.dataQuality" },
        a.isAdmin && { href: "/admin/content-folders", labelKey: "sidebar.nav.uploadFolders" },
      ]),
    prefixes: [
      "/admin/connectors",
      "/admin/salesforce-sync",
      "/admin/push",
      "/admin/goals",
      "/admin/rates",
      "/admin/geography",
      "/admin/data-quality",
      "/admin/content-folders",
    ],
  },
} satisfies Record<string, Hub>;

export type HubKey = keyof typeof HUBS;

// Marketing pages live outside /admin (their own layout, no sidebar), so
// their tabs are the way to move between them. Everyone who reaches
// /marketing already has marketing access.
export const MARKETING_TABS: SectionTab[] = [
  { href: "/marketing/contacts", labelKey: "sidebar.nav.contacts" },
  { href: "/marketing/segments", labelKey: "sidebar.nav.segments" },
  { href: "/marketing/campaigns", labelKey: "sidebar.nav.emailCampaigns" },
  { href: "/marketing/sms-campaigns", labelKey: "sidebar.nav.smsCampaigns" },
  { href: "/marketing/sequences", labelKey: "sidebar.nav.sequences" },
  { href: "/marketing/donor-calling", labelKey: "sidebar.nav.donorCalling" },
];
export const MARKETING_PREFIXES = ["/marketing"];
