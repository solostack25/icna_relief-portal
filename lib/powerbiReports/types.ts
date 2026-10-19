import type { Unit } from "@/lib/reportsSuite/catalog";

// A Power BI version of one Reports suite report is just a spec: which
// measures/columns in the Power BI model feed each tile, table and chart.
// lib/powerbiReports/engine.ts turns a spec into DAX queries and returns the
// same ReportPayload the portal reports use, so ReportView draws it as-is.

// DAX column references, e.g. "'Calendar'[Date]" or "'Offices'[Region]".
export type ModelMap = {
  // Year/month filter: either a date column...
  date?: string;
  // ...or numeric year and month columns.
  year?: string;
  month?: string;
  region?: string;
  state?: string;
  office?: string; // matched by office name (b2s_offices.field_office)
  program?: string;
};

// A DAX scalar expression: a measure like "[Total Revenue]" or an
// aggregation like "SUM('Gifts'[Amount])".
export type Expr = string;

export type TimeShift = {
  // Evaluate for a different year than the one picked (-1 = last year).
  yearOffset?: number;
  // Ignore the month filter (e.g. an annual goal).
  wholeYear?: boolean;
  // Ignore the year/month filter entirely (the measure handles time itself).
  noTime?: boolean;
};

export type KpiSpec = TimeShift & { label: string; unit: Unit; expr: Expr; sub?: string };

export type MatrixColumnSpec = TimeShift & {
  key: string;
  // "{year}", "{year-1}", "{year-2}" are replaced with the picked year.
  label: string;
  unit: Unit;
  expr: Expr;
};

export type MatrixSpec = {
  title: string;
  dimLabel: string; // header of the first column, e.g. "Region"
  dim: string; // DAX column to group by
  columns: MatrixColumnSpec[];
  total?: boolean;
  note?: string;
  // Row order: "regions" (the portal's region order), "desc" (by the
  // first column, largest first) or "label".
  order?: "regions" | "desc" | "label";
  limit?: number;
};

export type ChartSpec =
  | (TimeShift & { kind: "months"; title: string; unit: Unit; expr: Expr; years?: number; cumulative?: boolean; note?: string })
  | (TimeShift & { kind: "share"; title: string; unit: Unit; dim: string; expr: Expr; limit?: number; note?: string });

export type PbiReportSpec = {
  dataset?: string; // model name; defaults to the configured model
  map?: ModelMap; // overrides the shared map for this report
  kpis?: KpiSpec[];
  matrices?: MatrixSpec[];
  charts?: ChartSpec[];
  notes?: string[];
};
