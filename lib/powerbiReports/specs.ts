import type { ModelMap, PbiReportSpec } from "./types";

// Power BI versions of the Reports suite, keyed by the same report keys as
// lib/reportsSuite/catalog.ts. A report shows under Reports → Power BI once
// it has at least one tile, table or chart here.
//
// Expressions are DAX against the ICNA Relief Power BI semantic model.
// Prefer the model's own measures (e.g. "[Total Revenue]") so the numbers
// match the Power BI report exactly.

// How the model's columns line up with the portal's filters. Shared by every
// report unless a spec overrides it.
export const SHARED_MAP: ModelMap = {
  // Filled in from the model's table list.
};

// ─── REV-MAIN (National Revenue page) ───────────────────────────────────────
// One row per office/month/year from "Revenue PowerBi.xlsx". YEAR is text:
// "2024", "2025", "2026", plus "2026 GOAL" and "2026 VARIANCE" rows. MTN is
// the month number.
const REV = "'REV-MAIN'";
const REV_MAP: ModelMap = {
  year: `${REV}[YEAR]`,
  yearText: true,
  month: `${REV}[MTN]`,
  region: `${REV}[REGION]`,
  state: `${REV}[STATE]`,
  office: `${REV}[FIELD OFFICE]`,
};
const DONATIONS = `SUM(${REV}[DONATIONS])`;
const revYear = (label: string) => `CALCULATE(${DONATIONS}, ${REV}[YEAR] = "${label}")`;
const GOAL = revYear("{year} GOAL");
const VARIANCE = revYear("{year} VARIANCE");
const PCT_TO_GOAL = `DIVIDE(${revYear("{year}")}, ${GOAL}) * 100`;
const CFD_PCT = `DIVIDE(SUM(${REV}[Community Funding]), ${DONATIONS}, 0) * 100`;
const GFD_PCT = `DIVIDE(SUM(${REV}[Grant Funding]), ${DONATIONS}, 0) * 100`;
const FUNDING_COLUMNS = [
  { key: "community", label: "Community funding", unit: "money" as const, expr: `SUM(${REV}[Community Funding])` },
  { key: "cfd", label: "CFD %", unit: "pct" as const, expr: CFD_PCT },
  { key: "grant", label: "Grant funding", unit: "money" as const, expr: `SUM(${REV}[Grant Funding])` },
  { key: "gfd", label: "GFD %", unit: "pct" as const, expr: GFD_PCT },
];

export const PBI_REPORTS: Record<string, PbiReportSpec> = {
  "national-revenue": {
    map: REV_MAP,
    notes: ["From Power BI's NATIONAL REVENUE page (REV-MAIN table). Goal and variance are the \"{year} GOAL\" and \"{year} VARIANCE\" rows in the revenue workbook."],
    kpis: [
      { label: "{year} revenue", unit: "money", expr: DONATIONS },
      { label: "{year} goal", unit: "money", expr: GOAL, monthOnly: true },
      { label: "Variance to goal", unit: "money", expr: VARIANCE, monthOnly: true },
      { label: "% to goal", unit: "pct", expr: PCT_TO_GOAL, monthOnly: true },
      { label: "{year-1} revenue", unit: "money", expr: DONATIONS, yearOffset: -1 },
    ],
    matrices: [
      {
        title: "Revenue by region",
        dimLabel: "Region",
        dim: `${REV}[REGION]`,
        childDim: `${REV}[FIELD OFFICE]`,
        order: "regions",
        total: true,
        columns: [
          { key: "y2", label: "{year-2}", unit: "money", expr: DONATIONS, yearOffset: -2 },
          { key: "y1", label: "{year-1}", unit: "money", expr: DONATIONS, yearOffset: -1 },
          { key: "y0", label: "{year}", unit: "money", expr: DONATIONS },
          { key: "goal", label: "{year} goal", unit: "money", expr: GOAL, monthOnly: true },
          { key: "variance", label: "{year} variance", unit: "money", expr: VARIANCE, monthOnly: true },
          { key: "pct", label: "{year} % to goal", unit: "pct", expr: PCT_TO_GOAL, monthOnly: true },
        ],
      },
    ],
    charts: [
      { kind: "share", title: "Revenue contributed by region", unit: "money", dim: `${REV}[REGION]`, expr: DONATIONS },
      { kind: "months", title: "Revenue by month (cumulative)", unit: "money", expr: DONATIONS, years: 3, cumulative: true },
      {
        kind: "table",
        title: "Community vs. grant funding by region",
        dims: [{ key: "region", label: "Region", col: `${REV}[REGION]` }],
        columns: FUNDING_COLUMNS,
        total: true,
      },
      {
        kind: "table",
        title: "Community vs. grant funding by field office",
        dims: [{ key: "office", label: "Field office", col: `${REV}[FIELD OFFICE]` }],
        columns: FUNDING_COLUMNS,
        total: true,
      },
      {
        kind: "table",
        title: "{year} goal by field office",
        dims: [
          { key: "state", label: "State", col: `${REV}[STATE]` },
          { key: "office", label: "Field office", col: `${REV}[FIELD OFFICE]` },
        ],
        columns: [{ key: "goal", label: "Goal", unit: "money", expr: GOAL, monthOnly: true }],
        orderBy: "goal",
        total: true,
      },
    ],
  },
};
