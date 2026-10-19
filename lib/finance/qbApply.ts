import { createAdminClient } from "@/lib/supabase/server";
import { accountsTotal, type Amounts } from "./accounts";
import { allocateCentral, loadOffices, officeKey, rowKey, upsertRows, type ExpenseRowInput } from "./expenses";
import type { QbMatrix } from "./parse";
import { suggestClass } from "./qbClasses";

// Turns a QuickBooks P&L by Class (from an uploaded export, the Online API or
// the Desktop Web Connector) into the month's office, grant and central rows,
// using finance's class mapping, then re-shares central costs by FTE.

export type ClassLine = { qb_class: string; target: string; to: string; total: number; suggested: boolean };

export type QbApplyResult = {
  batchId: string;
  year: number;
  month: number;
  offices: number;
  grants: number;
  central: number;
  mappedTotal: number;
  skippedTotal: number;
  skipped: ClassLine[];
  suggestedNew: ClassLine[];
  unmatchedOffices: string[];
  allocation: { centralTotal: number; allocated: number; offices: number; note: string | null };
  warnings: string[];
};

type MapRow = { qb_class: string; target: string; office_id: string | null; office_name: string | null; department: string | null; subhead: string | null; also_office: boolean };

const add = (into: Amounts, from: Amounts) => {
  for (const [k, v] of Object.entries(from)) into[k] = Math.round(((into[k] ?? 0) + v) * 100) / 100;
};

export async function applyQbMatrix(opts: {
  year: number;
  month: number;
  matrix: QbMatrix;
  source: "qb_file" | "qb_online" | "qb_desktop";
  fileName?: string | null;
  employeeId: string | null;
}): Promise<QbApplyResult> {
  const { year, month, matrix, source } = opts;
  const admin = createAdminClient();
  const { byKey } = await loadOffices();

  // 1. Mapping: saved rows, plus suggestions saved for classes seen first time.
  const classes = Object.keys(matrix.byClass);
  const { data: saved } = await admin.from("fin_qb_class_map").select("*").in("qb_class", classes.length ? classes : ["-"]);
  const map = new Map<string, MapRow>((saved ?? []).map((r: any) => [r.qb_class as string, r as MapRow]));
  const suggestedNew: ClassLine[] = [];
  const newRows = [];
  for (const cls of classes) {
    if (map.has(cls)) continue;
    const s = suggestClass(cls);
    const office = s.office_name ? byKey.get(officeKey(s.office_name)) : undefined;
    const row: MapRow = {
      qb_class: cls,
      target: s.target,
      office_id: office?.id ?? null,
      office_name: office?.name ?? s.office_name ?? null,
      department: s.department ?? null,
      subhead: s.subhead ?? null,
      also_office: s.also_office ?? true,
    };
    map.set(cls, row);
    newRows.push({ ...row, updated_by: opts.employeeId });
    suggestedNew.push({ qb_class: cls, target: s.target, to: describe(row), total: accountsTotal(matrix.byClass[cls]), suggested: true });
  }
  if (newRows.length) await admin.from("fin_qb_class_map").upsert(newRows, { onConflict: "qb_class" });

  // 2. Aggregate.
  const offices = new Map<string, Amounts>();
  const grants = new Map<string, Amounts>();
  const central = new Map<string, { department: string; subhead: string; amounts: Amounts }>();
  const skipped: ClassLine[] = [];
  let mappedTotal = 0;
  let skippedTotal = 0;
  for (const cls of classes) {
    const amounts = matrix.byClass[cls];
    const total = accountsTotal(amounts);
    if (!total) continue;
    const m = map.get(cls)!;
    const officeName = m.office_name;
    if ((m.target === "office" || m.target === "grant") && officeName) {
      if (m.target === "office" || m.also_office) add((offices.get(officeName) ?? offices.set(officeName, {}).get(officeName)!), amounts);
      if (m.target === "grant") add((grants.get(officeName) ?? grants.set(officeName, {}).get(officeName)!), amounts);
      mappedTotal += total;
    } else if (m.target === "central" && m.department) {
      const key = `${m.department}|${m.subhead ?? m.department}`;
      const c = central.get(key) ?? central.set(key, { department: m.department, subhead: m.subhead ?? m.department, amounts: {} }).get(key)!;
      add(c.amounts, amounts);
      mappedTotal += total;
    } else {
      skippedTotal += total;
      skipped.push({ qb_class: cls, target: m.target, to: describe(m), total, suggested: suggestedNew.some((x) => x.qb_class === cls) });
    }
  }

  // 3. Batch record.
  const label = `${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][month - 1]} ${year}`;
  const { data: batch, error: bErr } = await admin
    .from("fin_import_batches")
    .insert({ source, file_name: opts.fileName ?? null, period_label: label, rows_count: offices.size + grants.size + central.size, created_by: opts.employeeId })
    .select("id")
    .single();
  if (bErr) throw new Error(bErr.message);

  // 4. Rows. QuickBooks has no revenue or central share, so keep what's there.
  const rows: ExpenseRowInput[] = [
    ...[...offices].map(([office_name, amounts]) => ({ year, month, scope: "office" as const, office_name, amounts })),
    ...[...grants].map(([office_name, amounts]) => ({ year, month, scope: "grant" as const, office_name, amounts })),
    ...[...central.values()].map((c) => ({ year, month, scope: "central" as const, department: c.department, subhead: c.subhead, amounts: c.amounts })),
  ];
  // Rows an earlier QuickBooks import filled that this one no longer covers
  // (e.g. a class was re-mapped) are cleared, so totals don't double up.
  const newKeys = new Set(rows.map(rowKey));
  const { data: existing } = await admin.from("fin_expense_rows").select("id, row_key, source").eq("year", year).eq("month", month).like("source", "qb_%");
  const stale = (existing ?? []).filter((e: any) => !newKeys.has(e.row_key as string)).map((e: any) => e.id as string);
  if (stale.length) await admin.from("fin_expense_rows").update({ amounts: {}, expenses_total: 0 }).in("id", stale);

  const { unmatchedOffices } = await upsertRows(rows, { source, batchId: batch.id, employeeId: opts.employeeId, keep: ["revenue", "central_share", "region", "state", "chapter"] });
  const allocation = await allocateCentral(year, month, opts.employeeId);

  const result: QbApplyResult = {
    batchId: batch.id,
    year,
    month,
    offices: offices.size,
    grants: grants.size,
    central: central.size,
    mappedTotal: Math.round(mappedTotal * 100) / 100,
    skippedTotal: Math.round(skippedTotal * 100) / 100,
    skipped: skipped.sort((a, b) => b.total - a.total),
    suggestedNew,
    unmatchedOffices,
    allocation,
    warnings: matrix.warnings,
  };
  await admin.from("fin_import_batches").update({ summary: result }).eq("id", batch.id);
  return result;
}

function describe(m: Pick<MapRow, "target" | "office_name" | "department" | "subhead">) {
  if (m.target === "office") return m.office_name ?? "(office not set)";
  if (m.target === "grant") return `${m.office_name ?? "(office not set)"} — grant`;
  if (m.target === "central") return `Central: ${m.department}${m.subhead && m.subhead !== m.department ? ` / ${m.subhead}` : ""}`;
  return m.target === "ignore" ? "Ignored" : "Needs a decision";
}
