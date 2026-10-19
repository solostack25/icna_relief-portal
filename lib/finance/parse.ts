import * as XLSX from "xlsx";
import { ACCOUNT, ACCOUNT_BY_LABEL, MONTHS, norm, type Amounts } from "./accounts";
import type { ExpenseRowInput, Scope } from "./expenses";

// ─── Cleaned workbook / CSV ─────────────────────────────────────────────────
// Accepts the "Expenditure PowerBi" workbook (any of its three sheets) or a
// CSV of one sheet. The sheet type is told apart by its headers; account
// columns are matched by name (TOTAL columns are recalculated, so ignored).

export type CleanedSheet = { name: string; scope: Scope; rows: number; skippedEmpty: number; unknownColumns: string[] };

const META = new Set(
  ["year", "quarter", "month", "mtn", "msn", "rsn", "dsn", "region", "chapter", "state", "field office", "revenue", "revnue expenditure", "total expenditure", "total central departments share", "department", "department subheads", "grant revenue", "surplus deficit", "total"].map(norm)
);

const monthNum = (v: unknown): number | null => {
  if (typeof v === "number" && v >= 1 && v <= 12) return Math.trunc(v);
  const s = String(v ?? "").trim().toLowerCase();
  if (!s) return null;
  const i = MONTHS.findIndex((m) => m.toLowerCase().startsWith(s.slice(0, 3)));
  return i >= 0 ? i + 1 : null;
};
const numOrNull = (v: unknown) => {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(/[$,\s]/g, "").replace(/^\((.*)\)$/, "-$1"));
  return Number.isFinite(n) ? n : null;
};

export function parseCleaned(buf: ArrayBuffer | Buffer, fileName: string): { rows: ExpenseRowInput[]; sheets: CleanedSheet[]; warnings: string[] } {
  const wb = XLSX.read(buf, { type: Buffer.isBuffer(buf) ? "buffer" : "array", raw: false, cellDates: false });
  const rows: ExpenseRowInput[] = [];
  const sheets: CleanedSheet[] = [];
  const warnings: string[] = [];

  for (const name of wb.SheetNames) {
    const grid = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[name], { header: 1, raw: true, defval: null, blankrows: false });
    if (!grid.length) continue;
    const header = (grid[0] ?? []).map((h) => String(h ?? "").trim());
    const H = new Map(header.map((h, i) => [norm(h), i]));
    const has = (h: string) => H.has(norm(h));
    let scope: Scope | null = null;
    if (has("DEPARTMENT SUBHEADS") || (has("DEPARTMENT") && !has("FIELD OFFICE"))) scope = "central";
    else if (has("GRANT REVENUE")) scope = "grant";
    else if (has("FIELD OFFICE")) scope = "office";
    if (!scope || !has("YEAR")) {
      warnings.push(`Sheet "${name}" doesn't look like an Expense-Total, Central Expenses or Grants Expenses sheet — skipped.`);
      continue;
    }
    const col = (h: string) => H.get(norm(h));
    const accountCols: { i: number; key: string }[] = [];
    const unknown: string[] = [];
    header.forEach((h, i) => {
      if (!h) return;
      const n = norm(h);
      if (META.has(n) || n.startsWith("total ") || n === "operational cost") return;
      const key = ACCOUNT_BY_LABEL.get(n);
      if (key) accountCols.push({ i, key });
      else unknown.push(h);
    });

    let count = 0;
    let empty = 0;
    for (const r of grid.slice(1)) {
      const year = numOrNull(r[col("YEAR")!]);
      const month = monthNum(r[col("MTN") ?? col("MSN") ?? -1]) ?? monthNum(r[col("MONTH") ?? -1]);
      if (!year || !month) continue;
      const amounts: Amounts = {};
      for (const { i, key } of accountCols) {
        const v = numOrNull(r[i]);
        if (v) amounts[key] = (amounts[key] ?? 0) + v;
      }
      const revenue = scope === "office" ? numOrNull(r[col("REVENUE") ?? -1]) : scope === "grant" ? numOrNull(r[col("GRANT REVENUE") ?? -1]) : null;
      const central = scope === "office" ? numOrNull(r[col("TOTAL CENTRAL DEPARTMENTS SHARE") ?? -1]) : null;
      if (!Object.keys(amounts).length && !revenue && !central) {
        empty++;
        continue;
      }
      const s = (h: string) => {
        const i = col(h);
        const v = i == null ? null : r[i];
        return v == null || String(v).trim() === "" ? null : String(v).trim();
      };
      rows.push({
        year,
        month,
        scope,
        office_name: scope === "central" ? null : s("FIELD OFFICE"),
        region: s("REGION")?.toUpperCase() ?? null,
        state: s("STATE"),
        chapter: s("CHAPTER"),
        department: scope === "central" ? s("DEPARTMENT") : null,
        subhead: scope === "central" ? (s("DEPARTMENT SUBHEADS") ?? s("DEPARTMENT")) : null,
        revenue,
        central_share: central,
        amounts,
      });
      count++;
    }
    sheets.push({ name, scope, rows: count, skippedEmpty: empty, unknownColumns: unknown });
    if (unknown.length) warnings.push(`Sheet "${name}": ${unknown.length} column(s) not recognised and skipped: ${unknown.slice(0, 8).join(", ")}${unknown.length > 8 ? "…" : ""}`);
  }
  if (!sheets.length) warnings.push(`Nothing importable found in ${fileName}.`);
  return { rows, sheets, warnings };
}

// ─── Raw QuickBooks "Profit & Loss by Class" ────────────────────────────────
// Rows are accounts (indented one column per level), columns are classes.
// Parent rows and "Total …" rows are skipped so nothing is counted twice;
// each leaf line goes to its account (by number/name), and a line with an
// unknown name goes to its parent's "– other" account.

export type QbMatrix = { classes: string[]; byClass: Record<string, Amounts>; warnings: string[]; period: { year: number; month: number } | null; sheet?: string; grandTotal?: number | null };

export function guessPeriod(...texts: (string | null | undefined)[]): { year: number; month: number } | null {
  for (const t of texts) {
    if (!t) continue;
    const s = t.toLowerCase();
    const y = s.match(/20\d{2}/)?.[0];
    const mi = MONTHS.findIndex((m) => new RegExp(`(^|[^a-z])${m.toLowerCase().slice(0, 3)}([^a-z]|$)|${m.toLowerCase()}`).test(s));
    if (y && mi >= 0) return { year: Number(y), month: mi + 1 };
  }
  return null;
}

// "6510 · OCCUPANCY" → the account for its "– other" line when a child line
// isn't recognised.
function otherFor(parentKey: string | undefined): string | undefined {
  if (!parentKey) return undefined;
  const base = parentKey.split("-")[0];
  for (const k of [`${parentKey}-other`, `${base}-other`]) if (ACCOUNT.has(k)) return k;
  return ACCOUNT.has(parentKey) ? parentKey : undefined;
}

export function parseQbGrid(grid: unknown[][], sheetName: string, fileName: string): QbMatrix | null {
  // Label columns: leading columns that hold text; class columns start at the
  // first column holding numbers in the body.
  const rowsWithLabel = grid.map((r) => (r ?? []) as unknown[]);
  const isNum = (v: unknown) => typeof v === "number" && Number.isFinite(v);
  let firstNumCol = Infinity;
  for (const r of rowsWithLabel) {
    const i = r.findIndex(isNum);
    if (i >= 0) firstNumCol = Math.min(firstNumCol, i);
  }
  if (!Number.isFinite(firstNumCol)) return null;
  const labelOf = (r: unknown[]) => {
    for (let i = 0; i < firstNumCol; i++) {
      const v = r[i];
      if (v != null && String(v).trim() !== "") return { level: i, text: String(v).trim() };
    }
    return null;
  };
  const bodyStart = rowsWithLabel.findIndex((r) => {
    const l = labelOf(r);
    return l && /^(ordinary income\/expense|income|expense|expenses)$/i.test(l.text);
  });
  if (bodyStart < 0 && !rowsWithLabel.some((r) => /total expense/i.test(labelOf(r)?.text ?? ""))) return null;
  const headerRows = rowsWithLabel.slice(0, Math.max(bodyStart, 0));

  // Class per numeric column. QuickBooks nests classes (AUSTIN REGION >
  // GLOBAL REFUGE > PIR): each column shows its own name and "(PARENT)";
  // a parent's "Total PARENT" column follows its children and carries the
  // grandparent. Walk left to right to give every column its full path, so
  // "PIR" under Austin and "PIR" under Orange County stay separate.
  type Node = { name: string; up: Node | null; parentName: string | null };
  const classNode = new Map<number, Node>();
  const open: Node[] = []; // nodes whose parent isn't resolved yet
  let grandCol: number | null = null;
  const width = Math.max(...rowsWithLabel.map((r) => r.length));
  for (let j = firstNumCol; j < width; j++) {
    const cells = headerRows.map((r) => (r[j] == null ? "" : String(r[j]).trim())).filter(Boolean);
    if (!cells.length) continue;
    const marker = cells.find((c) => /^\(.*\)$/.test(c))?.slice(1, -1).trim() ?? null;
    const own = cells.filter((c) => !/^\(.*\)$/.test(c)).pop() ?? null;
    if (own && /^total\b/i.test(own)) {
      const name = own.replace(/^total\s+/i, "").trim();
      if (/^total$/i.test(own)) {
        grandCol = j; // grand total, used to check the import adds up
        continue;
      }
      // "Total X": X's children are complete; X itself hangs under `marker`.
      const parentNode: Node = { name, up: null, parentName: marker };
      for (const n of open) if (!n.up && n.parentName === name) n.up = parentNode;
      for (let k = open.length - 1; k >= 0; k--) if (open[k].up) open.splice(k, 1);
      if (marker) open.push(parentNode);
      continue;
    }
    const node: Node = { name: own ?? `${marker} (direct)`, up: null, parentName: marker };
    classNode.set(j, node);
    if (marker) open.push(node);
  }
  const pathOf = (n: Node): string => {
    const parts: string[] = [];
    let cur: Node | null = n;
    while (cur) {
      parts.unshift(cur.name);
      if (!cur.up && cur.parentName) {
        parts.unshift(cur.parentName); // parent with no Total column (top level)
        break;
      }
      cur = cur.up;
    }
    return parts.join(":");
  };
  const classOf = new Map<number, string>();
  for (const [j, n] of classNode) classOf.set(j, pathOf(n));
  if (!classOf.size) return null;

  const byClass: Record<string, Amounts> = {};
  let grandTotal: number | null = null;
  const unknownLines = new Map<string, string>();
  const stack: { level: number; key?: string }[] = [];
  let inExpense = bodyStart < 0;
  const body = rowsWithLabel.slice(Math.max(bodyStart, 0));
  for (let i = 0; i < body.length; i++) {
    const r = body[i];
    const l = labelOf(r);
    if (!l) continue;
    if (/^(expense|expenses)$/i.test(l.text)) {
      inExpense = true;
      continue;
    }
    if (/^(total expense|total expenses|net income|net ordinary income|gross profit)/i.test(l.text)) {
      if (/^total expense/i.test(l.text)) {
        inExpense = false;
        if (grandCol != null && isNum(r[grandCol])) grandTotal = r[grandCol] as number;
      }
      continue;
    }
    if (/^(income|total income|other income|other expense)/i.test(l.text)) {
      inExpense = /^other expense/i.test(l.text);
      continue;
    }
    while (stack.length && stack[stack.length - 1].level >= l.level) stack.pop();
    if (/^total\b/i.test(l.text)) continue;
    const numbered = l.text.match(/^\s*(\d{4}(?:-\d+)?)\b/)?.[1];
    const key = ACCOUNT_BY_LABEL.get(norm(l.text)) ?? (numbered && ACCOUNT.has(numbered) ? numbered : undefined);
    // A row is a parent if the next labelled row is indented deeper.
    let next: { level: number } | null = null;
    for (let k = i + 1; k < body.length && !next; k++) next = labelOf(body[k]);
    const isParent = !!next && next.level > l.level;
    if (isParent) {
      stack.push({ level: l.level, key });
      continue;
    }
    if (!inExpense) continue;
    let target = key;
    if (!target) {
      const parentKey = [...stack].reverse().find((s) => s.key)?.key;
      target = otherFor(parentKey);
      unknownLines.set(l.text, target ? `${ACCOUNT.get(target)?.label}` : "skipped");
      if (!target) continue;
    }
    for (const [j, cls] of classOf) {
      const v = r[j];
      if (!isNum(v) || !v) continue;
      const a = (byClass[cls] ??= {});
      a[target] = Math.round(((a[target] ?? 0) + (v as number)) * 100) / 100;
    }
  }

  const warnings: string[] = [];
  for (const [line, where] of unknownLines) warnings.push(`QuickBooks line "${line}" isn't a known account — counted under ${where}.`);
  return { classes: [...new Set(classOf.values())], byClass, warnings, period: guessPeriod(sheetName, fileName), grandTotal };
}

export function parseQbWorkbook(buf: ArrayBuffer | Buffer, fileName: string): QbMatrix | null {
  const wb = XLSX.read(buf, { type: Buffer.isBuffer(buf) ? "buffer" : "array", raw: true });
  // Finance's workbooks keep the untouched export next to edited copies
  // ("Orignal", "Working QuickBook", "… for Br. X"). Prefer the export;
  // otherwise take the sheet with the most classes.
  let best: QbMatrix | null = null;
  let bestScore = -1;
  for (const name of wb.SheetNames) {
    const grid = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[name], { header: 1, raw: true, defval: null, blankrows: true });
    const m = parseQbGrid(grid, name, fileName);
    if (!m) continue;
    const score = (/orig|working|export|quick/i.test(name) && !/ for /i.test(name) ? 10_000 : 0) + m.classes.length;
    if (score > bestScore) {
      best = { ...m, sheet: name };
      bestScore = score;
    }
  }
  return best;
}

// Is this upload the raw QuickBooks report or the cleaned workbook?
export function detectKind(buf: ArrayBuffer | Buffer): "cleaned" | "qb" | "unknown" {
  const wb = XLSX.read(buf, { type: Buffer.isBuffer(buf) ? "buffer" : "array", raw: true, sheetRows: 80 });
  for (const name of wb.SheetNames) {
    const grid = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[name], { header: 1, raw: true, defval: null });
    const first = (grid[0] ?? []).map((h) => norm(String(h ?? "")));
    if (first.includes("year") && (first.includes("field office") || first.includes("department subheads") || first.includes("department"))) return "cleaned";
    if (grid.some((r) => (r ?? []).some((c) => typeof c === "string" && /^(total expense|expense)$/i.test(c.trim())))) return "qb";
  }
  return "unknown";
}
