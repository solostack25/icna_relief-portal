import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { financeGate, isResponse } from "@/lib/finance/access";
import { accountsTotal } from "@/lib/finance/accounts";
import { loadOffices, officeKey, upsertRows } from "@/lib/finance/expenses";
import { detectKind, parseCleaned, parseQbWorkbook } from "@/lib/finance/parse";
import { applyQbMatrix } from "@/lib/finance/qbApply";
import { suggestClass } from "@/lib/finance/qbClasses";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

// POST multipart { file, mode: "preview" | "apply", year?, month? }
// Accepts either the cleaned Expenditure workbook / a CSV of one of its
// sheets, or the raw QuickBooks "P&L by Class" export. Preview never saves.
export async function POST(req: NextRequest) {
  const gate = await financeGate();
  if (isResponse(gate)) return gate;
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "Choose a file" }, { status: 400 });
  if (file.size > 15 * 1024 * 1024) return NextResponse.json({ error: "File is over 15 MB" }, { status: 400 });
  const mode = form?.get("mode") === "apply" ? "apply" : "preview";
  const buf = Buffer.from(await file.arrayBuffer());

  let kind: ReturnType<typeof detectKind>;
  try {
    kind = detectKind(buf);
  } catch {
    return NextResponse.json({ error: "Couldn't read that file. Upload .xlsx, .xlsm or .csv." }, { status: 400 });
  }

  if (kind === "cleaned") {
    const parsed = parseCleaned(buf, file.name);
    const { byKey } = await loadOffices();
    const unmatched = [...new Set(parsed.rows.filter((r) => r.scope !== "central" && r.office_name && !byKey.has(officeKey(r.office_name))).map((r) => r.office_name!.trim()))].sort();
    const periods = new Map<string, { year: number; month: number; office: number; central: number; grant: number; total: number }>();
    for (const r of parsed.rows) {
      const k = `${r.year}-${r.month}`;
      const p = periods.get(k) ?? periods.set(k, { year: r.year, month: r.month, office: 0, central: 0, grant: 0, total: 0 }).get(k)!;
      p[r.scope]++;
      p.total += accountsTotal(r.amounts as Record<string, number>);
    }
    const preview = {
      kind,
      fileName: file.name,
      sheets: parsed.sheets,
      warnings: parsed.warnings,
      unmatchedOffices: unmatched,
      periods: [...periods.values()].sort((a, b) => a.year - b.year || a.month - b.month),
      rows: parsed.rows.length,
    };
    if (mode === "preview") return NextResponse.json(preview);
    if (!parsed.rows.length) return NextResponse.json({ error: "Nothing to import" }, { status: 400 });

    const admin = createAdminClient();
    const label = preview.periods.length === 1 ? `${preview.periods[0].month}/${preview.periods[0].year}` : `${preview.periods.length} months`;
    const { data: batch, error } = await admin
      .from("fin_import_batches")
      .insert({ source: "upload", file_name: file.name, period_label: label, rows_count: parsed.rows.length, summary: preview, created_by: gate.employeeId })
      .select("id")
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    try {
      const res = await upsertRows(parsed.rows, { source: "upload", batchId: batch.id, employeeId: gate.employeeId });
      return NextResponse.json({ ...preview, applied: true, saved: res.saved, batchId: batch.id });
    } catch (e) {
      await admin.from("fin_import_batches").update({ status: "failed" }).eq("id", batch.id);
      return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
    }
  }

  if (kind === "qb") {
    const matrix = parseQbWorkbook(buf, file.name);
    if (!matrix) return NextResponse.json({ error: "Couldn't find the P&L by Class report in that workbook" }, { status: 400 });
    const year = Number(form?.get("year")) || matrix.period?.year || null;
    const month = Number(form?.get("month")) || matrix.period?.month || null;
    const classes = Object.entries(matrix.byClass)
      .map(([qb_class, a]) => ({ qb_class, total: Math.round(accountsTotal(a) * 100) / 100 }))
      .filter((c) => c.total)
      .sort((a, b) => b.total - a.total);
    const { data: saved } = await createAdminClient().from("fin_qb_class_map").select("*").in("qb_class", classes.length ? classes.map((c) => c.qb_class) : ["-"]);
    const savedMap = new Map<string, any>((saved ?? []).map((r: any) => [r.qb_class as string, r]));
    const preview = {
      kind,
      fileName: file.name,
      sheet: matrix.sheet ?? null,
      year,
      month,
      grandTotal: matrix.grandTotal ?? null,
      parsedTotal: Math.round(classes.reduce((s, c) => s + c.total, 0) * 100) / 100,
      warnings: matrix.warnings,
      classes: classes.map((c) => {
        const m = savedMap.get(c.qb_class);
        const s = m ? null : suggestClass(c.qb_class);
        return {
          ...c,
          saved: !!m,
          target: (m?.target as string) ?? s!.target,
          office_name: (m?.office_name as string) ?? s?.office_name ?? null,
          department: (m?.department as string) ?? s?.department ?? null,
          subhead: (m?.subhead as string) ?? s?.subhead ?? null,
          reason: s?.reason ?? null,
        };
      }),
    };
    if (mode === "preview") return NextResponse.json(preview);
    if (!year || !month || month < 1 || month > 12) return NextResponse.json({ error: "Pick the month this report covers" }, { status: 400 });
    try {
      const result = await applyQbMatrix({ year, month, matrix, source: "qb_file", fileName: file.name, employeeId: gate.employeeId });
      return NextResponse.json({ ...preview, applied: true, result });
    } catch (e) {
      return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
    }
  }

  return NextResponse.json(
    { error: "This doesn't look like the cleaned Expenditure workbook (YEAR / FIELD OFFICE / DEPARTMENT columns) or a QuickBooks P&L by Class export." },
    { status: 400 }
  );
}
