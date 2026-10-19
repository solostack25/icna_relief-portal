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
  // The year column holds text ("2026", "2026 GOAL"), not numbers.
  yearText?: boolean;
  month?: string; // month number 1-12
  region?: string;
  state?: string;
  office?: string; // matched by office name (b2s_offices.field_office)
  program?: string;
};

// A DAX scalar expression: a measure like "[Total Revenue]" or an
// aggregation like "SUM('Gifts'[Amount])". "{year}", "{year-1}" etc. are
// replaced with the picked year (handy for text years like "{year} GOAL").
export type Expr = string;

export type TimeShift = {
  // Evaluate for a different year than the one picked (-1 = last year).
  yearOffset?: number;
  // Ignore the month filter (e.g. an annual goal).
  wholeYear?: boolean;
  // Ignore the year/month filter entirely (the measure handles time itself).
  noTime?: boolean;
  // Apply the month filter but not the year (the expression picks its own
  // year, e.g. 'T'[YEAR] = "{year} GOAL").
  monthOnly?: boolean;
};

// Any tile, table or chart can point at a different table than the report's
// main one by giving its own map (e.g. Health Services: clinics + mobile).
type OwnMap = { map?: ModelMap };

export type KpiSpec = TimeShift & OwnMap & { label: string; unit: Unit; expr: Expr; sub?: string };

export type MatrixColumnSpec = TimeShift & {
  key: string;
  // "{year}", "{year-1}", "{year-2}" are replaced with the picked year.
  label: string;
  unit: Unit;
  expr: Expr;
};

export type MatrixSpec = OwnMap & {
  title: string;
  dimLabel: string; // header of the first column, e.g. "Region"
  dim: string; // DAX column to group by
  childDim?: string; // optional second level (rows expand to show these)
  columns: MatrixColumnSpec[];
  total?: boolean;
  note?: string;
  // Row order: "regions" (the portal's region order), "desc" (by the
  // first column, largest first) or "label".
  order?: "regions" | "desc" | "label";
  limit?: number;
};

export type TableColumnSpec = TimeShift & { key: string; label: string; unit: Unit; expr: Expr };

export type ChartSpec =
  | (OwnMap & {
      kind: "table";
      title: string;
      dims: { key: string; label: string; col: string }[];
      columns: TableColumnSpec[];
      total?: boolean;
      orderBy?: string; // a column key, largest first ("asc:key" = smallest first); default: dims ascending
      limit?: number;
      note?: string;
    })
  | (TimeShift & OwnMap & { kind: "months"; title: string; unit: Unit; expr: Expr; years?: number; cumulative?: boolean; note?: string })
  // Share: either one measure split by a column (dim + expr), or a fixed
  // list of measures shown as slices (items), e.g. boys vs girls.
  | (TimeShift & OwnMap & { kind: "share"; title: string; unit: Unit; dim?: string; expr?: Expr; items?: { label: string; expr: Expr }[]; limit?: number; note?: string })
  // Funds raised vs value of services delivered (the portal's funnel card).
  | (TimeShift & OwnMap & { kind: "value-addition"; title: string; raised: Expr; services: Expr; note?: string });

export type PbiReportSpec = {
  dataset?: string; // model name; defaults to the configured model
  map?: ModelMap; // overrides the shared map for this report
  kpis?: KpiSpec[];
  matrices?: MatrixSpec[];
  charts?: ChartSpec[];
  notes?: string[];
  // Column whose values fill the Program filter dropdown.
  programsFrom?: string;
  // Filters to show, when they differ from the catalog's (e.g. reports that
  // are plain links on the Standard side).
  filters?: ("year" | "month" | "region" | "state" | "office" | "program")[];
};
