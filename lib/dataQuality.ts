// The Data Quality checks shown on /admin/data-quality. Each key matches a
// check_key in the data_quality_issues view (supabase/data_quality_migration.sql).

export type DqCheck = {
  key: string;
  group: "Offices" | "Client records" | "Values & finance" | "Reporting";
  title: string;
  why: string;
  // Fix-everything button (runs server-side)
  autoFix?: string;
  // Rows can be assigned to an office
  officeFix?: boolean;
  // Rows can be dismissed as "fine as is"
  dismissLabel?: string;
  // Rows get an inline price editor
  priceFix?: boolean;
  openLabel?: string;
};

export const DQ_CHECKS: DqCheck[] = [
  {
    key: "clients_no_office",
    group: "Offices",
    title: "Clients with no office",
    why: "They don't count toward any office on Insights or in the exports. Auto-assign uses each client's zip / city (Admin → Zip → Office Map); household members follow their main client.",
    autoFix: "Auto-assign from address",
    officeFix: true,
    openLabel: "Open client",
  },
  {
    key: "inkind_sessions_no_office",
    group: "Offices",
    title: "In-kind donations with no office",
    why: "Donations logged at a station before in-kind went multi-office. Auto-assign matches the station name (e.g. Houston → Houston Office).",
    autoFix: "Assign from station name",
    officeFix: true,
    openLabel: "In-kind admin",
  },
  {
    key: "activity_no_office",
    group: "Offices",
    title: "Program activity with no office",
    why: "Food distributions, Refugee Services and bulk distributions that won't roll up to an office. Auto-fix copies the client's office.",
    autoFix: "Use the client's office",
    officeFix: true,
    openLabel: "Open client",
  },
  {
    key: "grants_no_office",
    group: "Offices",
    title: "Grants with no office",
    why: "These only roll up by region, so they show as Unassigned on Insights' office and region views. Assign the office the grant funds, or dismiss region-wide grants.",
    officeFix: true,
    dismissLabel: "Region-wide grant",
    openLabel: "Grants",
  },
  {
    key: "revenue_no_office",
    group: "Offices",
    title: "Salesforce donations with no office",
    why: "The donor's zip / city didn't match the office map. Add the zip on Admin → Zip → Office Map and they re-match on the next sync.",
    openLabel: "Zip → Office Map",
  },
  {
    key: "duplicate_clients",
    group: "Client records",
    title: "Possible duplicate clients",
    why: "Two client records with the same name and date of birth, or the same name and phone. Duplicates double-count people served.",
    dismissLabel: "Not a duplicate",
    openLabel: "Open both",
  },
  {
    key: "clients_bad_zip",
    group: "Client records",
    title: "Clients with a missing or invalid zip",
    why: "Zip decides the office and feeds geography reports. Most are older imported records with no address.",
    dismissLabel: "Address unknown",
    openLabel: "Open client",
  },
  {
    key: "inkind_items_no_price",
    group: "Values & finance",
    title: "In-kind items recorded at $0",
    why: "They add nothing to in-kind value. Enter the price, or dismiss if the item really had no value.",
    priceFix: true,
    dismissLabel: "Really $0",
  },
  {
    key: "irfas_paid_no_check",
    group: "Values & finance",
    title: "IRFAS paid with no check number",
    why: "Finance needs the check number to reconcile. Add it in the Zakat Finance queue.",
    openLabel: "Finance queue",
  },
  {
    key: "irfas_no_funding",
    group: "Values & finance",
    title: "IRFAS awards with no funding source",
    why: "Without a funding source or grant, the award can't be reported against the right fund. Set it in the Zakat Finance queue.",
    openLabel: "Finance queue",
  },
  {
    key: "missing_monthly_reports",
    group: "Reporting",
    title: "Monthly reports not submitted",
    why: "Offices that reported in the last six months but haven't submitted last month's Back2School, Disaster Relief or FATE report.",
    dismissLabel: "Not expected",
    openLabel: "Reports",
  },
];

export const DQ_CHECK = new Map(DQ_CHECKS.map((c) => [c.key, c]));
