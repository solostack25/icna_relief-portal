// Grant Management - constants and helpers safe to import from client
// components. Server-only logic lives in ./server.ts.

export type GmRole = "gm_admin" | "grant_manager" | "approver" | "office_user";
export type MemberRole = "grant_manager" | "approver" | "office_user" | "viewer";
export type GrantStatus = "draft" | "active" | "on_hold" | "closed";
export type ExpenseStatus = "draft" | "submitted" | "approved" | "rejected" | "returned";
export type ExpenseKind = "purchase" | "payroll" | "fringe" | "allocation" | "indirect" | "other";

export const GM_ROLE_LABELS: Record<GmRole, string> = {
  gm_admin: "Administrator",
  grant_manager: "Grant Management",
  approver: "Office Approver / Area Manager",
  office_user: "Local Office User",
};

export const MEMBER_ROLE_LABELS: Record<MemberRole, string> = {
  grant_manager: "Grant manager",
  approver: "Approver",
  office_user: "Enters expenses",
  viewer: "View only",
};

export const PROGRAMS = [
  "Back2School",
  "Disaster Relief Services",
  "FATE",
  "General",
  "Health Services",
  "Hunger Prevention",
  "Refugee Services",
  "Transitional Housing",
];

export const GRANT_STATUS_LABELS: Record<GrantStatus, string> = {
  draft: "Setting up",
  active: "Active",
  on_hold: "On hold",
  closed: "Closed",
};
export const GRANT_STATUS_COLORS: Record<GrantStatus, string> = {
  draft: "#A57420",
  active: "#1F6F54",
  on_hold: "#3E7C9A",
  closed: "#8A8A8A",
};

export const EXPENSE_STATUS_LABELS: Record<ExpenseStatus, string> = {
  draft: "Draft",
  submitted: "Submitted",
  approved: "Approved",
  rejected: "Rejected",
  returned: "Returned for correction",
};
export const EXPENSE_STATUS_COLORS: Record<ExpenseStatus, string> = {
  draft: "#8A8A8A",
  submitted: "#A57420",
  approved: "#1F6F54",
  rejected: "#B5566B",
  returned: "#3E7C9A",
};

export const EXPENSE_KIND_LABELS: Record<ExpenseKind, string> = {
  purchase: "Purchase / invoice",
  payroll: "Payroll",
  fringe: "Fringe benefits (FICA, insurance…)",
  allocation: "Allocated cost",
  indirect: "Indirect cost",
  other: "Other journal entry",
};
// Kinds that never come with a receipt.
export const NO_RECEIPT_KINDS: ExpenseKind[] = ["payroll", "fringe", "allocation", "indirect", "other"];

export const PAYMENT_METHOD_LABELS: Record<string, string> = {
  pex: "PEX card",
  corporate_card: "Corporate card",
  check: "Check",
  ach: "ACH / wire",
  reimbursement: "Employee reimbursement",
  payroll: "Payroll",
  journal: "Journal entry",
  other: "Other",
};

export const DOC_TYPE_LABELS: Record<string, string> = {
  receipt: "Receipt",
  invoice: "Invoice",
  purchase_order: "Purchase order",
  contract: "Contract",
  approval: "Approval",
  timesheet: "Timesheet / payroll register",
  other: "Other",
};

// Flags used on the dashboard and in reports. Kept in one place so the
// dashboard counts and the report lists always agree.
export const FLAGS = {
  nearBudgetPct: 90, // % of budget spent
  underspendGapPts: 25, // time elapsed minus % spent
  underspendMinElapsedPct: 25, // don't flag in the first quarter of a grant
};

export type GrantSummary = {
  id: string;
  name: string;
  funder: string;
  code: string;
  program: string;
  office_id: string | null;
  office_name: string | null;
  resolved_region: string | null;
  resolved_state: string | null;
  award_amount: number;
  start_date: string;
  end_date: string;
  funder_fiscal_year: string | null;
  status: GrantStatus;
  approval_required: boolean;
  doc_required_over: number;
  total_budget: number;
  actual: number;
  pending: number;
  remaining: number;
  pct_spent: number | null;
  pct_time_elapsed: number;
  days_left: number;
  missing_docs: number;
  expense_count: number;
  over_budget_lines: number;
  budget_version: number | null;
};

export type LineSummary = {
  line_id: string;
  grant_id: string;
  category: string;
  subcategory: string | null;
  sort_order: number;
  is_active: boolean;
  budget: number;
  original_budget: number;
  actual: number;
  pending: number;
  remaining: number;
  pct_spent: number | null;
};

export function isOverBudget(g: Pick<GrantSummary, "actual" | "total_budget" | "over_budget_lines">) {
  return Number(g.actual) > Number(g.total_budget) || Number(g.over_budget_lines) > 0;
}
export function isNearBudget(g: Pick<GrantSummary, "pct_spent">) {
  return g.pct_spent != null && Number(g.pct_spent) >= FLAGS.nearBudgetPct && Number(g.pct_spent) <= 100;
}
export function isUnderspent(g: Pick<GrantSummary, "status" | "pct_spent" | "pct_time_elapsed">) {
  if (g.status !== "active") return false;
  const elapsed = Number(g.pct_time_elapsed);
  return elapsed >= FLAGS.underspendMinElapsedPct && elapsed - Number(g.pct_spent ?? 0) >= FLAGS.underspendGapPts;
}

export function lineLabel(l: { category: string; subcategory: string | null }) {
  return l.subcategory ? `${l.category} › ${l.subcategory}` : l.category;
}

export const money = (n: number | string | null | undefined, cents = false) =>
  `${Number(n ?? 0) < 0 ? "-" : ""}$${Math.abs(Number(n ?? 0)).toLocaleString("en-US", {
    minimumFractionDigits: cents ? 2 : 0,
    maximumFractionDigits: cents ? 2 : 0,
  })}`;

export const pct = (n: number | string | null | undefined) => (n == null ? "—" : `${Number(n).toFixed(1)}%`);

export function fmtDate(d: string | null | undefined) {
  if (!d) return "—";
  const iso = d.length === 10 ? `${d}T12:00:00` : d;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function periodLabel(start: string, end: string) {
  const s = new Date(`${start}T12:00:00`);
  const e = new Date(`${end}T12:00:00`);
  const f = (d: Date) => d.toLocaleDateString("en-US", { month: "short", year: "numeric" });
  return `${f(s)} – ${f(e)}`;
}
