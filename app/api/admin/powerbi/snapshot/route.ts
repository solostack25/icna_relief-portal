import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { requirePowerBiAdmin } from "@/lib/powerbiAdminAuth";
import { executeDax, getItemDefinition, getPowerBiConfig, listDatasets, listReports } from "@/lib/powerbi";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// POST: save what's in the Power BI workspace - every semantic model's
// definition (tables, columns, measures + DAX), every report's definition
// (pages, visuals) and each model's column statistics - so the Power BI
// versions of the reports can be mapped to it. Read-only toward Power BI.
export async function POST() {
  const me = await requirePowerBiAdmin();
  if (!me) return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  const cfg = await getPowerBiConfig();
  if (!cfg) return NextResponse.json({ error: "Power BI isn't connected yet" }, { status: 400 });

  const [datasets, reports] = await Promise.all([listDatasets(cfg), listReports(cfg)]);
  const rows: { kind: string; item_id: string; item_name: string; parts: unknown; error: string | null; captured_by: string }[] = [];
  const summary: { item: string; kind: string; ok: boolean; detail: string }[] = [];
  const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));

  for (const d of datasets) {
    try {
      const parts = await getItemDefinition(cfg, "semanticModels", d.id);
      const tmdl = parts.map((p) => p.text).join("\n");
      const measures = (tmdl.match(/^\s*measure\s/gm) ?? []).length;
      const tables = parts.filter((p) => /tables\//.test(p.path)).length;
      rows.push({ kind: "semantic_model", item_id: d.id, item_name: d.name, parts, error: null, captured_by: me.id });
      summary.push({ item: d.name, kind: "Model", ok: true, detail: `${tables} tables, ${measures} measures` });
    } catch (e) {
      rows.push({ kind: "semantic_model", item_id: d.id, item_name: d.name, parts: null, error: msg(e), captured_by: me.id });
      summary.push({ item: d.name, kind: "Model", ok: false, detail: msg(e) });
    }
    try {
      const stats = await executeDax(cfg, d.id, "EVALUATE COLUMNSTATISTICS()");
      rows.push({ kind: "column_stats", item_id: d.id, item_name: d.name, parts: stats, error: null, captured_by: me.id });
      summary.push({ item: d.name, kind: "Columns", ok: true, detail: `${stats.length} columns` });
    } catch (e) {
      rows.push({ kind: "column_stats", item_id: d.id, item_name: d.name, parts: null, error: msg(e), captured_by: me.id });
      summary.push({ item: d.name, kind: "Columns", ok: false, detail: msg(e) });
    }
  }
  for (const r of reports) {
    try {
      const parts = await getItemDefinition(cfg, "reports", r.id);
      rows.push({ kind: "report", item_id: r.id, item_name: r.name, parts, error: null, captured_by: me.id });
      summary.push({ item: r.name, kind: "Report", ok: true, detail: `${parts.length} files` });
    } catch (e) {
      rows.push({ kind: "report", item_id: r.id, item_name: r.name, parts: null, error: msg(e), captured_by: me.id });
      summary.push({ item: r.name, kind: "Report", ok: false, detail: msg(e) });
    }
  }

  // Postgres can't store the NUL character, which turns up in some report
  // definition files; strip it. Insert one row at a time so one oversized
  // or odd item doesn't lose the rest.
  const clean = (v: unknown): unknown =>
    typeof v === "string" ? v.replace(/\u0000/g, "") : Array.isArray(v) ? v.map(clean) : v && typeof v === "object" ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, clean(x)])) : v;
  const admin = createAdminClient();
  const failed: string[] = [];
  for (const row of rows) {
    const { error } = await admin.from("pbi_model_snapshots").insert({ ...row, parts: clean(row.parts) });
    if (error) failed.push(`${row.item_name} (${row.kind}): ${error.message}`);
  }
  if (failed.length) return NextResponse.json({ error: `Couldn't save: ${failed.join("; ")}`, summary }, { status: 500 });
  return NextResponse.json({ summary });
}
