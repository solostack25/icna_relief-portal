import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/server";
import { getPexConfig, pexAllTransactions, pexBusinessBalance, pexCardholders, pexCardholderTransactions, type PexConfig, type PexTransaction } from "./client";
import { suggest, type Designation, type GrantInfo, type LineInfo } from "./rules";

// PEX -> portal sync.
//
// Cards: /Details/AccountDetails, matched to employees by email.
// Transactions: /Details/AllCardholderTransactions over a rolling
// window (nightly cron), or one cardholder's recent activity when a
// webhook arrives. Webhooks are the fast path; the nightly window is
// what guarantees nothing is missed (PEX leaves missed webhooks to us).
//
// Pending holds are shown but can't be allocated until they settle.
// When the settled transaction arrives (AuthTransactionId = the hold's
// id) the pending row is converted in place so nothing is duplicated.
// Holds that drop off (expired/reversed) are removed if untouched.
// Rows already being allocated never have their amount silently
// rewritten - they get an "amount_changed" flag instead.

type Admin = SupabaseClient;
const admin = () => createAdminClient() as Admin;

export type SyncStats = {
  balance?: number | null;
  cards?: { seen: number; inserted: number; updated: number; matchedEmployees: number };
  transactions?: { seen: number; inserted: number; updated: number; settled: number; removedHolds: number; skipped: number };
};

const iso = (d: Date) => d.toISOString().slice(0, 10);
const daysAgo = (n: number) => iso(new Date(Date.now() - n * 864e5));

// ---------- run log ----------
export async function withRun<T extends SyncStats>(
  kind: "cards" | "transactions" | "full",
  trigger: "cron" | "manual" | "webhook",
  actorId: string | null,
  fn: (cfg: PexConfig) => Promise<T>
): Promise<{ ok: boolean; stats?: T; error?: string }> {
  const db = admin();
  const { data: run } = await db.from("pex_sync_runs").insert({ kind, trigger, actor_id: actorId }).select("id").single();
  const finish = (patch: Record<string, unknown>) => (run ? db.from("pex_sync_runs").update({ finished_at: new Date().toISOString(), ...patch }).eq("id", run.id) : Promise.resolve());
  const cfg = await getPexConfig();
  if (!cfg) {
    const error = "PEX isn't connected yet. Add the API token in PEX settings.";
    await finish({ ok: false, error });
    return { ok: false, error };
  }
  try {
    const stats = await fn(cfg);
    await finish({ ok: true, stats });
    return { ok: true, stats };
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    await finish({ ok: false, error });
    return { ok: false, error };
  }
}

export function runFullSync(trigger: "cron" | "manual", actorId: string | null = null, days = 45) {
  return withRun("full", trigger, actorId, async (cfg) => {
    const cards = await syncCards(cfg);
    const transactions = await syncTransactions(cfg, daysAgo(days), iso(new Date()));
    const balance = await pexBusinessBalance(cfg).catch(() => null);
    return { cards, transactions, balance };
  });
}

// ---------- cards ----------
export async function syncCards(cfg: PexConfig): Promise<NonNullable<SyncStats["cards"]>> {
  const db = admin();
  const list = await pexCardholders(cfg);
  const stats = { seen: list.length, inserted: 0, updated: 0, matchedEmployees: 0 };
  if (!list.length) return stats;

  const { data: existing } = await db.from("pex_cards").select("id, pex_account_id, last4, employee_id");
  const byAcct = new Map((existing ?? []).filter((c) => c.pex_account_id != null).map((c) => [Number(c.pex_account_id), c]));
  // Cards first seen in a CSV upload (no PEX account id yet), by last 4.
  const csvByLast4 = new Map((existing ?? []).filter((c) => c.pex_account_id == null && c.last4).map((c) => [String(c.last4), c]));

  const emails = [...new Set(list.map((c) => c.Email?.trim().toLowerCase()).filter(Boolean) as string[])];
  const { data: emps } = emails.length ? await db.from("employees").select("id, email, assigned_office_id").in("email", emails) : { data: [] };
  const empByEmail = new Map((emps ?? []).map((e) => [String(e.email).toLowerCase(), e]));
  // Some employee emails are stored with different casing; catch those too.
  if (emails.length && empByEmail.size < emails.length) {
    const { data: more } = await db.from("employees").select("id, email, assigned_office_id").or(emails.map((e) => `email.ilike.${e}`).join(","));
    (more ?? []).forEach((e) => empByEmail.set(String(e.email).toLowerCase(), e));
  }

  const now = new Date().toISOString();
  for (const c of list) {
    const emp = c.Email ? empByEmail.get(c.Email.trim().toLowerCase()) : undefined;
    const row = {
      pex_account_id: c.AccountId,
      first_name: c.FirstName ?? null,
      last_name: c.LastName ?? null,
      email: c.Email ?? null,
      last4: c.CardNumber4Digits ?? null,
      card_status: c.CardStatus ?? null,
      account_status: c.AccountStatus ?? null,
      is_virtual: !!c.IsVirtual,
      available_balance: c.AvailableBalance ?? null,
      ledger_balance: c.LedgerBalance ?? null,
      custom_id: c.CustomId ?? null,
      user_groups: c.UserGroups ?? null,
      raw: c,
      synced_at: now,
      updated_at: now,
    };
    const found = byAcct.get(c.AccountId) ?? (c.CardNumber4Digits ? csvByLast4.get(c.CardNumber4Digits) : undefined);
    if (found) {
      // Never overwrite a person Grant Management linked by hand.
      const patch: Record<string, unknown> = { ...row };
      if (!found.employee_id && emp) {
        patch.employee_id = emp.id;
        patch.office_id = emp.assigned_office_id ?? null;
        stats.matchedEmployees++;
      }
      await db.from("pex_cards").update(patch).eq("id", found.id);
      stats.updated++;
    } else {
      await db.from("pex_cards").insert({ ...row, employee_id: emp?.id ?? null, office_id: emp?.assigned_office_id ?? null });
      if (emp) stats.matchedEmployees++;
      stats.inserted++;
    }
  }
  return stats;
}

// ---------- transactions ----------
const isPurchase = (t: PexTransaction) => !t.IsDecline && (t.TransactionType === 2 || /network/i.test(String(t.TransactionType)));

export async function syncTransactions(cfg: PexConfig, from: string, to: string, accountId?: number): Promise<NonNullable<SyncStats["transactions"]>> {
  const db = admin();
  const raw = accountId ? await pexCardholderTransactions(cfg, accountId, from, to) : await pexAllTransactions(cfg, from, to);
  const list = raw.filter(isPurchase);
  const stats = { seen: raw.length, inserted: 0, updated: 0, settled: 0, removedHolds: 0, skipped: raw.length - list.length };
  const ctx = await loadSuggestContext(db);

  const ids = list.map((t) => String(t.TransactionId));
  const authIds = list.filter((t) => !t.IsPending && t.AuthTransactionId).map((t) => String(t.AuthTransactionId));
  const existing = await rowsByExternalId(db, [...new Set([...ids, ...authIds])]);

  const now = new Date().toISOString();
  for (const t of list) {
    const extId = String(t.TransactionId);
    const card = ctx.cardByAcct.get(t.AcctId) ?? null;
    // PEX reports spending as negative; the portal stores spend as positive.
    const amount = Math.round(-Number(t.TransactionAmount) * 100) / 100;
    const date = (t.TransactionTime ?? "").slice(0, 10);
    if (!date || !Number.isFinite(amount) || amount === 0) {
      stats.skipped++;
      continue;
    }
    const fields = {
      external_id: extId,
      pex_account_id: t.AcctId,
      card_id: card?.id ?? null,
      card_holder: card ? [card.first_name, card.last_name].filter(Boolean).join(" ") || null : null,
      card_last4: card?.last4 ?? null,
      transaction_date: date,
      transaction_time: t.TransactionTime ?? null,
      settlement_time: t.SettlementTime ?? null,
      is_pending: !!t.IsPending,
      auth_transaction_id: t.AuthTransactionId ? String(t.AuthTransactionId) : null,
      merchant: t.MerchantNameNormalized || t.MerchantName || t.Description || null,
      merchant_city: t.MerchantCity ?? null,
      merchant_state: t.MerchantState ?? null,
      mcc: t.MCCCode?.trim() || null,
      memo: noteText(t),
      pex_tags: t.TransactionTags?.Tags ?? null,
      pex_approval_status: t.MetadataApprovalStatus ?? null,
      raw: t,
      synced_at: now,
      updated_at: now,
    };

    const same = existing.get(extId);
    const hold = !same && t.AuthTransactionId ? existing.get(String(t.AuthTransactionId)) : undefined;
    const target = same ?? (hold?.is_pending ? hold : undefined);

    if (target) {
      const touched = Number(target.allocated_amount) !== 0 || Number(target.non_grant_amount) !== 0;
      const patch: Record<string, unknown> = { ...fields };
      if (touched && Math.abs(Number(target.amount) - amount) > 0.005) {
        // Keep the allocated amount; ask a person to re-check.
        delete patch.amount;
        patch.flags = [...new Set([...(target.flags ?? []), "amount_changed"])];
      } else {
        patch.amount = amount;
        if (!touched) Object.assign(patch, suggestionPatch(ctx, { card_id: fields.card_id, transaction_date: date, mcc: fields.mcc, amount }));
      }
      if (!target.employee_id && card?.employee_id) patch.employee_id = card.employee_id;
      await db.from("gm_pex_transactions").update(patch).eq("id", target.id);
      if (target !== same) stats.settled++;
      else stats.updated++;
      existing.set(extId, { ...target, ...patch, external_id: extId } as ExistingRow);
    } else {
      await db.from("gm_pex_transactions").insert({
        ...fields,
        amount,
        source: "api",
        status: "unmatched",
        employee_id: card?.employee_id ?? null,
        ...suggestionPatch(ctx, { card_id: fields.card_id, transaction_date: date, mcc: fields.mcc, amount }),
      });
      stats.inserted++;
    }
  }

  // Holds in this window that PEX no longer reports: expired or settled
  // under a new id we've already merged. Remove them if nobody touched them.
  let q = db
    .from("gm_pex_transactions")
    .select("id, external_id")
    .eq("source", "api")
    .eq("is_pending", true)
    .eq("allocated_amount", 0)
    .eq("non_grant_amount", 0)
    .gte("transaction_date", from)
    .lte("transaction_date", to);
  if (accountId) q = q.eq("pex_account_id", accountId);
  const { data: holds } = await q;
  const live = new Set(ids);
  const gone = (holds ?? []).filter((h) => !live.has(String(h.external_id))).map((h) => h.id);
  if (gone.length) {
    await db.from("gm_pex_transactions").delete().in("id", gone);
    stats.removedHolds = gone.length;
  }
  return stats;
}

function noteText(t: PexTransaction): string | null {
  const notes = (t.TransactionNotes ?? []).map((n) => n.NoteText ?? n.Note ?? "").filter(Boolean);
  return notes.length ? notes.join(" · ").slice(0, 500) : null;
}

type ExistingRow = {
  id: string;
  external_id: string;
  amount: number;
  is_pending: boolean;
  allocated_amount: number;
  non_grant_amount: number;
  employee_id: string | null;
  flags: string[] | null;
};

async function rowsByExternalId(db: Admin, ids: string[]) {
  const out = new Map<string, ExistingRow>();
  for (let i = 0; i < ids.length; i += 300) {
    const chunk = ids.slice(i, i + 300);
    const { data } = await db
      .from("gm_pex_transactions")
      .select("id, external_id, amount, is_pending, allocated_amount, non_grant_amount, employee_id, flags")
      .in("external_id", chunk);
    (data ?? []).forEach((r) => out.set(String(r.external_id), r as ExistingRow));
  }
  return out;
}

// ---------- suggestions ----------
type SuggestCtx = {
  designations: Designation[];
  grants: Map<string, GrantInfo>;
  lines: LineInfo[];
  cardByAcct: Map<number, { id: string; first_name: string | null; last_name: string | null; last4: string | null; employee_id: string | null }>;
};

export async function loadSuggestContext(db: Admin = admin()): Promise<SuggestCtx> {
  const [{ data: d }, { data: g }, { data: l }, { data: c }] = await Promise.all([
    db.from("gm_pex_card_grants").select("id, card_id, grant_id, start_date, end_date, is_default, default_line_id"),
    db.from("gm_grants").select("id, status, start_date, end_date"),
    db.from("gm_budget_lines").select("id, grant_id, category, subcategory, is_active"),
    db.from("pex_cards").select("id, pex_account_id, first_name, last_name, last4, employee_id"),
  ]);
  return {
    designations: (d ?? []) as Designation[],
    grants: new Map(((g ?? []) as GrantInfo[]).map((x) => [x.id, x])),
    lines: (l ?? []) as LineInfo[],
    cardByAcct: new Map((c ?? []).filter((x) => x.pex_account_id != null).map((x) => [Number(x.pex_account_id), x])),
  };
}

function suggestionPatch(ctx: SuggestCtx, tx: { card_id: string | null; transaction_date: string; mcc: string | null; amount: number }) {
  const s = suggest(tx, ctx.designations, ctx.grants, ctx.lines);
  return { suggested_grant_id: s.grantId, suggested_line_id: s.lineId, flags: s.flags };
}

// Re-run suggestions for a card's untouched transactions, e.g. after
// Grant Management links the card to a grant or changes its dates.
export async function resuggestCard(db: Admin, cardId: string) {
  const ctx = await loadSuggestContext(db);
  const { data: rows } = await db
    .from("gm_pex_transactions")
    .select("id, card_id, transaction_date, mcc, amount, flags")
    .eq("card_id", cardId)
    .eq("status", "unmatched");
  let n = 0;
  for (const r of rows ?? []) {
    const p = suggestionPatch(ctx, { card_id: r.card_id, transaction_date: r.transaction_date, mcc: r.mcc, amount: Number(r.amount) });
    // Keep the settle-time warning; suggestions own the rest.
    if ((r.flags ?? []).includes("amount_changed")) p.flags = [...p.flags, "amount_changed"];
    await db.from("gm_pex_transactions").update(p).eq("id", r.id);
    n++;
  }
  return n;
}

// Uploaded (CSV) transactions: link to a known card by last 4 so the
// grant designation applies to them too.
export async function linkUploadedToCards(db: Admin = admin()) {
  const { data: cards } = await db.from("pex_cards").select("id, last4, employee_id").not("last4", "is", null);
  const byLast4 = new Map<string, { id: string; employee_id: string | null }[]>();
  (cards ?? []).forEach((c) => byLast4.set(String(c.last4), [...(byLast4.get(String(c.last4)) ?? []), c]));
  const { data: rows } = await db.from("gm_pex_transactions").select("id, card_last4, employee_id").is("card_id", null).not("card_last4", "is", null);
  const touched = new Set<string>();
  for (const r of rows ?? []) {
    const matches = byLast4.get(String(r.card_last4)) ?? [];
    // Last 4 alone can collide; prefer the card held by the same person.
    const card = matches.length === 1 ? matches[0] : matches.find((m) => m.employee_id && m.employee_id === r.employee_id);
    if (!card) continue;
    await db.from("gm_pex_transactions").update({ card_id: card.id, employee_id: r.employee_id ?? card.employee_id }).eq("id", r.id);
    touched.add(card.id);
  }
  for (const id of touched) await resuggestCard(db, id);
  return touched.size;
}
