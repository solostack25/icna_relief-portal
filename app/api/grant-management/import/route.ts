import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/grantManagement/server";
import { requireViewer, fail, readJson } from "@/lib/grantManagement/api";
import { audit } from "@/lib/grantManagement/server";
import { checkExpenseRows, checkPexRows } from "@/lib/grantManagement/importRows";
import { cardsFromUploads } from "@/lib/pex/sync";

export const maxDuration = 60;

// Bulk upload (Grant Management only).
// { kind: "expenses" | "pex", rows: [...], file_name, commit: boolean, status: "approved" | "submitted" }
// Without commit it only checks the rows. With commit it saves all of
// them or none (any row with an error blocks the whole file).
export async function POST(req: Request) {
  const auth = await requireViewer({ manager: true });
  if ("res" in auth) return auth.res;
  const { viewer } = auth;
  const body = await readJson(req);
  const kind = body.kind === "pex" ? "pex" : "expenses";
  if (!Array.isArray(body.rows) || !body.rows.length) return fail("The file has no rows.");
  if (body.rows.length > 5000) return fail("Up to 5,000 rows per upload. Split the file.");
  const rows = body.rows as Record<string, unknown>[];
  const admin = createAdminClient();
  const fileName = typeof body.file_name === "string" ? body.file_name.slice(0, 200) : null;

  if (kind === "expenses") {
    const checked = await checkExpenseRows(admin, rows);
    const errorCount = checked.filter((c) => c.errors.length).length;
    if (!body.commit) return NextResponse.json({ kind, rows: checked.map(({ data: _d, ...c }) => c), errorCount, total: sum(checked.map((c) => c.data?.amount ?? 0)) });
    if (errorCount) return fail(`${errorCount} row(s) still have errors. Fix them and upload again.`);
    const status = body.status === "submitted" ? "submitted" : "approved";
    const total = sum(checked.map((c) => c.data!.amount));
    const { data: batch, error } = await admin
      .from("gm_import_batches")
      .insert({ kind, file_name: fileName, row_count: checked.length, total, created_by: viewer.employeeId })
      .select("id")
      .single();
    if (error || !batch) return fail(error?.message ?? "Couldn't start the import.", 500);
    const now = new Date().toISOString();
    const records = checked.map((c) => ({
      ...c.data!,
      status,
      source: "import",
      import_batch_id: batch.id,
      created_by: viewer.employeeId,
      submitted_by: viewer.employeeId,
      submitted_at: now,
      reviewed_by: status === "approved" ? viewer.employeeId : null,
      reviewed_at: status === "approved" ? now : null,
      review_note: status === "approved" ? `Bulk upload${fileName ? `: ${fileName}` : ""}` : null,
    }));
    for (let i = 0; i < records.length; i += 500) {
      const { error: insErr } = await admin.from("gm_expenses").insert(records.slice(i, i + 500));
      if (insErr) {
        await admin.from("gm_expenses").delete().eq("import_batch_id", batch.id);
        await admin.from("gm_import_batches").delete().eq("id", batch.id);
        return fail(`Import stopped, nothing was saved: ${insErr.message}`, 500);
      }
    }
    const perGrant = new Map<string, { rows: number; total: number }>();
    for (const r of records) {
      const p = perGrant.get(r.grant_id) ?? { rows: 0, total: 0 };
      p.rows++;
      p.total += r.amount;
      perGrant.set(r.grant_id, p);
    }
    for (const [gid, p] of perGrant) {
      await audit(admin, { entity: "import", entityId: batch.id, grantId: gid, action: "imported", actorId: viewer.employeeId, changes: { file: fileName, rows: p.rows, total: p.total, status } });
    }
    return NextResponse.json({ ok: true, batchId: batch.id, rows: records.length, total });
  }

  const checked = await checkPexRows(admin, rows);
  const errorRows = checked.filter((c) => c.errors.length);
  const good = checked.filter((c) => c.data);
  if (!body.commit) return NextResponse.json({ kind, rows: checked.map(({ data: _d, ...c }) => c), errorCount: errorRows.length, total: sum(good.map((c) => c.data!.amount)) });
  // PEX: rows already imported are skipped rather than blocking the file.
  const blocking = errorRows.filter((c) => !c.errors.every((e) => e === "Already imported."));
  if (blocking.length) return fail(`${blocking.length} row(s) have errors. Fix them and upload again.`);
  if (!good.length) return fail("Every transaction in this file was already imported.");
  const total = sum(good.map((c) => c.data!.amount));
  const { data: batch, error } = await admin
    .from("gm_import_batches")
    .insert({ kind, file_name: fileName, row_count: good.length, total, created_by: viewer.employeeId })
    .select("id")
    .single();
  if (error || !batch) return fail(error?.message ?? "Couldn't start the import.", 500);
  const { error: insErr } = await admin.from("gm_pex_transactions").insert(good.map((c) => ({ ...c.data!, batch_id: batch.id })));
  if (insErr) {
    await admin.from("gm_import_batches").delete().eq("id", batch.id);
    return fail(`Import stopped, nothing was saved: ${insErr.message}`, 500);
  }
  // Match uploaded rows to known cards (by last 4) so the card's grant
  // designation suggests a grant for them.
  // Each card in the file is added to the PEX app (by last 4). Only
  // cards Finance has switched on for grants show up here for coding.
  await cardsFromUploads(admin);
  const { count: notGrant } = await admin.from("gm_pex_transactions").select("id", { count: "exact", head: true }).eq("batch_id", batch.id).eq("in_grant_scope", false);
  await audit(admin, { entity: "import", entityId: batch.id, action: "pex_imported", actorId: viewer.employeeId, changes: { file: fileName, rows: good.length, total, skipped: errorRows.length } });
  return NextResponse.json({ ok: true, batchId: batch.id, rows: good.length, skipped: errorRows.length, total, notGrant: notGrant ?? 0 });
}

function sum(ns: number[]) {
  return Math.round(ns.reduce((s, n) => s + n, 0) * 100) / 100;
}
