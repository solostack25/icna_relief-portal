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

export const PBI_REPORTS: Record<string, PbiReportSpec> = {
  // Example shape (National Revenue):
  // "national-revenue": {
  //   kpis: [{ label: "Total revenue", unit: "money", expr: "[Total Revenue]" }],
  //   matrices: [{
  //     title: "Revenue by region", dimLabel: "Region", dim: "'Offices'[Region]", order: "regions", total: true,
  //     columns: [
  //       { key: "y2", label: "{year-2}", unit: "money", expr: "[Total Revenue]", yearOffset: -2 },
  //       { key: "y1", label: "{year-1}", unit: "money", expr: "[Total Revenue]", yearOffset: -1 },
  //       { key: "y0", label: "{year}", unit: "money", expr: "[Total Revenue]" },
  //       { key: "goal", label: "{year} goal", unit: "money", expr: "[Goal]", wholeYear: true },
  //     ],
  //   }],
  //   charts: [{ kind: "months", title: "Revenue by month", unit: "money", expr: "[Total Revenue]", cumulative: true }],
  // },
};
