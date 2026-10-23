import { NextResponse } from "next/server";
import { requireViewer, fail } from "@/lib/grantManagement/api";
import { audit, createAdminClient, GM_BUCKET } from "@/lib/grantManagement/server";
import { getIntegrationSetting, setIntegrationSetting } from "@/lib/integrationSettings";
import { DEMO_ACCOUNT_MAX, DEMO_ACCOUNT_MIN, isDemoUrl } from "@/lib/pex/demo";
import { resuggestCard, runFullSync } from "@/lib/pex/sync";
import { PEX_DEFAULT_URL } from "@/lib/pex/client";

export const maxDuration = 300;

// Demo mode for the PEX module (Grant Management admins).
//   POST   turn on demo PEX, sync 90 days, link a few demo cards to
//          active grants so suggestions show straight away
//   DELETE remove every demo card / transaction / coded portion and
//          switch demo mode off
// Refuses to start while a real PEX token is saved, so demo data never
// mixes with live card data.

export async function POST() {
  const auth = await requireViewer({ manager: true });
  if ("res" in auth) return auth.res;
  const { viewer } = auth;
  if (!viewer.isAdmin) return fail("Only a Grant Management admin can turn on demo mode.", 403);

  const [url, token] = await Promise.all([getIntegrationSetting("pex_api_url", process.env.PEX_API_URL), getIntegrationSetting("pex_api_token", process.env.PEX_API_TOKEN)]);
  if (token && !isDemoUrl(url)) return fail("A real PEX API token is saved. Demo mode is only for before PEX is connected.");

  await setIntegrationSetting("pex_api_url", "demo", viewer.employeeId);
  const run = await runFullSync("manual", viewer.employeeId, 90);
  if (!run.ok) return fail(run.error ?? "Demo sync failed.", 500);

  const db = createAdminClient();
  const linked = await linkDemoCards(db, viewer.employeeId);
  await audit(db, { entity: "pex", action: "demo_started", actorId: viewer.employeeId, changes: { stats: run.stats, linked } });
  return NextResponse.json({ ok: true, stats: run.stats, linked });
}

// Gives the demo a realistic spread: a few cards on one grant, one card
// on two grants (default + secondary), one card whose grant link ended,
// and one card that isn't a grant card at all.
async function linkDemoCards(db: ReturnType<typeof createAdminClient>, actorId: string) {
  const { data: cards } = await db.from("pex_cards").select("id, pex_account_id").gte("pex_account_id", DEMO_ACCOUNT_MIN).lte("pex_account_id", DEMO_ACCOUNT_MAX).order("pex_account_id");
  const { data: existing } = await db.from("gm_pex_card_grants").select("card_id").in("card_id", (cards ?? []).map((c) => c.id));
  if (!cards?.length || existing?.length) return 0;
  const { data: grants } = await db.from("gm_grants").select("id, start_date, end_date").eq("status", "active").order("end_date", { ascending: false }).limit(3);
  if (!grants?.length) return 0;
  const today = new Date().toISOString().slice(0, 10);
  const back = (d: number) => new Date(Date.now() - d * 864e5).toISOString().slice(0, 10);
  const startFor = (g: { start_date: string }) => (g.start_date > back(120) ? g.start_date : back(120));
  const A = grants[0];
  const B = grants[1] ?? grants[0];
  const C = grants[2] ?? grants[0];
  const plan: { card: number; g: { id: string; start_date: string; end_date: string }; is_default: boolean; start?: string; end?: string | null }[] = [
    { card: 0, g: A, is_default: true },
    { card: 1, g: A, is_default: true },
    { card: 2, g: B, is_default: true },
    { card: 3, g: A, is_default: true },
    // card 4 (virtual): not a grant card
    { card: 5, g: C, is_default: true, start: back(120), end: back(30) },
  ];
  if (B.id !== A.id) plan.push({ card: 3, g: B, is_default: false });
  let n = 0;
  for (const p of plan) {
    const card = cards[p.card];
    if (!card) continue;
    const start = p.start ?? startFor(p.g);
    const end = p.end !== undefined ? p.end : p.g.end_date < today ? p.g.end_date : null;
    if (end && end < start) continue;
    const { error } = await db.from("gm_pex_card_grants").insert({ card_id: card.id, grant_id: p.g.id, start_date: start, end_date: end, is_default: p.is_default, note: "Demo link", created_by: actorId });
    if (!error) n++;
  }
  for (const c of cards) {
    await db.from("pex_cards").update({ grant_eligible: plan.some((p) => cards[p.card]?.id === c.id) }).eq("id", c.id);
    await resuggestCard(db, c.id);
  }
  return n;
}

export async function DELETE() {
  const auth = await requireViewer({ manager: true });
  if ("res" in auth) return auth.res;
  const { viewer } = auth;
  if (!viewer.isAdmin) return fail("Only a Grant Management admin can remove demo data.", 403);
  const db = createAdminClient();

  const { data: txs } = await db.from("gm_pex_transactions").select("id").gte("pex_account_id", DEMO_ACCOUNT_MIN).lte("pex_account_id", DEMO_ACCOUNT_MAX);
  const txIds = (txs ?? []).map((t) => t.id);
  let expenses = 0;
  for (let i = 0; i < txIds.length; i += 200) {
    const chunk = txIds.slice(i, i + 200);
    const { data: exps } = await db.from("gm_expenses").select("id").in("pex_transaction_id", chunk);
    const expIds = (exps ?? []).map((e) => e.id);
    if (expIds.length) {
      const { data: docs } = await db.from("gm_expense_documents").select("storage_path").in("expense_id", expIds);
      if (docs?.length) await db.storage.from(GM_BUCKET).remove(docs.map((d) => d.storage_path));
      await db.from("gm_expense_documents").delete().in("expense_id", expIds);
      await db.from("gm_expenses").delete().in("id", expIds);
      expenses += expIds.length;
    }
    await db.from("gm_pex_transactions").delete().in("id", chunk);
  }
  const { data: cards } = await db.from("pex_cards").delete().gte("pex_account_id", DEMO_ACCOUNT_MIN).lte("pex_account_id", DEMO_ACCOUNT_MAX).select("id");

  const url = await getIntegrationSetting("pex_api_url", process.env.PEX_API_URL);
  if (isDemoUrl(url)) await setIntegrationSetting("pex_api_url", PEX_DEFAULT_URL, viewer.employeeId);
  await audit(db, { entity: "pex", action: "demo_removed", actorId: viewer.employeeId, changes: { transactions: txIds.length, expenses, cards: cards?.length ?? 0 } });
  return NextResponse.json({ ok: true, transactions: txIds.length, expenses, cards: cards?.length ?? 0 });
}
