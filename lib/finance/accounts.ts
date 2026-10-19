// ICNA Relief's expense chart of accounts, as used by the cleaned
// "Expenditure PowerBi" workbook. One list, three spellings:
//   office  - column header on the Expense-Total sheet (office rows)
//   grant   - column header on the Grants Expenses sheet
//   central - column header on the Central Expenses sheet (null = not used)
// plus `qb`, the line labels QuickBooks uses in the P&L by Class export
// (the raw "REGION WISE ... REPORT" files), so all three uploads and the
// QuickBooks pull land on the same account keys.
//
// Totals are never stored: every TOTAL column is the sum of its accounts
// (verified against the full 2025–2026 workbook), and an office's total
// expenditure is all accounts + its share of central costs.

export type AccountGroup = "personnel" | "travel" | "occupancy" | "payroll" | "operational" | "outreach";

export type Account = {
  key: string;
  label: string;
  group: AccountGroup;
  sub?: "fringe" | "contractual" | "b2s"; // nested total inside its group
  office: string;
  grant: string;
  central: string | null;
  qb?: string[]; // extra QuickBooks line labels that post to this account
};

export const GROUPS: { key: AccountGroup; label: string; officeTotal: string; grantTotal: string; centralTotal: string | null }[] = [
  { key: "personnel", label: "Personnel (6500)", officeTotal: "TOTAL 6500 -PERSONNEL", grantTotal: "Total 6500 · PERSONNEL", centralTotal: "TOTAL PERSONNEL" },
  { key: "travel", label: "Travelling (6505)", officeTotal: "TOTAL 6505 - TRAVELLING", grantTotal: "Total 6505 · TRAVELLING", centralTotal: "TOTAL TRAVELLING" },
  { key: "occupancy", label: "Occupancy (6510)", officeTotal: "TOTAL 6510 -OCCUPANCY", grantTotal: "Total 6510 · OCCUPANCY", centralTotal: "TOTAL OCCUPANCY" },
  { key: "payroll", label: "Payroll expenses (66000)", officeTotal: "", grantTotal: "", centralTotal: null },
  { key: "operational", label: "Operational cost (8000)", officeTotal: "TOTAL 8000 - OPERATIONAL COST", grantTotal: "Total 8000 · OPERATIONAL COST", centralTotal: "OPERATIONAL COST" },
  { key: "outreach", label: "Community outreach (9000)", officeTotal: "TOTAL 9000 - COMMUNITY OUTREACH", grantTotal: "Total 9000 · COMMUNITY OUTREACH", centralTotal: "TOTAL COMMUNITY OUTREACH" },
];

export const SUBTOTALS: { key: "fringe" | "contractual" | "b2s"; office: string; grant: string; central: string }[] = [
  { key: "fringe", office: "TOTAL 6502-FRINGE BENEFITS", grant: "Total 6502 · FRINGE BENEFITS", central: "Total Fringe Benefits" },
  { key: "contractual", office: "TOTAL 6503 - CONTRACTUAL SERVICES", grant: "Total 6503 · CONTRATUALSERVICES", central: "Total Contractual Services" },
  { key: "b2s", office: "TOTAL 8000-7 BACK TO SCHOOL", grant: "Total 8000-7 · BACK TO SCHOOL", central: "Total Back to School" },
];

const a = (key: string, label: string, group: AccountGroup, office: string, grant: string, central: string | null, extra: Partial<Account> = {}): Account => ({
  key,
  label,
  group,
  office,
  grant,
  central,
  ...extra,
});

export const ACCOUNTS: Account[] = [
  // 6500 Personnel
  a("6500", "Personnel (posted to parent)", "personnel", "6500-PERSONNEL", "6500 · PERSONNEL", null),
  a("6501", "Salaries & wages", "personnel", "6501-SALARIES & WAGES", "6501 · SALARIES AND WAGES", "Salaries & Wages", { qb: ["Gross Pay"] }),
  a("6502", "Fringe benefits (posted to parent)", "personnel", "6502-FRINGE BENEFITS", "6502 · FRINGE BENEFITS", null, { sub: "fringe" }),
  a("6502-1", "Health insurance", "personnel", "6502-1 HEALTH INSURANCE", "6502-1 · HEALTH INSURANCE", "Helath Insurance", { sub: "fringe", qb: ["Health Insurance", "Health Insuran"] }),
  a("6502-2", "FICA / payroll tax", "personnel", "6502-2 FICA", "6502-2 · FICA", "FICA", { sub: "fringe", qb: ["Paroll Tax", "Payroll Tax"] }),
  a("6502-3", "Retirement (401k match)", "personnel", "6502-3 RETIREMENT BENEFITS (401K)", "6502-3 · RETIREMENT BENEFITS(401(K))", "Retirement Benefits (401K)", { sub: "fringe", qb: ["401k EMPLOYER MATCH"] }),
  a("6502-4", "Unemployment insurance", "personnel", "6502-4 UNEMPLOYMENT INSURANCE", "6502-4 · UNEMPLOYMENT INSURANCE", "Unemployment Insurance", { sub: "fringe" }),
  a("6502-5", "Background checks", "personnel", "6502-5 BACKGROUND CHECKS", "6502-5 · BACKGROUND CHECKS", "Background Checks", { sub: "fringe" }),
  a("6502-6", "Payroll expenses (fringe)", "personnel", "6502-6 PAYROLL EXPENSES", "6502-6 · PAYROLL EXPENSES", "Payroll Expenses", { sub: "fringe" }),
  a("6502-other", "Fringe benefits – other", "personnel", "6502-FRINGE BENEFITS-OTHER", "6502 · FRINGE BENEFITS - Other", "Fringe Benefits-Other", { sub: "fringe" }),
  a("6503", "Contractual services (posted to parent)", "personnel", "6503-CONTRACTUAL SERVICES", "6503 · CONTRATUALSERVICES", null, { sub: "contractual" }),
  a("6503-1", "Interns", "personnel", "6503-1 INTERNS", "6503-1 · INTERNS", "Interns", { sub: "contractual" }),
  a("6503-2", "Counselors", "personnel", "6503-2 COUNSELOR", "6503-2 · COUNSELOR", "Counselors", { sub: "contractual" }),
  a("6503-3", "Speaker honorarium", "personnel", "6503-3 SPEAKERS HONORARIUM", "6503-3 · SPEAKERS HONORARIUM", "Speaker Honorarium", { sub: "contractual" }),
  a("6503-4", "Other contractors", "personnel", "6503-4 OTHERS", "6503-4 · OTHERS", "Other Contractual Services", { sub: "contractual" }),
  a("6503-other", "Contractual services – other", "personnel", "6503-CONTRACTUAL SERVICES - OTHER", "6503 · CONTRATUALSERVICES - Other", "Contractual Services-Other", { sub: "contractual" }),
  a("6500-other", "Personnel – other", "personnel", "6500 - PERSONNEL -OTHER", "6500 · PERSONNEL - Other", "Personel-Other"),
  // 6505 Travelling
  a("6505", "Travelling (posted to parent)", "travel", "6505-TRAVELLING", "6505 · TRAVELLING", null),
  a("6505-1", "Local commuting", "travel", "6505-1 LOCAL COMMUTING", "6505-1 · LOCAL COMMUTING", "Local Commuting"),
  a("6505-2", "Meetings", "travel", "6505-2 MEETINGS", "6505-2 · MEETINGS", "Meetings"),
  a("6505-3", "Conventions", "travel", "6505-3 CONVENTIONS", "6505-3 · CONVENTIONS", "Conventions"),
  a("6505-4", "Outreach travel", "travel", "6505-4 OUTREACH TRAVELING", "6505-4 · OUTREACH TRAVELING", "Outreach Travelling"),
  a("6505-other", "Travelling – other", "travel", "6505 - TRAVELLING - OTHER", "6505 · TRAVELLING - Other", "Travelling-Other"),
  // 6510 Occupancy
  a("6510", "Occupancy (posted to parent)", "occupancy", "6510-OCCUPANCY", "6510 · OCCUPANCY", null),
  a("6510-1", "Office rent", "occupancy", "6510-1 OFFICE", "6510-1 · OFFICE", "Office"),
  a("6510-2", "MFS pantry", "occupancy", "6510-2 MFS PANTRY", "6510-2 · MFS PANTRY", "MFS Pantry"),
  a("6510-3", "Utilities", "occupancy", "6510-3 UTILITIES", "6510-3 · UTILITIES", "Utilities"),
  a("6510-4", "Phone & internet", "occupancy", "6510-4 PHONE & INTERNET", "6510-4 · PHONE & INTERNET", "Phone & Internet"),
  a("6510-5", "Maintenance", "occupancy", "6510-5 MAINTENANCE", "6510-5 · MAINTENANCE", "Maintenance"),
  a("6510-6", "Transitional housing (WTH)", "occupancy", "6510-6 WTH", "6510-6 · WTH", "WTH"),
  a("6510-7", "Medical clinics", "occupancy", "6510-7 MEDICAL CLINICS", "6510-7 · MEDICAL CLINICS", "Medical Clinics"),
  a("6510-other", "Occupancy – other", "occupancy", "6510 - OCCUPANCY OTHER", "6510 · OCCUPANCY - Other", "Ocuupancy-Other"),
  // 66000
  a("66000", "Payroll expenses", "payroll", "66000 - PAYROLL EXPENSES", "66000 · Payroll Expenses", null),
  // 8000 Operational
  a("8000", "Operational cost (posted to parent)", "operational", "8000-OPERATIONAL COST", "8000 · OPERATIONAL COST", null),
  a("8000-25", "PEX card", "operational", "8000-25 PEX CARD", "8000-25 . PEX Card", "PEX Card", { qb: ["PEX Card", "8000-25 · PEX Card"] }),
  a("8000-26", "C-suite credit card", "operational", "8000-26 C-SUITE CREDIT CARD", "8000-26 . C-Suite Credit Card", "C-Suite Credit Card", { qb: ["C-Suite Credit Card", "Credit Card", "8000-26 · C-Suite Credit Card"] }),
  a("8000-10", "Departmental brochures", "operational", "8000-10 DEPARTMENTAL BROCHURES", "8000-10 · DEPARTMENTAL BROCHURES", "Departmental Brochures"),
  a("8000-14", "Advertising", "operational", "8000-14 ADVERTISING", "8000-14 · ADVERTISING", "Advertising"),
  a("8000-16", "Social media & marketing", "operational", "8000-16 SOCIAL MEDIA & MARKETING", "8000-16 · SOCIAL MEDIA MARKETING", "Social Media & Marketing"),
  a("8000-17", "Printing & publication", "operational", "8000-17 PRINTING & PUBLICATION", "8000-17 · PRINTING AND PUBLICATION", "Printing & Publication"),
  a("8000-18", "Office supplies", "operational", "8000-18 OFFICE SUPPLIES", "8000-18 · OFFICE SUPPLIES", "Office Supplies"),
  a("8000-19", "Insurance", "operational", "8000-19 INSURANCE", "8000-19 · INSURANCE", "Insurance"),
  a("8000-2", "Health services", "operational", "8000-2 HEALTH SERVICES", "8000-2 · HEALTH SERVICES", "Health Services"),
  a("8000-20", "Professional fees", "operational", "8000-20 PROFESSIONAL FEE", "8000-20 · PROFESSIONAL FEE", "Professional Fee"),
  a("8000-21", "Postage", "operational", "8000-21 POSTAGE", "8000-21 · POSTAGE", "Postage"),
  a("8000-22", "Vehicle repair & maintenance", "operational", "8000-22 VEHICLE REPAIR & MAINTENANCE", "8000-22 · VEHICLE REPAIR AND MAINTENANCE", "Vehicle Repair & Maintenance"),
  a("8000-23", "Bank charges", "operational", "8000-23 BANK CHARGES", "8000-23 · BANK CHARGES", "Bank Charges"),
  a("8000-24", "Depreciation", "operational", "8000-24 DEPRECIATION EXPENSES", "8000-24 · DEPRECIATION EXPENSES", "Depreciation Expenses"),
  a("8000-3", "Transitional housing", "operational", "8000-3 TRANSITIONAL HOUSING", "8000-3 · TRANSITIONAL HOUSING", "Transitional Housing"),
  a("8000-4", "Hunger prevention", "operational", "8000-4 HUNGER PREVENTION", "8000-4 · HUNGER PREVENTION", "Hunger Prevention"),
  a("8000-5", "Muslim family services", "operational", "8000-5 MUSLIM FAMILY SERVICES", "8000-5 · MUSLIM FAMILY SERVICE", "Muslim Family Services"),
  a("8000-6", "Disaster relief", "operational", "8000-6 DISASTER RELIEF ", "8000-6 · DISASTER RELIEF", "Disaster Relief"),
  a("8000-7", "Back to school (posted to parent)", "operational", "8000-7 BACK TO SCHOOL", "8000-7 · BACK TO SCHOOL", null, { sub: "b2s" }),
  a("8000-7A", "Empower grant", "operational", "8000-7A EMPOWER GRANT", "8000-7A · EMPOWERMENT GRANT", "Empowerment Grant", { sub: "b2s" }),
  a("8000-7B", "Student financial assistance", "operational", "8000-7B STUDENT FINANCIAL ASSISTANCE", "8000-7B · STUDENT FINANCIAL ASSISTANCE", "SFA", { sub: "b2s" }),
  a("8000-7-other", "Back to school – other", "operational", "8000-7 BACK TO SCHOOL - OTHER", "8000-7 · BACK TO SCHOOL - Other", "Bac to School-Other", { sub: "b2s" }),
  a("8000-8", "Refugee services", "operational", "8000-8 REFUGEE SERVICES", "8000-8 · REFUGEES SERVICES", "Refugee Services"),
  a("8000-other", "Operational cost – other", "operational", "8000 - OPERATIONAL COST - OTHER", "8000 · OPERATIONAL COST - Other", "Operational Cost-Other"),
  // 9000 Community outreach
  a("9000", "Community outreach (posted to parent)", "outreach", "9000 - COMMUNITY OUTREACH", "9000 · COMMUNITY OUTREACH", null),
  a("9000-1", "Conferences", "outreach", "9000-1 CONFRENCES", "9000-1 · CONFERENCES", "Confrences-Outreach"),
  a("9000-2", "Sponsorships", "outreach", "9000-2 SPONSORSHIPS", "9000-2 · SPONSORSHIPS", "Sponsorships"),
  a("9000-3", "Skill development", "outreach", "9000-3 SKILL DEVELOPMENT", "9000-3 · SKILL DEVELOPMENT", "Skill Development"),
  a("9000-other", "Community outreach – other", "outreach", "9000- COMMUNITY OUTREACH - OTHER", "9000 · COMMUNITY OUTREACH - Other", "Community Outreach-Other"),
];

export const ACCOUNT = new Map(ACCOUNTS.map((x) => [x.key, x]));

export type Amounts = Record<string, number>;

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);

export function groupTotal(amounts: Amounts, group: AccountGroup): number {
  return ACCOUNTS.filter((x) => x.group === group).reduce((s, x) => s + num(amounts[x.key]), 0);
}
export function subTotal(amounts: Amounts, sub: "fringe" | "contractual" | "b2s"): number {
  return ACCOUNTS.filter((x) => x.sub === sub).reduce((s, x) => s + num(amounts[x.key]), 0);
}
export function accountsTotal(amounts: Amounts): number {
  return ACCOUNTS.reduce((s, x) => s + num(amounts[x.key]), 0);
}

// Keep only known account keys with non-zero numbers, rounded to cents.
export function cleanAmounts(input: Record<string, unknown>): Amounts {
  const out: Amounts = {};
  for (const x of ACCOUNTS) {
    const v = Number(input[x.key]);
    if (Number.isFinite(v) && Math.abs(v) >= 0.005) out[x.key] = Math.round(v * 100) / 100;
  }
  return out;
}

// Normalise a header or QuickBooks line label for matching: case, spacing,
// "·"/"." separators and stray punctuation don't matter.
export const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/[·.]/g, " ")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

// QuickBooks / header label → account key (any of the three spellings or
// the extra QuickBooks labels).
export const ACCOUNT_BY_LABEL = (() => {
  const m = new Map<string, string>();
  for (const x of ACCOUNTS) {
    for (const l of [x.office, x.grant, x.central, ...(x.qb ?? [])]) if (l) m.set(norm(l), x.key);
  }
  // QuickBooks Online may show names without the account number
  // ("SALARIES AND WAGES") — add those too, without overriding.
  for (const x of ACCOUNTS) {
    for (const l of [x.office, x.grant, x.central]) {
      const bare = l ? norm(l.replace(/^\s*\d{4}(-\d+)?\s*[·.\-]?\s*/, "")) : "";
      if (bare && !m.has(bare)) m.set(bare, x.key);
    }
  }
  return m;
})();

export const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
export const quarterOf = (month: number) => `Q${Math.ceil(month / 3)}`;
