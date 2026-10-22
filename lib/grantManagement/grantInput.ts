import { PROGRAMS } from "./shared";

export const GRANT_FIELDS = [
  "name",
  "funder",
  "code",
  "program",
  "office_id",
  "region",
  "state",
  "award_amount",
  "start_date",
  "end_date",
  "funder_fiscal_year",
  "status",
  "approval_required",
  "doc_required_over",
  "notes",
  "revenue_grant_id",
] as const;

export type GrantInput = {
  name: string;
  funder: string;
  code: string;
  program: string;
  office_id: string | null;
  region: string | null;
  state: string | null;
  award_amount: number;
  start_date: string;
  end_date: string;
  funder_fiscal_year: string | null;
  status: "draft" | "active" | "on_hold" | "closed";
  approval_required: boolean;
  doc_required_over: number;
  notes: string | null;
  revenue_grant_id: string | null;
};

const isDate = (s: unknown) => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);

export function cleanGrantInput(body: Record<string, unknown>): { input?: GrantInput; errors: Record<string, string> } {
  const errors: Record<string, string> = {};
  const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
  const award = Math.round(Number(body.award_amount) * 100) / 100;
  const threshold = body.doc_required_over === "" || body.doc_required_over == null ? 0 : Number(body.doc_required_over);
  const status = (str(body.status) ?? "draft") as GrantInput["status"];

  if (!str(body.name)) errors.name = "Enter the grant name.";
  if (!str(body.funder)) errors.funder = "Enter the funder.";
  if (!str(body.code)) errors.code = "Enter the grant / project code.";
  else if (!/^[A-Za-z0-9._\-/ ]{2,40}$/.test(str(body.code)!)) errors.code = "Use letters, numbers, dashes or dots (2-40 characters).";
  if (!str(body.program) || !PROGRAMS.includes(str(body.program)!)) errors.program = "Pick the program.";
  if (!Number.isFinite(award) || award <= 0) errors.award_amount = "Enter the award amount.";
  if (!isDate(body.start_date)) errors.start_date = "Enter the start date.";
  if (!isDate(body.end_date)) errors.end_date = "Enter the end date.";
  if (isDate(body.start_date) && isDate(body.end_date) && String(body.end_date) < String(body.start_date)) errors.end_date = "End date is before the start date.";
  if (!Number.isFinite(threshold) || threshold < 0) errors.doc_required_over = "Enter 0 or more.";
  if (!["draft", "active", "on_hold", "closed"].includes(status)) errors.status = "Unknown status.";
  if (!str(body.office_id) && !str(body.region)) errors.office_id = "Pick the field office (or at least a region).";

  if (Object.keys(errors).length) return { errors };
  return {
    errors,
    input: {
      name: str(body.name)!.slice(0, 200),
      funder: str(body.funder)!.slice(0, 200),
      code: str(body.code)!.toUpperCase(),
      program: str(body.program)!,
      office_id: str(body.office_id),
      region: str(body.region),
      state: str(body.state),
      award_amount: award,
      start_date: String(body.start_date),
      end_date: String(body.end_date),
      funder_fiscal_year: str(body.funder_fiscal_year),
      status,
      approval_required: body.approval_required !== false,
      doc_required_over: Math.round(threshold * 100) / 100,
      notes: str(body.notes),
      revenue_grant_id: str(body.revenue_grant_id),
    },
  };
}

export type BudgetLineInput = { line_id?: string | null; category: string; subcategory: string | null; amount: number };

export function cleanBudgetLines(raw: unknown): { lines?: BudgetLineInput[]; error?: string } {
  if (!Array.isArray(raw)) return { error: "No budget lines sent." };
  const seen = new Set<string>();
  const lines: BudgetLineInput[] = [];
  for (const r of raw as Record<string, unknown>[]) {
    const category = typeof r.category === "string" ? r.category.trim() : "";
    const subcategory = typeof r.subcategory === "string" && r.subcategory.trim() ? r.subcategory.trim() : null;
    const amount = Math.round(Number(r.amount ?? 0) * 100) / 100;
    if (!category) return { error: "Every line needs a category." };
    if (!Number.isFinite(amount) || amount < 0) return { error: `${category}${subcategory ? ` › ${subcategory}` : ""}: amount must be 0 or more.` };
    const key = `${category.toLowerCase()}|${(subcategory ?? "").toLowerCase()}`;
    if (seen.has(key)) return { error: `${category}${subcategory ? ` › ${subcategory}` : ""} is listed twice.` };
    seen.add(key);
    lines.push({ line_id: typeof r.line_id === "string" ? r.line_id : null, category: category.slice(0, 120), subcategory: subcategory?.slice(0, 120) ?? null, amount });
  }
  return { lines };
}
