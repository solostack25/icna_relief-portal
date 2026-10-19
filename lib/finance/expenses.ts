import { createAdminClient } from "@/lib/supabase/server";
import { accountsTotal, cleanAmounts, type Amounts } from "./accounts";

// Shared logic for the Expenses dashboard: row identity, office matching,
// saving rows, and sharing central costs out to offices by FTE.

export type Scope = "office" | "central" | "grant";

export type ExpenseRowInput = {
  year: number;
  month: number;
  scope: Scope;
  office_name?: string | null;
  region?: string | null;
  state?: string | null;
  chapter?: string | null;
  department?: string | null;
  subhead?: string | null;
  revenue?: number | null;
  central_share?: number | null;
  amounts: Record<string, unknown>;
  notes?: string | null;
};

export type ExpenseRow = ExpenseRowInput & {
  id: string;
  row_key: string;
  office_id: string | null;
  amounts: Amounts;
  expenses_total: number;
  source: string;
  batch_id: string | null;
  updated_at: string;
};

export const rowKey = (r: Pick<ExpenseRowInput, "scope" | "office_name" | "department" | "subhead">) =>
  r.scope === "central"
    ? `central|${(r.department ?? "").trim().toLowerCase()}|${(r.subhead ?? r.department ?? "").trim().toLowerCase()}`
    : `${r.scope}|${(r.office_name ?? "").trim().toLowerCase()}`;

// "Kentucky - Statewide" == "Kentucky-Statewide" == "kentucky statewide"
export const officeKey = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

export type OfficeInfo = { id: string; name: string; region: string | null; state: string | null };

export async function loadOffices(): Promise<{ list: OfficeInfo[]; byKey: Map<string, OfficeInfo> }> {
  const { data } = await createAdminClient().from("b2s_offices").select("id, field_office, region, state").order("field_office");
  const list = (data ?? []).map((o: any) => ({ id: o.id as string, name: String(o.field_office).trim(), region: (o.region as string) ?? null, state: (o.state as string) ?? null }));
  return { list, byKey: new Map(list.map((o: OfficeInfo) => [officeKey(o.name), o] as const)) };
}

// Save rows for one source: each row replaces the existing row with the same
// (year, month, row_key). `keep` lists fields to carry over from the existing
// row when the incoming value is missing (e.g. QuickBooks has no revenue).
export async function upsertRows(
  rows: ExpenseRowInput[],
  opts: { source: string; batchId?: string | null; employeeId: string | null; keep?: ("revenue" | "central_share" | "region" | "state" | "chapter")[] }
) {
  if (!rows.length) return { saved: 0, unmatchedOffices: [] as string[] };
  const admin = createAdminClient();
  const { byKey } = await loadOffices();
  const unmatched = new Set<string>();

  const prepared = rows.map((r) => {
    const amounts = cleanAmounts(r.amounts);
    const office = r.office_name ? byKey.get(officeKey(r.office_name)) : undefined;
    if (r.office_name && !office && r.scope !== "central") unmatched.add(r.office_name.trim());
    return {
      year: r.year,
      month: r.month,
      scope: r.scope,
      row_key: rowKey(r),
      office_id: office?.id ?? null,
      office_name: r.office_name ? (office?.name ?? r.office_name.trim()) : null,
      region: r.region ?? office?.region ?? null,
      state: r.state ?? office?.state ?? null,
      chapter: r.chapter ?? null,
      department: r.scope === "central" ? (r.department ?? "").trim() || null : null,
      subhead: r.scope === "central" ? (r.subhead ?? r.department ?? "").trim() || null : null,
      revenue: r.revenue ?? null,
      central_share: r.scope === "office" ? (r.central_share ?? null) : null,
      amounts,
      expenses_total: Math.round(accountsTotal(amounts) * 100) / 100,
      source: opts.source,
      batch_id: opts.batchId ?? null,
      notes: r.notes ?? null,
      updated_by: opts.employeeId,
      updated_at: new Date().toISOString(),
    };
  });

  if (opts.keep?.length) {
    // Fill missing fields from what's already stored.
    const periods = [...new Set(prepared.map((p) => `${p.year}-${p.month}`))];
    for (const per of periods) {
      const [y, m] = per.split("-").map(Number);
      const { data: existing } = await admin.from("fin_expense_rows").select("row_key, revenue, central_share, region, state, chapter").eq("year", y).eq("month", m);
      const ex = new Map<string, any>((existing ?? []).map((e: any) => [e.row_key as string, e]));
      for (const p of prepared.filter((x) => x.year === y && x.month === m)) {
        const old = ex.get(p.row_key);
        if (!old) continue;
        for (const k of opts.keep) {
          const rec = p as Record<string, unknown>;
          if (rec[k] == null) rec[k] = old[k];
        }
      }
    }
  }

  // Chunk to stay well under request size limits.
  let saved = 0;
  for (let i = 0; i < prepared.length; i += 200) {
    const chunk = prepared.slice(i, i + 200);
    const { error } = await admin.from("fin_expense_rows").upsert(chunk, { onConflict: "year,month,row_key" });
    if (error) throw new Error(error.message);
    saved += chunk.length;
  }
  return { saved, unmatchedOffices: [...unmatched].sort() };
}

// Share the month's central department costs out to offices by FTE:
// office share = central total × office FTE ÷ total FTE. Offices with an
// FTE but no row yet get one (central share only).
export async function allocateCentral(year: number, month: number, employeeId: string | null) {
  const admin = createAdminClient();
  const [{ data: central }, { data: weights }, { data: offices }] = await Promise.all([
    admin.from("fin_expense_rows").select("expenses_total").eq("year", year).eq("month", month).eq("scope", "central"),
    admin.from("fin_allocation_weights").select("office_name, office_id, fte").eq("year", year),
    admin.from("fin_expense_rows").select("id, row_key, office_name").eq("year", year).eq("month", month).eq("scope", "office"),
  ]);
  const centralTotal = (central ?? []).reduce((s: number, r: any) => s + Number(r.expenses_total || 0), 0);
  const w = (weights ?? []).filter((x: any) => Number(x.fte) > 0) as { office_name: string; office_id: string | null; fte: number }[];
  const fteTotal = w.reduce((s: number, x) => s + Number(x.fte), 0);
  if (!fteTotal) return { centralTotal, allocated: 0, offices: 0, note: `No FTE weights set for ${year}` };

  const existing = new Map<string, any>((offices ?? []).map((o: any) => [o.row_key as string, o]));
  const shareFor = (fte: number) => Math.round(((centralTotal * fte) / fteTotal) * 100) / 100;

  // Offices without a weight get no share.
  const weightedKeys = new Set(w.map((x) => rowKey({ scope: "office", office_name: x.office_name })));
  for (const o of (offices ?? []) as any[]) {
    if (!weightedKeys.has(o.row_key as string)) {
      await admin.from("fin_expense_rows").update({ central_share: null }).eq("id", o.id);
    }
  }
  const toCreate: ExpenseRowInput[] = [];
  let allocated = 0;
  for (const x of w) {
    const share = shareFor(Number(x.fte));
    allocated += share;
    const key = rowKey({ scope: "office", office_name: x.office_name });
    const row = existing.get(key);
    if (row) await admin.from("fin_expense_rows").update({ central_share: share, updated_by: employeeId, updated_at: new Date().toISOString() }).eq("id", row.id);
    else toCreate.push({ year, month, scope: "office", office_name: x.office_name, central_share: share, amounts: {} });
  }
  if (toCreate.length) await upsertRows(toCreate, { source: "manual", employeeId });
  return { centralTotal, allocated, offices: w.length, note: null };
}

export const fullName = (y: number, m: number) => `${["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"][m - 1]} ${y}`;
