import { NextResponse } from "next/server";
import { audit, createAdminClient } from "@/lib/grantManagement/server";
import { requireViewer, fail, readJson } from "@/lib/grantManagement/api";
import { resuggestCard } from "@/lib/pex/sync";

// Designate a card to a grant for a period ("this card spends on this
// grant from X to Y"). Grant Management only.
//   POST   { grant_id, start_date, end_date?, is_default?, default_line_id?, note? }
//   PATCH  { designation_id, end_date?, is_default?, default_line_id? }
//   DELETE { designation_id }
// Changes re-run suggestions on the card's uncoded transactions.

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const overlaps = (aS: string, aE: string | null, bS: string, bE: string | null) => aS <= (bE ?? "9999-12-31") && bS <= (aE ?? "9999-12-31");

type Row = { id: string; grant_id: string; start_date: string; end_date: string | null; is_default: boolean };

async function checkConflicts(db: ReturnType<typeof createAdminClient>, cardId: string, me: { id?: string; grant_id: string; start_date: string; end_date: string | null; is_default: boolean }) {
  const { data } = await db.from("gm_pex_card_grants").select("id, grant_id, start_date, end_date, is_default").eq("card_id", cardId);
  const others = ((data ?? []) as Row[]).filter((r) => r.id !== me.id && overlaps(r.start_date, r.end_date, me.start_date, me.end_date));
  if (others.some((r) => r.grant_id === me.grant_id)) return "This card is already linked to that grant for some of those dates.";
  if (me.is_default && others.some((r) => r.is_default)) return "Another grant is already the default for this card on those dates. End that link first, or make this one not the default.";
  return null;
}

// Ending or removing an assignment can't leave already-coded charges
// outside every assignment - they'd disappear from Grant Management
// while their expenses still count against the grant.
async function orphanedCoded(db: ReturnType<typeof createAdminClient>, cardId: string, linkId: string, newEnd: string | null | "remove") {
  const { data: links } = await db.from("gm_pex_card_grants").select("id, start_date, end_date").eq("card_id", cardId);
  const proposed = (links ?? [])
    .filter((l) => !(l.id === linkId && newEnd === "remove"))
    .map((l) => (l.id === linkId && newEnd !== "remove" ? { ...l, end_date: newEnd } : l));
  const { data: coded } = await db.from("gm_pex_transactions").select("transaction_date").eq("card_id", cardId).neq("allocated_amount", 0);
  const covered = (d: string) => proposed.some((l) => d >= l.start_date && (!l.end_date || d <= l.end_date));
  return (coded ?? []).filter((t) => !covered(t.transaction_date)).length;
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: cardId } = await params;
  const auth = await requireViewer({ manager: true });
  if ("res" in auth) return auth.res;
  const db = createAdminClient();
  const body = await readJson(req);
  const grantId = typeof body.grant_id === "string" ? body.grant_id : "";
  const start = String(body.start_date ?? "");
  const end = body.end_date ? String(body.end_date) : null;
  const fields: Record<string, string> = {};
  if (!grantId) fields.grant_id = "Pick the grant.";
  if (!DATE.test(start)) fields.start_date = "Pick the start date.";
  if (end && (!DATE.test(end) || end < start)) fields.end_date = "End date must be on or after the start.";
  if (Object.keys(fields).length) return fail("Please fix the highlighted fields.", 400, fields);

  const [{ data: card }, { data: grant }] = await Promise.all([
    db.from("pex_cards").select("id").eq("id", cardId).maybeSingle(),
    db.from("gm_grants").select("id, code, start_date, end_date").eq("id", grantId).maybeSingle(),
  ]);
  if (!card) return fail("Card not found.", 404);
  if (!grant) return fail("Grant not found.", 404, { grant_id: "Not found." });
  const lineId = typeof body.default_line_id === "string" && body.default_line_id ? body.default_line_id : null;
  if (lineId) {
    const { data: line } = await db.from("gm_budget_lines").select("grant_id").eq("id", lineId).maybeSingle();
    if (line?.grant_id !== grantId) return fail("That category isn't in this grant's budget.", 400, { default_line_id: "Not in this grant." });
  }
  const isDefault = body.is_default !== false;
  const conflict = await checkConflicts(db, cardId, { grant_id: grantId, start_date: start, end_date: end, is_default: isDefault });
  if (conflict) return fail(conflict);

  const { data, error } = await db
    .from("gm_pex_card_grants")
    .insert({ card_id: cardId, grant_id: grantId, start_date: start, end_date: end, is_default: isDefault, default_line_id: lineId, note: typeof body.note === "string" ? body.note.slice(0, 300) : null, created_by: auth.viewer.employeeId })
    .select("id")
    .single();
  if (error || !data) return fail(error?.message ?? "Couldn't link the card.", 500);
  await db.from("pex_cards").update({ grant_eligible: true }).eq("id", cardId);
  const resuggested = await resuggestCard(db, cardId);
  await audit(db, { entity: "pex_card", entityId: cardId, grantId, action: "linked_to_grant", actorId: auth.viewer.employeeId, changes: { designation_id: data.id, start_date: start, end_date: end, is_default: isDefault } });
  const warning = start < grant.start_date || (end ?? "9999-12-31") > grant.end_date ? `Heads up: the grant period is ${grant.start_date} to ${grant.end_date}. Spending outside it will be flagged.` : null;
  return NextResponse.json({ id: data.id, resuggested, warning });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: cardId } = await params;
  const auth = await requireViewer({ manager: true });
  if ("res" in auth) return auth.res;
  const db = createAdminClient();
  const body = await readJson(req);
  const { data: row } = await db.from("gm_pex_card_grants").select("*").eq("id", String(body.designation_id ?? "")).eq("card_id", cardId).maybeSingle();
  if (!row) return fail("Link not found.", 404);
  const next = {
    end_date: "end_date" in body ? (body.end_date ? String(body.end_date) : null) : row.end_date,
    is_default: "is_default" in body ? !!body.is_default : row.is_default,
    default_line_id: "default_line_id" in body ? (typeof body.default_line_id === "string" && body.default_line_id ? body.default_line_id : null) : row.default_line_id,
  };
  if (next.end_date && (!DATE.test(next.end_date) || next.end_date < row.start_date)) return fail("End date must be on or after the start.", 400, { end_date: "Invalid." });
  const conflict = await checkConflicts(db, cardId, { id: row.id, grant_id: row.grant_id, start_date: row.start_date, end_date: next.end_date, is_default: next.is_default });
  const orphaned = await orphanedCoded(db, cardId, row.id, next.end_date);
  if (orphaned) return fail(`${orphaned} charge${orphaned === 1 ? " is" : "s are"} already coded to a grant after that date. Pick a later end date, or un-code ${orphaned === 1 ? "it" : "them"} first.`);
  if (conflict) return fail(conflict);
  const { error } = await db.from("gm_pex_card_grants").update(next).eq("id", row.id);
  if (error) return fail(error.message, 500);
  const resuggested = await resuggestCard(db, cardId);
  await audit(db, { entity: "pex_card", entityId: cardId, grantId: row.grant_id, action: "grant_link_edited", actorId: auth.viewer.employeeId, changes: { designation_id: row.id, from: { end_date: row.end_date, is_default: row.is_default }, to: next } });
  return NextResponse.json({ ok: true, resuggested });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: cardId } = await params;
  const auth = await requireViewer({ manager: true });
  if ("res" in auth) return auth.res;
  const db = createAdminClient();
  const body = await readJson(req);
  const { data: row } = await db.from("gm_pex_card_grants").select("*").eq("id", String(body.designation_id ?? "")).eq("card_id", cardId).maybeSingle();
  if (!row) return fail("Link not found.", 404);
  const orphaned = await orphanedCoded(db, cardId, row.id, "remove");
  if (orphaned) return fail(`${orphaned} charge${orphaned === 1 ? " is" : "s are"} already coded under this assignment. Use End instead of Remove, or un-code ${orphaned === 1 ? "it" : "them"} first.`);
  await db.from("gm_pex_card_grants").delete().eq("id", row.id);
  const resuggested = await resuggestCard(db, cardId);
  await audit(db, { entity: "pex_card", entityId: cardId, grantId: row.grant_id, action: "unlinked_from_grant", actorId: auth.viewer.employeeId, changes: row });
  return NextResponse.json({ ok: true, resuggested });
}
