import Papa from "papaparse";
import { ACCOUNTS, GROUPS, MONTHS, SUBTOTALS, accountsTotal, groupTotal, quarterOf, subTotal, type Amounts } from "./accounts";
import { CENTRAL_COLUMNS, DEPARTMENT_ORDER, GRANT_COLUMNS, OFFICE_COLUMNS } from "./layout";
import type { Scope } from "./expenses";

// Writes rows back out in the cleaned workbook's exact layout (all TOTAL
// columns recomputed), one CSV per sheet.

const REGION_RSN: Record<string, number> = { DMV: 1, "MIDWEST 1": 2, "MIDWEST 2": 3, NORTHEAST: 4, "SOUTH CENTRAL": 5, SOUTHEAST: 6, WEST: 7 };

type Row = {
  year: number;
  month: number;
  region: string | null;
  state: string | null;
  chapter: string | null;
  office_name: string | null;
  department: string | null;
  subhead: string | null;
  revenue: number | null;
  central_share: number | null;
  amounts: Amounts;
};

const r2 = (n: number) => Math.round(n * 100) / 100;

function cell(scope: Scope, header: string, row: Row): string | number | null {
  const a = row.amounts ?? {};
  const acct = ACCOUNTS.find((x) => (scope === "office" ? x.office : scope === "grant" ? x.grant : x.central) === header);
  if (acct) return r2(a[acct.key] ?? 0);
  const g = GROUPS.find((x) => (scope === "office" ? x.officeTotal : scope === "grant" ? x.grantTotal : x.centralTotal) === header);
  if (g) return r2(groupTotal(a, g.key));
  const s = SUBTOTALS.find((x) => x[scope] === header);
  if (s) return r2(subTotal(a, s.key));
  const total = accountsTotal(a);
  const officeTotal = total + Number(row.central_share || 0);
  switch (header) {
    case "YEAR":
      return row.year;
    case "QUARTER":
      return quarterOf(row.month);
    case "MONTH":
      return MONTHS[row.month - 1];
    case "MTN":
    case "MSN":
      return row.month;
    case "REGION":
      return row.region;
    case "RSN":
      return REGION_RSN[(row.region ?? "").toUpperCase()] ?? null;
    case "CHAPTER":
      return row.chapter;
    case "STATE":
      return row.state;
    case "FIELD OFFICE":
      return row.office_name;
    case "REVENUE":
    case "GRANT REVENUE":
      return r2(Number(row.revenue || 0));
    case "TOTAL CENTRAL DEPARTMENTS SHARE":
      return r2(Number(row.central_share || 0));
    case "TOTAL EXPENDITURE":
      return r2(scope === "office" ? officeTotal : total);
    case "REVNUE-EXPENDITURE":
      return r2(Number(row.revenue || 0) - officeTotal);
    case "TOTAL":
      return r2(total);
    case "SURPLUS/DEFICIT":
      return r2(Number(row.revenue || 0) - total);
    case "DSN":
      return DEPARTMENT_ORDER[(row.department ?? "").toUpperCase()] ?? null;
    case "DEPARTMENT":
      return row.department;
    case "DEPARTMENT SUBHEADS":
      return row.subhead;
    default:
      return null;
  }
}

export function toCsv(scope: Scope, rows: Row[]): string {
  const cols = (scope === "office" ? OFFICE_COLUMNS : scope === "grant" ? GRANT_COLUMNS : CENTRAL_COLUMNS) as readonly string[];
  const sorted = [...rows].sort(
    (a, b) =>
      a.year - b.year ||
      a.month - b.month ||
      (scope === "central"
        ? (DEPARTMENT_ORDER[a.department ?? ""] ?? 99) - (DEPARTMENT_ORDER[b.department ?? ""] ?? 99) || String(a.subhead).localeCompare(String(b.subhead))
        : String(a.office_name).localeCompare(String(b.office_name)))
  );
  return Papa.unparse({ fields: [...cols], data: sorted.map((r) => cols.map((h) => cell(scope, h, r))) });
}
