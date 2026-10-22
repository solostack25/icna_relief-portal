import { createAdminClient } from "@/lib/grantManagement/server";
import { audit } from "./server";
import type { BudgetLineInput } from "./grantInput";

type Admin = ReturnType<typeof createAdminClient>;

// Budgets are versioned. Version 1 is the original approved budget;
// every funder-approved revision is a new "amendment" version built as a
// draft, then activated (the previous one is kept as "superseded").
// Budget lines keep a stable id across versions so expenses always
// point at the same line no matter how many amendments happen.

export async function getVersions(admin: Admin, grantId: string) {
  const { data } = await admin
    .from("gm_budget_versions")
    .select("id, version_no, kind, status, effective_date, funder_approved_date, reason, created_by, created_at, activated_by, activated_at, gm_budget_amounts(line_id, amount)")
    .eq("grant_id", grantId)
    .order("version_no");
  return (data ?? []) as {
    id: string;
    version_no: number;
    kind: string;
    status: string;
    effective_date: string | null;
    funder_approved_date: string | null;
    reason: string | null;
    created_by: string | null;
    created_at: string;
    activated_by: string | null;
    activated_at: string | null;
    gm_budget_amounts: { line_id: string; amount: number }[];
  }[];
}

export async function saveDraft(
  admin: Admin,
  grantId: string,
  lines: BudgetLineInput[],
  meta: { reason?: string | null; effective_date?: string | null; funder_approved_date?: string | null },
  actorId: string
): Promise<{ versionId?: string; error?: string }> {
  const versions = await getVersions(admin, grantId);
  let draft = versions.find((v) => v.status === "draft");
  const active = versions.find((v) => v.status === "active");
  if (active && !meta.reason?.trim() && !draft?.reason) return { error: "Say why the budget is being amended (e.g. funder approval date and reference)." };

  if (!draft) {
    const nextNo = (versions.at(-1)?.version_no ?? 0) + 1;
    const { data, error } = await admin
      .from("gm_budget_versions")
      .insert({
        grant_id: grantId,
        version_no: nextNo,
        kind: active ? "amendment" : "original",
        status: "draft",
        reason: meta.reason ?? null,
        effective_date: meta.effective_date || null,
        funder_approved_date: meta.funder_approved_date || null,
        created_by: actorId,
      })
      .select("id, version_no, kind, status, effective_date, funder_approved_date, reason, created_by, created_at, activated_by, activated_at")
      .single();
    if (error || !data) return { error: error?.message ?? "Couldn't start the budget." };
    draft = { ...data, gm_budget_amounts: [] };
  } else {
    await admin
      .from("gm_budget_versions")
      .update({
        reason: meta.reason ?? draft.reason,
        effective_date: meta.effective_date || draft.effective_date,
        funder_approved_date: meta.funder_approved_date || draft.funder_approved_date,
      })
      .eq("id", draft.id);
  }

  const { data: existing } = await admin.from("gm_budget_lines").select("id, category, subcategory").eq("grant_id", grantId);
  const byKey = new Map((existing ?? []).map((l: { id: string; category: string; subcategory: string | null }) => [key(l.category, l.subcategory), l.id]));
  const byId = new Set((existing ?? []).map((l: { id: string }) => l.id));

  const keepIds: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    let id = l.line_id && byId.has(l.line_id) ? l.line_id : byKey.get(key(l.category, l.subcategory));
    if (id) {
      const { error } = await admin.from("gm_budget_lines").update({ category: l.category, subcategory: l.subcategory, sort_order: i }).eq("id", id);
      if (error) return { error: error.message.includes("duplicate") ? `${l.category} › ${l.subcategory ?? ""} clashes with another line.` : error.message };
    } else {
      const { data, error } = await admin
        .from("gm_budget_lines")
        .insert({ grant_id: grantId, category: l.category, subcategory: l.subcategory, sort_order: i, is_active: false })
        .select("id")
        .single();
      if (error || !data) return { error: error?.message ?? "Couldn't add a line." };
      id = data.id;
    }
    keepIds.push(id!);
  }

  await admin.from("gm_budget_amounts").delete().eq("version_id", draft.id);
  if (lines.length) {
    const { error } = await admin.from("gm_budget_amounts").insert(lines.map((l, i) => ({ version_id: draft!.id, line_id: keepIds[i], amount: l.amount })));
    if (error) return { error: error.message };
  }

  // Lines dropped from the budget that were never used anywhere can go.
  const dropped = (existing ?? []).map((l: { id: string }) => l.id).filter((id: string) => !keepIds.includes(id));
  for (const id of dropped) {
    const [{ count: exp }, { count: amt }] = await Promise.all([
      admin.from("gm_expenses").select("id", { count: "exact", head: true }).eq("line_id", id),
      admin.from("gm_budget_amounts").select("line_id", { count: "exact", head: true }).eq("line_id", id),
    ]);
    if (!exp && !amt) await admin.from("gm_budget_lines").delete().eq("id", id);
  }

  await audit(admin, {
    entity: "budget",
    entityId: draft.id,
    grantId,
    action: "draft_saved",
    actorId,
    changes: { version: draft.version_no, total: lines.reduce((s, l) => s + l.amount, 0), lines: lines.length },
  });
  return { versionId: draft.id };
}

export async function activateDraft(admin: Admin, grantId: string, actorId: string): Promise<{ error?: string }> {
  const [{ data: grant }, versions, { data: lines }] = await Promise.all([
    admin.from("gm_grants").select("award_amount").eq("id", grantId).single(),
    getVersions(admin, grantId),
    admin.from("gm_budget_lines").select("id, category, subcategory").eq("grant_id", grantId),
  ]);
  const draft = versions.find((v) => v.status === "draft");
  const active = versions.find((v) => v.status === "active");
  if (!draft) return { error: "There's no draft budget to approve." };
  const total = draft.gm_budget_amounts.reduce((s, a) => s + Number(a.amount), 0);
  if (total <= 0) return { error: "The budget is empty." };
  if (grant && total > Number(grant.award_amount) + 0.005) {
    return { error: `Budget total ($${total.toLocaleString()}) is more than the award ($${Number(grant.award_amount).toLocaleString()}). Fix the lines or update the award amount first.` };
  }
  if (draft.kind === "amendment" && !draft.reason) return { error: "Add the reason / funder approval for this amendment first." };

  // Can't take a line below what's already been approved against it.
  const { data: actuals } = await admin.from("gm_line_summary").select("line_id, actual").eq("grant_id", grantId);
  const newAmt = new Map(draft.gm_budget_amounts.map((a) => [a.line_id, Number(a.amount)]));
  const lineName = new Map((lines ?? []).map((l: { id: string; category: string; subcategory: string | null }) => [l.id, l.subcategory ? `${l.category} › ${l.subcategory}` : l.category]));
  const warnings: string[] = [];
  for (const a of actuals ?? []) {
    const spent = Number(a.actual);
    if (spent > 0 && spent > (newAmt.get(a.line_id) ?? 0) + 0.005) warnings.push(`${lineName.get(a.line_id)} (spent $${spent.toLocaleString()})`);
  }

  if (active) {
    const { error } = await admin.from("gm_budget_versions").update({ status: "superseded" }).eq("id", active.id);
    if (error) return { error: error.message };
  }
  const { error } = await admin.from("gm_budget_versions").update({ status: "active", activated_by: actorId, activated_at: new Date().toISOString() }).eq("id", draft.id);
  if (error) {
    if (active) await admin.from("gm_budget_versions").update({ status: "active" }).eq("id", active.id);
    return { error: error.message };
  }

  const activeLineIds = draft.gm_budget_amounts.map((a) => a.line_id);
  await admin.from("gm_budget_lines").update({ is_active: false }).eq("grant_id", grantId);
  if (activeLineIds.length) await admin.from("gm_budget_lines").update({ is_active: true }).in("id", activeLineIds);

  const before = new Map((active?.gm_budget_amounts ?? []).map((a) => [a.line_id, Number(a.amount)]));
  const changes = [...new Set([...before.keys(), ...newAmt.keys()])]
    .map((id) => ({ line: lineName.get(id) ?? id, from: before.get(id) ?? 0, to: newAmt.get(id) ?? 0 }))
    .filter((c) => c.from !== c.to);
  await audit(admin, {
    entity: "budget",
    entityId: draft.id,
    grantId,
    action: draft.kind === "original" ? "original_approved" : "amendment_approved",
    actorId,
    changes: { version: draft.version_no, total_from: active ? [...before.values()].reduce((s, n) => s + n, 0) : 0, total_to: total, lines: changes },
    note: [draft.reason, warnings.length ? `Lines now below what's already spent: ${warnings.join(", ")}` : null].filter(Boolean).join(" · ") || null,
  });
  return {};
}

export async function discardDraft(admin: Admin, grantId: string, actorId: string) {
  const versions = await getVersions(admin, grantId);
  const draft = versions.find((v) => v.status === "draft");
  if (!draft) return;
  await admin.from("gm_budget_versions").delete().eq("id", draft.id);
  // drop lines that only ever existed in this draft
  const { data: lines } = await admin.from("gm_budget_lines").select("id").eq("grant_id", grantId);
  for (const l of lines ?? []) {
    const [{ count: exp }, { count: amt }] = await Promise.all([
      admin.from("gm_expenses").select("id", { count: "exact", head: true }).eq("line_id", l.id),
      admin.from("gm_budget_amounts").select("line_id", { count: "exact", head: true }).eq("line_id", l.id),
    ]);
    if (!exp && !amt) await admin.from("gm_budget_lines").delete().eq("id", l.id);
  }
  await audit(admin, { entity: "budget", entityId: draft.id, grantId, action: "draft_discarded", actorId, changes: { version: draft.version_no } });
}

function key(c: string, s: string | null) {
  return `${c.trim().toLowerCase()}|${(s ?? "").trim().toLowerCase()}`;
}
