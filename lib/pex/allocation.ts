import { randomUUID } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { normaliseImage } from "@/lib/financeReceipts";
import { audit, checkExpenseAgainstGrant, cleanExpenseInput, grantAccess, GM_BUCKET, type GmViewer } from "@/lib/grantManagement/server";
import { attachDocuments, submitExpense } from "@/lib/grantManagement/expenses";
import { getIntegrationSetting } from "@/lib/integrationSettings";
import { getPexConfig, pexAttachmentFile, pexAttachments, pexSetTransactionTag } from "./client";
import { checkPortion, pexStatus, remaining } from "./rules";

type Admin = SupabaseClient;

export type PexTx = {
  id: string;
  external_id: string | null;
  source: string;
  amount: number;
  transaction_date: string;
  merchant: string | null;
  memo: string | null;
  employee_id: string | null;
  status: string;
  is_pending: boolean;
  allocated_amount: number;
  non_grant_amount: number;
  non_grant_note: string | null;
};

const TX_COLS = "id, external_id, source, amount, transaction_date, merchant, memo, employee_id, status, is_pending, allocated_amount, non_grant_amount, non_grant_note";

export async function loadTx(db: Admin, id: string): Promise<PexTx | null> {
  const { data } = await db.from("gm_pex_transactions").select(TX_COLS).eq("id", id).maybeSingle();
  return data ? { ...data, amount: Number(data.amount), allocated_amount: Number(data.allocated_amount), non_grant_amount: Number(data.non_grant_amount) } : null;
}

// Recompute allocated amount + status from the expenses that point at
// this transaction. Rejected expenses don't count: their portion goes
// back in the queue for someone to re-code.
export async function refreshPexTransaction(db: Admin, txId: string) {
  const tx = await loadTx(db, txId);
  if (!tx) return null;
  const { data: exps } = await db.from("gm_expenses").select("id, amount, status, created_at").eq("pex_transaction_id", txId).order("created_at");
  const live = (exps ?? []).filter((e) => e.status !== "rejected");
  const allocated = Math.round(live.reduce((s, e) => s + Number(e.amount), 0) * 100) / 100;
  const status = pexStatus(tx.amount, allocated, tx.non_grant_amount);
  await db
    .from("gm_pex_transactions")
    .update({ allocated_amount: allocated, status, expense_id: live[0]?.id ?? null, updated_at: new Date().toISOString() })
    .eq("id", txId);
  return { allocated, status };
}

export async function refreshForExpense(db: Admin, expenseId: string, knownTxId?: string | null) {
  let txId = knownTxId ?? null;
  if (txId === undefined || txId === null) {
    const { data } = await db.from("gm_expenses").select("pex_transaction_id").eq("id", expenseId).maybeSingle();
    txId = data?.pex_transaction_id ?? null;
  }
  if (txId) await refreshPexTransaction(db, txId);
}

export const canWorkTx = (viewer: GmViewer, tx: Pick<PexTx, "employee_id">) => viewer.isManager || (!!tx.employee_id && tx.employee_id === viewer.employeeId);

// ---------- allocate ----------
export type SplitInput = { grant_id?: unknown; line_id?: unknown; amount?: unknown; description?: unknown };

export type AllocateBody = {
  splits?: SplitInput[];
  non_grant_amount?: unknown; // replaces the current non-grant portion when present
  non_grant_note?: unknown;
  document_ids?: unknown;
  pex_attachment_ids?: unknown; // receipts to pull in from PEX
  submit?: unknown;
};

export type AllocateResult =
  | { ok: true; expenseIds: string[]; status: string; warnings: string[] }
  | { ok: false; error: string; fields?: Record<string, string>; status?: number };

export async function allocateTransaction(db: Admin, viewer: GmViewer, txId: string, body: AllocateBody): Promise<AllocateResult> {
  const tx = await loadTx(db, txId);
  if (!tx) return { ok: false, error: "Transaction not found.", status: 404 };
  if (!canWorkTx(viewer, tx)) return { ok: false, error: "This card transaction isn't yours to code.", status: 403 };
  if (tx.is_pending) return { ok: false, error: "This transaction is still pending at PEX. It can be coded once it settles." };

  const fields: Record<string, string> = {};
  const r2 = (n: number) => Math.round(n * 100) / 100;

  // Non-grant portion (replace). Needs a reason.
  let nonGrant = tx.non_grant_amount;
  let nonGrantNote = tx.non_grant_note;
  if (body.non_grant_amount !== undefined && body.non_grant_amount !== null && body.non_grant_amount !== "") {
    nonGrant = r2(Number(body.non_grant_amount));
    if (!Number.isFinite(nonGrant)) fields.non_grant_amount = "Enter a number.";
    else if (nonGrant !== 0 && Math.sign(nonGrant) !== Math.sign(tx.amount)) fields.non_grant_amount = tx.amount < 0 ? "Use a negative amount for a refund." : "Use a positive amount.";
    nonGrantNote = typeof body.non_grant_note === "string" && body.non_grant_note.trim() ? body.non_grant_note.trim().slice(0, 300) : nonGrantNote;
    if (nonGrant !== 0 && !nonGrantNote) fields.non_grant_note = "Say why this part isn't a grant expense.";
  }
  if (Math.abs(nonGrant) > Math.abs(tx.amount - tx.allocated_amount) + 0.005) fields.non_grant_amount = `At most $${Math.abs(tx.amount - tx.allocated_amount).toFixed(2)} can be non-grant.`;

  // Grant portions.
  const splits = Array.isArray(body.splits) ? body.splits.slice(0, 12) : [];
  let left = remaining(tx.amount, tx.allocated_amount, nonGrant);
  const prepared: { input: NonNullable<ReturnType<typeof cleanExpenseInput>["input"]>; docRequired: boolean; grant: { office_id: string | null; program: string } }[] = [];
  for (let i = 0; i < splits.length; i++) {
    const s = splits[i];
    const amount = r2(Number(s.amount));
    const portionErr = checkPortion(tx.amount, left, amount);
    if (portionErr) {
      fields[`splits.${i}.amount`] = portionErr;
      continue;
    }
    const { input, errors } = cleanExpenseInput({
      grant_id: s.grant_id,
      line_id: s.line_id,
      amount,
      description: typeof s.description === "string" && s.description.trim() ? s.description : tx.memo ?? `PEX: ${tx.merchant ?? "card purchase"}`,
      expense_date: tx.transaction_date,
      vendor: tx.merchant ?? "PEX card",
      kind: "purchase",
      payment_method: "pex",
      external_ref: tx.external_id,
    });
    if (!input) {
      for (const [k, v] of Object.entries(errors)) fields[`splits.${i}.${k}`] = v;
      continue;
    }
    const access = await grantAccess(viewer, input.grant_id, db);
    const check = await checkExpenseAgainstGrant(db, input, access);
    if (Object.keys(check.errors).length) {
      for (const [k, v] of Object.entries(check.errors)) fields[`splits.${i}.${k === "expense_date" ? "grant_id" : k}`] = v;
      continue;
    }
    left = r2(left - amount);
    prepared.push({ input, docRequired: check.docRequired, grant: check.grant! });
  }
  if (Object.keys(fields).length) return { ok: false, error: "Please fix the highlighted fields.", fields };
  if (!prepared.length && nonGrant === tx.non_grant_amount) return { ok: false, error: "Add at least one grant line, or a non-grant amount." };

  const warnings: string[] = [];

  // Receipts: anything uploaded here, plus any pulled in from PEX.
  const docIds = Array.isArray(body.document_ids) ? (body.document_ids.filter((x) => typeof x === "string") as string[]) : [];
  if (Array.isArray(body.pex_attachment_ids) && body.pex_attachment_ids.length && tx.external_id && tx.source !== "upload") {
    try {
      docIds.push(...(await importPexReceipts(db, viewer, tx.external_id, body.pex_attachment_ids.filter((x) => typeof x === "string") as string[])));
    } catch (e) {
      warnings.push(`Couldn't pull the receipt from PEX: ${e instanceof Error ? e.message : e}`);
    }
  }

  // Create one expense per grant portion.
  const created: { id: string; grant_id: string; status: string; doc_required: boolean; created_by: string; amount: number }[] = [];
  for (const p of prepared) {
    const { data: row, error } = await db
      .from("gm_expenses")
      .insert({
        ...p.input,
        office_id: p.grant.office_id,
        program: p.grant.program,
        doc_required: p.docRequired,
        status: "draft",
        source: "pex",
        pex_transaction_id: tx.id,
        created_by: viewer.employeeId,
      })
      .select("id, grant_id, status, doc_required, created_by, amount")
      .single();
    if (error || !row) {
      warnings.push(`Couldn't save one of the lines: ${error?.message ?? "unknown error"}`);
      continue;
    }
    created.push(row);
    await audit(db, { entity: "expense", entityId: row.id, grantId: row.grant_id, action: "created", actorId: viewer.employeeId, changes: { ...p.input, source: "pex", pex_transaction_id: tx.id } });
  }

  // The receipt covers the whole purchase, so every portion gets it.
  if (created.length && docIds.length) {
    await attachDocuments(db, created[0].id, viewer.employeeId, docIds);
    if (created.length > 1) await copyDocuments(db, created[0].id, created.slice(1).map((c) => c.id), viewer.employeeId);
  }

  if (nonGrant !== tx.non_grant_amount || nonGrantNote !== tx.non_grant_note) {
    await db.from("gm_pex_transactions").update({ non_grant_amount: nonGrant, non_grant_note: nonGrant ? nonGrantNote : null }).eq("id", tx.id);
  }
  const after = await refreshPexTransaction(db, tx.id);
  await audit(db, {
    entity: "pex",
    entityId: tx.id,
    grantId: created[0]?.grant_id ?? null,
    action: created.length > 1 ? "split" : created.length ? "coded" : "non_grant_set",
    actorId: viewer.employeeId,
    changes: {
      portions: created.map((c) => ({ expense_id: c.id, grant_id: c.grant_id, amount: Number(c.amount) })),
      non_grant_amount: { from: tx.non_grant_amount, to: nonGrant },
      status: { from: tx.status, to: after?.status },
    },
    note: nonGrant ? nonGrantNote : null,
  });

  if (body.submit === true) {
    for (const c of created) {
      const r = await submitExpense(db, c, viewer);
      if (r.error) warnings.push(`Saved as a draft: ${r.error}`);
    }
  }

  if (created.length) await writeBackGrantTag(db, tx).catch((e) => warnings.push(`PEX tag not updated: ${e instanceof Error ? e.message : e}`));

  return { ok: true, expenseIds: created.map((c) => c.id), status: after?.status ?? tx.status, warnings: [...new Set(warnings)] };
}

// Whole transaction is not a grant expense (Grant Management).
export async function setNonGrant(db: Admin, viewer: GmViewer, txId: string, mode: "ignore" | "restore", note: string | null) {
  const tx = await loadTx(db, txId);
  if (!tx) return { error: "Transaction not found." };
  if (mode === "ignore") {
    if (tx.allocated_amount !== 0) return { error: "Part of this is already coded to a grant. Use Allocate to mark the rest as non-grant." };
    await db.from("gm_pex_transactions").update({ non_grant_amount: tx.amount, non_grant_note: note ?? "Not a grant expense" }).eq("id", txId);
  } else {
    await db.from("gm_pex_transactions").update({ non_grant_amount: 0, non_grant_note: null }).eq("id", txId);
  }
  await refreshPexTransaction(db, txId);
  await audit(db, { entity: "pex", entityId: txId, action: mode === "ignore" ? "ignored" : "restored", actorId: viewer.employeeId, note });
  return { ok: true };
}

// ---------- receipts ----------
async function importPexReceipts(db: Admin, viewer: GmViewer, pexTransactionId: string, attachmentIds: string[]) {
  const cfg = await getPexConfig();
  if (!cfg) throw new Error("PEX isn't connected.");
  const known = new Set((await pexAttachments(cfg, pexTransactionId)).map((a) => a.AttachmentId));
  const ids: string[] = [];
  for (const aid of attachmentIds.slice(0, 5)) {
    if (!known.has(aid)) continue;
    let { buffer, contentType } = await pexAttachmentFile(cfg, pexTransactionId, aid);
    let ext = contentType.includes("pdf") ? "pdf" : contentType.includes("png") ? "png" : "jpg";
    if (contentType.startsWith("image/")) {
      const n = await normaliseImage(buffer);
      buffer = n.buffer;
      contentType = n.contentType;
      ext = "jpg";
    }
    const path = `pending/${viewer.employeeId}/${randomUUID()}.${ext}`;
    const { error } = await db.storage.from(GM_BUCKET).upload(path, buffer, { contentType, upsert: false });
    if (error) throw new Error(error.message);
    const { data: doc } = await db
      .from("gm_expense_documents")
      .insert({ expense_id: null, storage_path: path, file_name: `PEX receipt ${pexTransactionId}.${ext}`, content_type: contentType, size_bytes: buffer.length, doc_type: "receipt", uploaded_by: viewer.employeeId })
      .select("id")
      .single();
    if (doc) ids.push(doc.id);
  }
  return ids;
}

// Storage paths are unique per document, so each split portion gets its
// own copy of the receipt file.
async function copyDocuments(db: Admin, fromExpenseId: string, toExpenseIds: string[], employeeId: string) {
  const { data: docs } = await db.from("gm_expense_documents").select("storage_path, file_name, content_type, size_bytes, doc_type, extracted").eq("expense_id", fromExpenseId);
  for (const to of toExpenseIds) {
    for (const d of docs ?? []) {
      const ext = String(d.storage_path).split(".").pop() ?? "bin";
      const path = `${to}/${randomUUID()}.${ext}`;
      const { error } = await db.storage.from(GM_BUCKET).copy(d.storage_path, path);
      if (error) continue;
      await db.from("gm_expense_documents").insert({ ...d, storage_path: path, expense_id: to, uploaded_by: employeeId });
    }
  }
}

// ---------- optional PEX tag write-back ----------
async function writeBackGrantTag(db: Admin, tx: PexTx) {
  if (!tx.external_id || tx.source === "upload") return;
  const tagId = await getIntegrationSetting("pex_grant_tag_id", process.env.PEX_GRANT_TAG_ID);
  if (!tagId) return;
  const cfg = await getPexConfig();
  if (!cfg) return;
  const { data } = await db.from("gm_expenses").select("status, grant:grant_id(code)").eq("pex_transaction_id", tx.id).neq("status", "rejected");
  const codes = [...new Set((data ?? []).map((e) => (e.grant as unknown as { code: string } | null)?.code).filter(Boolean))];
  if (codes.length) await pexSetTransactionTag(cfg, tx.external_id, tagId, codes.join(", "));
}
