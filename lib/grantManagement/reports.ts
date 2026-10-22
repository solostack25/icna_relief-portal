import { createAdminClient } from "@/lib/grantManagement/server";
import { fetchAll, loadGrantSummaries, loadLineSummaries, nameMap, visibleGrantIds, type GmViewer } from "./server";
import { EXPENSE_KIND_LABELS, EXPENSE_STATUS_LABELS, PAYMENT_METHOD_LABELS, GRANT_STATUS_LABELS, isNearBudget, isOverBudget, isUnderspent, type GrantSummary } from "./shared";

// One report builder used by the Reports page, the Excel/CSV export and
// the external read-only API, so all three always return the same rows.

export type ColType = "text" | "money" | "pct" | "date" | "int";
export type Column = { key: string; label: string; type?: ColType };
export type Report = { key: ReportKey; title: string; description: string; columns: Column[]; rows: Record<string, unknown>[]; totals?: Record<string, number> };

export const REPORTS = {
  master: { title: "Master Grant Budget Tracker", description: "Every grant with budget, spending and balance." },
  bva: { title: "Budget vs. Actual", description: "Every budget line: approved budget, actual, remaining, % spent and spending pace." },
  expenses: { title: "Expense detail", description: "Each expense with its grant, category, status and documents." },
  by_category: { title: "Spending by category", description: "Budget and actual summed by budget category across grants." },
  by_office: { title: "Spending by office", description: "Grant budgets and spending summed by field office." },
  by_region: { title: "Spending by region", description: "Grant budgets and spending summed by region." },
  by_funder: { title: "Spending by funder", description: "Grant budgets and spending summed by funder." },
  by_program: { title: "Spending by program", description: "Grant budgets and spending summed by program." },
  expiring: { title: "Grants nearing expiration", description: "Active grants ending within the chosen number of days." },
  underspent: { title: "Grants significantly underspent", description: "Spending is well behind how much of the grant period has passed." },
  budget_risk: { title: "Grants nearing or exceeding budget", description: "90%+ of budget spent, or a line already over budget." },
  missing_docs: { title: "Missing documentation", description: "Submitted or approved expenses that still need a receipt or invoice." },
} as const;
export type ReportKey = keyof typeof REPORTS;
export const isReportKey = (k: unknown): k is ReportKey => typeof k === "string" && k in REPORTS;

export type ReportFilters = {
  grant_id?: string;
  office_id?: string;
  region?: string;
  program?: string;
  funder?: string;
  status?: string; // grant status, or expense status for the expenses report
  category?: string;
  date_from?: string;
  date_to?: string;
  days?: number;
};

export function filtersFromParams(p: URLSearchParams): ReportFilters {
  const g = (k: string) => p.get(k)?.trim() || undefined;
  return {
    grant_id: g("grant_id"),
    office_id: g("office_id"),
    region: g("region"),
    program: g("program"),
    funder: g("funder"),
    status: g("status"),
    category: g("category"),
    date_from: g("date_from"),
    date_to: g("date_to"),
    days: p.get("days") ? Number(p.get("days")) : undefined,
  };
}

function grantFilter(f: ReportFilters, statusApplies = true) {
  return (g: GrantSummary) =>
    (!f.grant_id || g.id === f.grant_id) &&
    (!f.office_id || g.office_id === f.office_id) &&
    (!f.region || g.resolved_region === f.region) &&
    (!f.program || g.program === f.program) &&
    (!f.funder || g.funder === f.funder) &&
    (!statusApplies || !f.status || g.status === f.status);
}

const GRANT_COLS: Column[] = [
  { key: "code", label: "Grant code" },
  { key: "name", label: "Grant" },
  { key: "funder", label: "Funder" },
  { key: "program", label: "Program" },
  { key: "office", label: "Office" },
  { key: "region", label: "Region" },
  { key: "award_amount", label: "Award", type: "money" },
  { key: "total_budget", label: "Total budget", type: "money" },
  { key: "actual", label: "Actual spending", type: "money" },
  { key: "pending", label: "Pending approval", type: "money" },
  { key: "remaining", label: "Remaining", type: "money" },
  { key: "pct_spent", label: "% spent", type: "pct" },
  { key: "pct_time_elapsed", label: "% of period elapsed", type: "pct" },
  { key: "start_date", label: "Start", type: "date" },
  { key: "end_date", label: "End", type: "date" },
  { key: "days_left", label: "Days left", type: "int" },
  { key: "status", label: "Status" },
];

function grantRow(g: GrantSummary) {
  return {
    id: g.id,
    code: g.code,
    name: g.name,
    funder: g.funder,
    program: g.program,
    office: g.office_name ?? "",
    region: g.resolved_region ?? "",
    award_amount: g.award_amount,
    total_budget: g.total_budget,
    actual: g.actual,
    pending: g.pending,
    remaining: g.remaining,
    pct_spent: g.pct_spent,
    pct_time_elapsed: g.pct_time_elapsed,
    start_date: g.start_date,
    end_date: g.end_date,
    days_left: g.days_left,
    status: GRANT_STATUS_LABELS[g.status] ?? g.status,
    missing_docs: g.missing_docs,
  };
}

function sumCols(rows: Record<string, unknown>[], keys: string[]) {
  const t: Record<string, number> = {};
  for (const k of keys) t[k] = rows.reduce((s, r) => s + Number(r[k] ?? 0), 0);
  return t;
}

function groupGrants(grants: GrantSummary[], keyOf: (g: GrantSummary) => string, label: string): Pick<Report, "columns" | "rows" | "totals"> {
  const m = new Map<string, { group: string; grants: number; active: number; award_amount: number; total_budget: number; actual: number; pending: number; remaining: number }>();
  for (const g of grants) {
    const k = keyOf(g) || "Unassigned";
    const r = m.get(k) ?? { group: k, grants: 0, active: 0, award_amount: 0, total_budget: 0, actual: 0, pending: 0, remaining: 0 };
    r.grants++;
    if (g.status === "active") r.active++;
    r.award_amount += g.award_amount;
    r.total_budget += g.total_budget;
    r.actual += g.actual;
    r.pending += g.pending;
    r.remaining += g.remaining;
    m.set(k, r);
  }
  const rows = [...m.values()]
    .map((r) => ({ ...r, pct_spent: r.total_budget > 0 ? Math.round((r.actual / r.total_budget) * 1000) / 10 : null }))
    .sort((a, b) => b.total_budget - a.total_budget);
  return {
    columns: [
      { key: "group", label },
      { key: "grants", label: "Grants", type: "int" },
      { key: "active", label: "Active", type: "int" },
      { key: "award_amount", label: "Awards", type: "money" },
      { key: "total_budget", label: "Total budget", type: "money" },
      { key: "actual", label: "Actual spending", type: "money" },
      { key: "pending", label: "Pending approval", type: "money" },
      { key: "remaining", label: "Remaining", type: "money" },
      { key: "pct_spent", label: "% spent", type: "pct" },
    ],
    rows,
    totals: sumCols(rows, ["grants", "active", "award_amount", "total_budget", "actual", "pending", "remaining"]),
  };
}

export async function buildReport(viewer: GmViewer, key: ReportKey, f: ReportFilters): Promise<Report> {
  const admin = createAdminClient();
  const meta = REPORTS[key];
  const base = { key, title: meta.title, description: meta.description };
  const all = await loadGrantSummaries(viewer, admin);

  if (key === "master") {
    const rows = all.filter(grantFilter(f)).map(grantRow);
    return { ...base, columns: GRANT_COLS, rows, totals: sumCols(rows, ["award_amount", "total_budget", "actual", "pending", "remaining"]) };
  }

  if (key === "by_office" || key === "by_region" || key === "by_funder" || key === "by_program") {
    const grants = all.filter(grantFilter(f));
    const spec = {
      by_office: [(g: GrantSummary) => g.office_name ?? "", "Office"],
      by_region: [(g: GrantSummary) => g.resolved_region ?? "", "Region"],
      by_funder: [(g: GrantSummary) => g.funder, "Funder"],
      by_program: [(g: GrantSummary) => g.program, "Program"],
    }[key] as [(g: GrantSummary) => string, string];
    return { ...base, ...groupGrants(grants, spec[0], spec[1]) };
  }

  if (key === "expiring") {
    const days = f.days && f.days > 0 ? f.days : 90;
    const rows = all
      .filter(grantFilter(f, false))
      .filter((g) => g.status === "active" && g.days_left >= 0 && g.days_left <= days)
      .sort((a, b) => a.days_left - b.days_left)
      .map(grantRow);
    return { ...base, description: `Active grants ending within ${days} days.`, columns: GRANT_COLS, rows, totals: sumCols(rows, ["total_budget", "actual", "remaining"]) };
  }

  if (key === "underspent") {
    const rows = all.filter(grantFilter(f, false)).filter(isUnderspent).map(grantRow);
    return { ...base, columns: GRANT_COLS, rows, totals: sumCols(rows, ["total_budget", "actual", "remaining"]) };
  }

  if (key === "budget_risk") {
    const rows = all
      .filter(grantFilter(f, false))
      .filter((g) => g.status !== "closed" && (isOverBudget(g) || isNearBudget(g)))
      .map((g) => ({ ...grantRow(g), flag: isOverBudget(g) ? (g.actual > g.total_budget ? "Over budget" : `${g.over_budget_lines} line(s) over budget`) : "90%+ spent" }));
    return { ...base, columns: [...GRANT_COLS.slice(0, 3), { key: "flag", label: "Flag" }, ...GRANT_COLS.slice(3)], rows };
  }

  const grants = all.filter(grantFilter(f, key !== "expenses" && key !== "missing_docs"));
  const grantById = new Map(grants.map((g) => [g.id, g]));
  const ids = grants.map((g) => g.id);

  if (key === "bva" || key === "by_category") {
    const lines = (await loadLineSummaries(ids, admin)).filter((l) => !f.category || l.category === f.category);
    if (key === "by_category") {
      const m = new Map<string, { category: string; budget: number; original_budget: number; actual: number; pending: number; remaining: number; grants: Set<string> }>();
      for (const l of lines) {
        const r = m.get(l.category) ?? { category: l.category, budget: 0, original_budget: 0, actual: 0, pending: 0, remaining: 0, grants: new Set<string>() };
        r.budget += l.budget;
        r.original_budget += l.original_budget;
        r.actual += l.actual;
        r.pending += l.pending;
        r.remaining += l.remaining;
        r.grants.add(l.grant_id);
        m.set(l.category, r);
      }
      const rows = [...m.values()]
        .map(({ grants: gs, ...r }) => ({ ...r, grants: gs.size, pct_spent: r.budget > 0 ? Math.round((r.actual / r.budget) * 1000) / 10 : null }))
        .sort((a, b) => b.budget - a.budget);
      return {
        ...base,
        columns: [
          { key: "category", label: "Category" },
          { key: "grants", label: "Grants", type: "int" },
          { key: "original_budget", label: "Original budget", type: "money" },
          { key: "budget", label: "Current budget", type: "money" },
          { key: "actual", label: "Actual", type: "money" },
          { key: "pending", label: "Pending approval", type: "money" },
          { key: "remaining", label: "Remaining", type: "money" },
          { key: "pct_spent", label: "% spent", type: "pct" },
        ],
        rows,
        totals: sumCols(rows, ["original_budget", "budget", "actual", "pending", "remaining"]),
      };
    }
    const rows = lines
      .filter((l) => l.is_active || l.actual || l.budget)
      .sort((a, b) => {
        const ga = grantById.get(a.grant_id)?.code ?? "";
        const gb = grantById.get(b.grant_id)?.code ?? "";
        return ga.localeCompare(gb) || a.sort_order - b.sort_order;
      })
      .map((l) => {
        const g = grantById.get(l.grant_id)!;
        const expected = Math.round(l.budget * (g.pct_time_elapsed / 100) * 100) / 100;
        return {
          grant_id: g.id,
          code: g.code,
          name: g.name,
          funder: g.funder,
          category: l.category,
          subcategory: l.subcategory ?? "",
          original_budget: l.original_budget,
          budget: l.budget,
          actual: l.actual,
          pending: l.pending,
          remaining: l.remaining,
          variance: Math.round((l.actual - expected) * 100) / 100,
          pct_spent: l.pct_spent,
        };
      });
    return {
      ...base,
      columns: [
        { key: "code", label: "Grant code" },
        { key: "name", label: "Grant" },
        { key: "funder", label: "Funder" },
        { key: "category", label: "Category" },
        { key: "subcategory", label: "Subcategory" },
        { key: "original_budget", label: "Original budget", type: "money" },
        { key: "budget", label: "Approved budget", type: "money" },
        { key: "actual", label: "Actual", type: "money" },
        { key: "pending", label: "Pending approval", type: "money" },
        { key: "remaining", label: "Remaining", type: "money" },
        { key: "variance", label: "Variance vs. pace", type: "money" },
        { key: "pct_spent", label: "% spent", type: "pct" },
      ],
      rows,
      totals: sumCols(rows, ["original_budget", "budget", "actual", "pending", "remaining", "variance"]),
    };
  }

  // expenses / missing_docs
  if (!ids.length) return { ...base, columns: EXPENSE_COLS, rows: [] };
  type E = {
    id: string;
    grant_id: string;
    line_id: string;
    expense_date: string;
    vendor: string | null;
    amount: number;
    description: string;
    office_id: string | null;
    kind: string;
    payment_method: string | null;
    status: string;
    doc_required: boolean;
    source: string;
    external_ref: string | null;
    created_by: string | null;
    reviewed_by: string | null;
    gm_expense_documents: { id: string }[];
  };
  const expenses = await fetchAll<E>((from, to) => {
    let q = admin
      .from("gm_expenses")
      .select("id, grant_id, line_id, expense_date, vendor, amount, description, office_id, kind, payment_method, status, doc_required, source, external_ref, created_by, reviewed_by, gm_expense_documents(id)")
      .in("grant_id", ids)
      .order("expense_date", { ascending: false })
      .range(from, to);
    if (key === "missing_docs") q = q.in("status", ["submitted", "approved"]).eq("doc_required", true);
    else if (f.status) q = q.eq("status", f.status);
    else q = q.in("status", ["submitted", "approved"]);
    if (f.date_from) q = q.gte("expense_date", f.date_from);
    if (f.date_to) q = q.lte("expense_date", f.date_to);
    return q;
  });
  let list = key === "missing_docs" ? expenses.filter((e) => !e.gm_expense_documents?.length) : expenses;
  const lineIds = [...new Set(list.map((e) => e.line_id))];
  const lineMap = new Map<string, { category: string; subcategory: string | null }>();
  for (let i = 0; i < lineIds.length; i += 300) {
    const { data } = await admin.from("gm_budget_lines").select("id, category, subcategory").in("id", lineIds.slice(i, i + 300));
    (data ?? []).forEach((l: { id: string; category: string; subcategory: string | null }) => lineMap.set(l.id, l));
  }
  if (f.category) list = list.filter((e) => lineMap.get(e.line_id)?.category === f.category);
  const names = await nameMap(admin, list.flatMap((e) => [e.created_by, e.reviewed_by]));
  const { data: offices } = await admin.from("b2s_offices").select("id, field_office");
  const officeName = new Map((offices ?? []).map((o: { id: string; field_office: string }) => [o.id, o.field_office]));

  const rows = list.map((e) => {
    const g = grantById.get(e.grant_id)!;
    const l = lineMap.get(e.line_id);
    return {
      id: e.id,
      grant_id: e.grant_id,
      expense_date: e.expense_date,
      code: g.code,
      name: g.name,
      funder: g.funder,
      office: (e.office_id && officeName.get(e.office_id)) || g.office_name || "",
      category: l?.category ?? "",
      subcategory: l?.subcategory ?? "",
      vendor: e.vendor ?? "",
      description: e.description,
      amount: Number(e.amount),
      kind: EXPENSE_KIND_LABELS[e.kind as keyof typeof EXPENSE_KIND_LABELS] ?? e.kind,
      payment_method: e.payment_method ? PAYMENT_METHOD_LABELS[e.payment_method] ?? e.payment_method : "",
      status: EXPENSE_STATUS_LABELS[e.status as keyof typeof EXPENSE_STATUS_LABELS] ?? e.status,
      documents: e.gm_expense_documents?.length ?? 0,
      doc_missing: e.doc_required && !e.gm_expense_documents?.length ? "Yes" : "",
      reference: e.external_ref ?? "",
      entered_by: (e.created_by && names.get(e.created_by)) || "",
      approved_by: (e.reviewed_by && e.status === "approved" && names.get(e.reviewed_by)) || "",
    };
  });
  return { ...base, columns: EXPENSE_COLS, rows, totals: sumCols(rows, ["amount"]) };
}

const EXPENSE_COLS: Column[] = [
  { key: "expense_date", label: "Date", type: "date" },
  { key: "code", label: "Grant code" },
  { key: "name", label: "Grant" },
  { key: "funder", label: "Funder" },
  { key: "office", label: "Office" },
  { key: "category", label: "Category" },
  { key: "subcategory", label: "Subcategory" },
  { key: "vendor", label: "Vendor" },
  { key: "description", label: "Description" },
  { key: "amount", label: "Amount", type: "money" },
  { key: "kind", label: "Type" },
  { key: "payment_method", label: "Paid by" },
  { key: "status", label: "Status" },
  { key: "documents", label: "Docs", type: "int" },
  { key: "doc_missing", label: "Doc missing" },
  { key: "reference", label: "Reference" },
  { key: "entered_by", label: "Entered by" },
  { key: "approved_by", label: "Approved by" },
];

export { visibleGrantIds };
