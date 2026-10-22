import { createAdminClient } from "@/lib/grantManagement/server";
import { docRequiredFor } from "./server";
import { EXPENSE_KIND_LABELS, type ExpenseKind } from "./shared";

type Admin = ReturnType<typeof createAdminClient>;

// Bulk upload: payroll, fringe, allocations, indirect, recurring entries
// (kind "expenses") or PEX card transactions (kind "pex"). The browser
// turns the CSV/Excel into header -> value rows; this normalises the
// headers, checks every row, and reports problems per row.

export const EXPENSE_TEMPLATE = ["Grant Code", "Category", "Subcategory", "Date", "Amount", "Type", "Vendor / Payee", "Description", "Payment Method", "Reference"];
export const PEX_TEMPLATE = ["Transaction ID", "Date", "Card Holder", "Card Last 4", "Merchant", "Amount", "Memo", "Employee Email"];

const ALIASES: Record<string, string> = {
  grantcode: "grant_code", grant: "grant_code", projectcode: "grant_code", code: "grant_code", grantprojectcode: "grant_code",
  category: "category", budgetcategory: "category", line: "category",
  subcategory: "subcategory", subcat: "subcategory", lineitem: "subcategory",
  date: "date", expensedate: "date", transactiondate: "date", postdate: "date", paydate: "date", trandate: "date",
  amount: "amount", total: "amount", transactionamount: "amount", amt: "amount",
  type: "type", expensetype: "type", kind: "type",
  vendor: "vendor", vendorpayee: "vendor", payee: "vendor", merchant: "vendor", merchantname: "vendor", employee: "vendor",
  description: "description", memo: "description", businesspurpose: "description", purpose: "description", note: "description", notes: "description",
  paymentmethod: "payment_method", paidby: "payment_method", method: "payment_method",
  reference: "reference", ref: "reference", referenceno: "reference", checkno: "reference", journalno: "reference",
  transactionid: "external_id", id: "external_id", pextransactionid: "external_id", transid: "external_id",
  cardholder: "card_holder", cardholdername: "card_holder", name: "card_holder",
  cardlast4: "card_last4", last4: "card_last4", card: "card_last4", cardnumber: "card_last4",
  employeeemail: "employee_email", email: "employee_email",
};

export function normaliseRow(raw: Record<string, unknown>, kind: "expenses" | "pex") {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw)) {
    const key = k.toLowerCase().replace(/[^a-z0-9]/g, "");
    let field = ALIASES[key];
    if (kind === "pex" && field === "description") field = "memo";
    if (kind === "pex" && field === "vendor") field = "merchant";
    if (field && out[field] == null) out[field] = v == null ? "" : String(v).trim();
  }
  return out;
}

export function parseDate(v: string): string | null {
  if (!v) return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(v)) return v.slice(0, 10);
  const m = v.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})/);
  if (m) {
    const y = m[3].length === 2 ? `20${m[3]}` : m[3];
    return `${y}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`;
  }
  // Excel serial number
  const n = Number(v);
  if (Number.isFinite(n) && n > 20000 && n < 80000) {
    const d = new Date(Math.round((n - 25569) * 86400 * 1000));
    return d.toISOString().slice(0, 10);
  }
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

export function parseAmount(v: string): number | null {
  if (v == null || v === "") return null;
  const neg = /^\(.*\)$/.test(v.trim()) || v.trim().startsWith("-");
  const n = Number(v.replace(/[^0-9.]/g, ""));
  if (!Number.isFinite(n)) return null;
  return Math.round((neg ? -n : n) * 100) / 100;
}

const KIND_WORDS: [RegExp, ExpenseKind][] = [
  [/payroll|salar|wage/i, "payroll"],
  [/fringe|fica|benefit|insurance|unemploy/i, "fringe"],
  [/alloc/i, "allocation"],
  [/indirect|overhead|admin/i, "indirect"],
  [/purchase|invoice|receipt|vendor/i, "purchase"],
  [/other|journal|adjust/i, "other"],
];
export function parseKind(v: string): ExpenseKind | null {
  if (!v) return null;
  for (const [re, k] of KIND_WORDS) if (re.test(v)) return k;
  return null;
}
const PM: [RegExp, string][] = [
  [/pex/i, "pex"],
  [/corp|card|credit/i, "corporate_card"],
  [/check|cheque/i, "check"],
  [/ach|wire|eft|transfer/i, "ach"],
  [/reimb/i, "reimbursement"],
  [/payroll/i, "payroll"],
  [/journal|je\b/i, "journal"],
];
export function parsePayment(v: string): string | null {
  if (!v) return null;
  for (const [re, k] of PM) if (re.test(v)) return k;
  return "other";
}

export type CheckedExpense = {
  row: number;
  errors: string[];
  warnings: string[];
  data?: {
    grant_id: string;
    line_id: string;
    expense_date: string;
    vendor: string | null;
    amount: number;
    description: string;
    kind: ExpenseKind;
    payment_method: string | null;
    external_ref: string | null;
    office_id: string | null;
    program: string;
    doc_required: boolean;
  };
  display: Record<string, string>;
};

export async function checkExpenseRows(admin: Admin, rows: Record<string, unknown>[]): Promise<CheckedExpense[]> {
  const norm = rows.map((r) => normaliseRow(r, "expenses"));
  const codes = [...new Set(norm.map((r) => (r.grant_code ?? "").toUpperCase()).filter(Boolean))];
  const { data: grants } = codes.length
    ? await admin.from("gm_grants").select("id, code, name, status, start_date, end_date, office_id, program, doc_required_over").in("code", codes)
    : { data: [] };
  const grantByCode = new Map((grants ?? []).map((g: { code: string }) => [g.code.toUpperCase(), g as Record<string, unknown> & { id: string; code: string; status: string; start_date: string; end_date: string; office_id: string | null; program: string; doc_required_over: number; name: string }]));
  const gids = (grants ?? []).map((g: { id: string }) => g.id);
  const { data: lines } = gids.length ? await admin.from("gm_budget_lines").select("id, grant_id, category, subcategory, is_active").in("grant_id", gids) : { data: [] };
  const lineKey = (gid: string, c: string, s: string) => `${gid}|${c.trim().toLowerCase()}|${s.trim().toLowerCase()}`;
  const lineMap = new Map((lines ?? []).map((l: { id: string; grant_id: string; category: string; subcategory: string | null; is_active: boolean }) => [lineKey(l.grant_id, l.category, l.subcategory ?? ""), l]));
  // a category with exactly one line can be matched without a subcategory
  const byCat = new Map<string, { id: string; is_active: boolean }[]>();
  for (const l of lines ?? []) {
    const k = `${l.grant_id}|${String(l.category).toLowerCase()}`;
    byCat.set(k, [...(byCat.get(k) ?? []), l]);
  }

  const seen = new Set<string>();
  const out: CheckedExpense[] = [];
  for (let i = 0; i < norm.length; i++) {
    const r = norm[i];
    const errors: string[] = [];
    const warnings: string[] = [];
    if (Object.values(r).every((v) => !v)) continue; // blank line
    const g = grantByCode.get((r.grant_code ?? "").toUpperCase());
    if (!r.grant_code) errors.push("Grant code is missing.");
    else if (!g) errors.push(`No grant with code ${r.grant_code}.`);
    else if (g.status !== "active") errors.push(`Grant ${g.code} isn't open for spending (${g.status}).`);

    let line: { id: string; is_active: boolean } | undefined;
    if (g) {
      if (!r.category) errors.push("Category is missing.");
      else {
        line = lineMap.get(lineKey(g.id, r.category, r.subcategory ?? ""));
        if (!line && !r.subcategory) {
          const opts = byCat.get(`${g.id}|${r.category.toLowerCase()}`) ?? [];
          if (opts.length === 1) line = opts[0];
          else if (opts.length > 1) errors.push(`${r.category} has subcategories in ${g.code}; say which one.`);
        }
        if (!line && !errors.length) errors.push(`${r.category}${r.subcategory ? ` › ${r.subcategory}` : ""} isn't in ${g.code}'s budget.`);
        else if (line && !line.is_active) errors.push(`${r.category}${r.subcategory ? ` › ${r.subcategory}` : ""} is no longer in ${g.code}'s current budget.`);
      }
    }
    const date = parseDate(r.date ?? "");
    if (!date) errors.push("Date is missing or unreadable.");
    else if (g && (date < g.start_date || date > g.end_date)) errors.push(`Date ${date} is outside ${g.code}'s period (${g.start_date} to ${g.end_date}).`);
    const amount = parseAmount(r.amount ?? "");
    if (amount == null || amount === 0) errors.push("Amount is missing.");
    const kind = parseKind(r.type ?? "") ?? (r.type ? null : "other");
    if (!kind) errors.push(`Type "${r.type}" isn't recognised (use Payroll, Fringe, Allocation, Indirect, Purchase or Other).`);
    if (kind === "purchase" && !r.vendor) errors.push("Vendor is required for purchases.");
    const description = r.description || [kind ? EXPENSE_KIND_LABELS[kind].split(" (")[0] : "", r.vendor, date].filter(Boolean).join(" · ");

    const dupKey = `${g?.id}|${line?.id}|${date}|${amount}|${r.reference ?? ""}|${r.vendor ?? ""}`;
    if (seen.has(dupKey)) warnings.push("Same as an earlier row in this file.");
    seen.add(dupKey);

    out.push({
      row: i + 2,
      errors,
      warnings,
      display: { grant: g?.code ?? r.grant_code ?? "", category: [r.category, r.subcategory].filter(Boolean).join(" › "), date: date ?? r.date ?? "", amount: amount != null ? String(amount) : r.amount ?? "", type: kind ?? r.type ?? "", vendor: r.vendor ?? "", description },
      data:
        errors.length || !g || !line || !date || amount == null || !kind
          ? undefined
          : {
              grant_id: g.id,
              line_id: line.id,
              expense_date: date,
              vendor: r.vendor || null,
              amount,
              description: description.slice(0, 500),
              kind,
              payment_method: parsePayment(r.payment_method ?? "") ?? (kind === "payroll" || kind === "fringe" ? "payroll" : "journal"),
              external_ref: r.reference || null,
              office_id: g.office_id,
              program: g.program,
              doc_required: docRequiredFor(kind, amount, Number(g.doc_required_over)),
            },
    });
  }

  // Already in the system? (re-uploading the same payroll file)
  const ready = out.filter((o) => o.data);
  if (ready.length) {
    const dates = ready.map((o) => o.data!.expense_date).sort();
    const { data: existing } = await admin
      .from("gm_expenses")
      .select("grant_id, line_id, expense_date, amount, external_ref")
      .in("grant_id", [...new Set(ready.map((o) => o.data!.grant_id))])
      .gte("expense_date", dates[0])
      .lte("expense_date", dates.at(-1)!)
      .neq("status", "rejected");
    const ex = new Set((existing ?? []).map((e: { grant_id: string; line_id: string; expense_date: string; amount: number; external_ref: string | null }) => `${e.grant_id}|${e.line_id}|${e.expense_date}|${Number(e.amount)}|${e.external_ref ?? ""}`));
    for (const o of ready) {
      const d = o.data!;
      if (ex.has(`${d.grant_id}|${d.line_id}|${d.expense_date}|${d.amount}|${d.external_ref ?? ""}`)) o.warnings.push("Looks like it's already been entered.");
    }
  }
  return out;
}

export type CheckedPex = {
  row: number;
  errors: string[];
  warnings: string[];
  data?: { external_id: string | null; card_holder: string | null; card_last4: string | null; employee_id: string | null; transaction_date: string; merchant: string | null; amount: number; memo: string | null };
  display: Record<string, string>;
};

export async function checkPexRows(admin: Admin, rows: Record<string, unknown>[]): Promise<CheckedPex[]> {
  const norm = rows.map((r) => normaliseRow(r, "pex"));
  const amounts = norm.map((r) => parseAmount(r.amount ?? "")).filter((n): n is number => n != null && n !== 0);
  // PEX exports show spending as negative numbers; flip so spend is positive.
  const flip = amounts.length > 0 && amounts.filter((n) => n < 0).length > amounts.length / 2;

  const { data: emps } = await admin.from("employees").select("id, first_name, last_name, email").eq("is_active", true);
  const byEmail = new Map((emps ?? []).map((e: { id: string; email: string }) => [String(e.email).toLowerCase(), e.id]));
  const byName = new Map<string, string | null>();
  for (const e of emps ?? []) {
    const k = `${e.first_name} ${e.last_name}`.toLowerCase().replace(/\s+/g, " ").trim();
    byName.set(k, byName.has(k) ? null : e.id); // null = ambiguous
  }

  const ids = norm.map((r) => r.external_id).filter(Boolean);
  const { data: existing } = ids.length ? await admin.from("gm_pex_transactions").select("external_id").in("external_id", ids) : { data: [] };
  const known = new Set((existing ?? []).map((e: { external_id: string }) => e.external_id));
  const seen = new Set<string>();

  const out: CheckedPex[] = [];
  for (let i = 0; i < norm.length; i++) {
    const r = norm[i];
    if (Object.values(r).every((v) => !v)) continue;
    const errors: string[] = [];
    const warnings: string[] = [];
    const date = parseDate(r.date ?? "");
    let amount = parseAmount(r.amount ?? "");
    if (amount != null && flip) amount = -amount;
    if (!date) errors.push("Date is missing or unreadable.");
    if (amount == null || amount === 0) errors.push("Amount is missing.");
    if (r.external_id && known.has(r.external_id)) errors.push("Already imported.");
    if (r.external_id && seen.has(r.external_id)) errors.push("Listed twice in this file.");
    if (r.external_id) seen.add(r.external_id);
    if (!r.external_id) warnings.push("No transaction ID, so re-uploading this file would duplicate it.");
    const employee_id =
      (r.employee_email && byEmail.get(r.employee_email.toLowerCase())) ||
      (r.card_holder && byName.get(r.card_holder.toLowerCase().replace(/\s+/g, " ").trim())) ||
      null;
    if (!employee_id) warnings.push("Couldn't match the card holder to an employee. Grant Management will need to assign it.");
    out.push({
      row: i + 2,
      errors,
      warnings,
      display: { id: r.external_id ?? "", date: date ?? r.date ?? "", holder: r.card_holder ?? r.employee_email ?? "", merchant: r.merchant ?? "", amount: amount != null ? String(amount) : r.amount ?? "" },
      data:
        errors.length || !date || amount == null
          ? undefined
          : {
              external_id: r.external_id || null,
              card_holder: r.card_holder || null,
              card_last4: r.card_last4 ? r.card_last4.replace(/\D/g, "").slice(-4) || null : null,
              employee_id,
              transaction_date: date,
              merchant: r.merchant || null,
              amount,
              memo: r.memo || null,
            },
    });
  }
  return out;
}
