// The Reports hub — the portal's replacement for the Power BI navigation page.
// Pure data (client-safe). Each report is built by lib/reportsSuite/build.ts.

export type ReportStatus = "live" | "partial" | "waiting";
export type ReportDef = {
  key: string;
  title: string;
  column: "programs" | "central" | "regions";
  status: ReportStatus;
  statusNote?: string;
  href?: string; // links elsewhere instead of a generated report
  filters: ("year" | "month" | "region" | "state" | "office" | "program")[];
  color?: "red" | "purple";
};

const STD: ReportDef["filters"] = ["year", "month", "region", "state", "office"];

export const REPORTS: ReportDef[] = [
  // Programs
  { key: "programs", title: "Programs Dashboard", column: "programs", status: "live", href: "/admin/insights", filters: [] },
  { key: "back2school", title: "Back2School", column: "programs", status: "live", filters: STD },
  { key: "disaster-relief", title: "Disaster Relief Services", column: "programs", status: "live", filters: STD },
  { key: "health-services", title: "Health Services", column: "programs", status: "partial", statusNote: "No clinic/health service records in the portal yet — shows Health Services grants and in-kind", filters: STD },
  { key: "hunger-prevention", title: "Hunger Prevention", column: "programs", status: "live", filters: STD },
  { key: "muslim-family-services", title: "Muslim Family Services", column: "programs", status: "live", filters: STD },
  { key: "refugee-services", title: "Refugee Services", column: "programs", status: "live", filters: STD },
  { key: "transitional-housing", title: "Transitional Housing", column: "programs", status: "live", filters: STD },
  { key: "kpis-programs", title: "KPIs — Programs & Services", column: "programs", status: "live", filters: STD, color: "red" },

  // Revenue & operations
  { key: "national-revenue", title: "National Revenue (All Sources)", column: "central", status: "partial", statusNote: "Salesforce donations appear once the nightly sync is connected", filters: STD },
  { key: "community-revenue", title: "Community Revenue", column: "central", status: "partial", statusNote: "2026 donations need the Salesforce sync; 2024–2025 region totals and 2026 goals are imported", filters: STD },
  { key: "grants-revenue", title: "Grants Revenue", column: "central", status: "live", filters: [...STD, "program"] },
  { key: "in-kind", title: "In-Kind Donation", column: "central", status: "live", filters: [...STD, "program"] },
  { key: "irfas", title: "IRFAS", column: "central", status: "live", filters: STD },
  { key: "volunteering", title: "Volunteering", column: "central", status: "live", filters: [...STD, "program"] },
  { key: "calling-campaign", title: "Calling Campaign", column: "central", status: "live", filters: ["year", "month"] },
  { key: "ramadan", title: "Ramadan", column: "central", status: "waiting", statusNote: "Needs Salesforce campaign donations (Ramadan campaigns)", filters: STD },
  { key: "outreach", title: "Outreach", column: "central", status: "partial", statusNote: "No outreach activity records yet — shows Outreach grants, in-kind and volunteering", filters: STD },
  { key: "office-rankings", title: "Office Rankings", column: "central", status: "live", filters: ["year", "month", "region", "state"] },
  { key: "expenditure", title: "Expenditure", column: "central", status: "partial", statusNote: "Finance tickets paid; full expenditure needs the accounting system", filters: STD, color: "red" },
  { key: "finance", title: "Finance Reports", column: "central", status: "live", href: "/admin/finance-tickets", filters: [], color: "purple" },

  // Regions
  { key: "regional-profiles", title: "Regional Profiles", column: "regions", status: "live", href: "/admin/insights?tab=profiles", filters: [] },
  ...["DMV", "MIDWEST 1", "MIDWEST 2", "NORTHEAST", "SOUTH CENTRAL", "SOUTHEAST", "WEST"].map(
    (r): ReportDef => ({ key: `region-${r}`, title: r, column: "regions", status: "live", href: `/admin/insights?tab=profiles&region=${encodeURIComponent(r)}`, filters: [] })
  ),
  { key: "kpis-regions", title: "KPIs — Regions & Offices", column: "regions", status: "live", filters: ["year", "region", "state"], color: "red" },
];

export const REPORT = new Map(REPORTS.map((r) => [r.key, r]));

// ─── Payload every report returns ───────────────────────────────────────────
export type Unit = "money" | "count" | "hours" | "lbs" | "pct";
export type Kpi = { label: string; value: number | null; unit: Unit; sub?: string };
export type MatrixRow = { key: string; label: string; values: Record<string, number | null>; children?: MatrixRow[] };
export type Matrix = { title: string; dim: string; columns: { key: string; label: string; unit: Unit }[]; rows: MatrixRow[]; total?: Record<string, number | null>; note?: string };
export type Chart =
  | { kind: "months"; title: string; unit: Unit; series: string[]; data: ({ month: number } & Record<string, number>)[]; note?: string }
  | { kind: "share"; title: string; unit: Unit; items: { label: string; value: number }[]; note?: string }
  | { kind: "value-addition"; title: string; raised: number; services: number; note?: string }
  | { kind: "table"; title: string; columns: { key: string; label: string; unit?: Unit }[]; rows: Record<string, string | number | null>[]; note?: string };
export type ReportPayload = {
  key: string;
  title: string;
  asOf: string;
  notes: string[];
  kpis: Kpi[];
  matrices: Matrix[];
  charts: Chart[];
  programs?: string[]; // options for the program filter
};
