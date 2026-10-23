import { NextResponse } from "next/server";
import { audit, createAdminClient, diff } from "@/lib/grantManagement/server";
import { fail, readJson } from "@/lib/grantManagement/api";
import { ensurePexAccess, requirePex } from "@/lib/pex/access";
import { resuggestCard } from "@/lib/pex/sync";

// Update a card: who holds it, its office, notes, and whether it's
// used for grants. Finance / PEX admins and Grant Management managers.
//
// "Used for grants" decides whether the card's spending shows up in
// Grant Management for coding. Switching it off is blocked while the
// card is still linked to a grant (end those links first), so grant
// spending can't silently drop out of the queue.
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requirePex();
  if ("res" in auth) return auth.res;
  const { viewer } = auth;
  if (!viewer.isAdmin && !viewer.isGrantManager) return fail("Only Finance or Grant Management can change PEX cards.", 403);
  const db = createAdminClient();
  const { data: card } = await db.from("pex_cards").select("*").eq("id", id).maybeSingle();
  if (!card) return fail("Card not found.", 404);
  const body = await readJson(req);
  const patch: Record<string, unknown> = {};
  if ("employee_id" in body) patch.employee_id = typeof body.employee_id === "string" && body.employee_id ? body.employee_id : null;
  if ("office_id" in body) patch.office_id = typeof body.office_id === "string" && body.office_id ? body.office_id : null;
  if ("notes" in body) patch.notes = typeof body.notes === "string" ? body.notes.slice(0, 500) : null;
  if ("grant_eligible" in body) {
    patch.grant_eligible = !!body.grant_eligible;
    if (!patch.grant_eligible && card.grant_eligible) {
      const today = new Date().toISOString().slice(0, 10);
      const { count } = await db.from("gm_pex_card_grants").select("id", { count: "exact", head: true }).eq("card_id", id).or(`end_date.is.null,end_date.gte.${today}`);
      if (count) return fail(`This card is still linked to ${count} grant${count === 1 ? "" : "s"}. End those links in Grant Management first.`);
    }
  }
  const changes = diff(card, patch, Object.keys(patch));
  if (!Object.keys(changes).length) return NextResponse.json({ ok: true });
  const { error } = await db.from("pex_cards").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) return fail(error.message, 500);
  // New holder: route the card's uncoded transactions to them and give
  // them the PEX tile.
  if ("employee_id" in changes && patch.employee_id) {
    await db.from("gm_pex_transactions").update({ employee_id: patch.employee_id }).eq("card_id", id).in("status", ["unmatched", "partial"]);
    await ensurePexAccess(db, [patch.employee_id as string]);
  }
  if ("grant_eligible" in changes) await resuggestCard(db, id);
  await audit(db, { entity: "pex_card", entityId: id, action: "grant_eligible" in changes ? (patch.grant_eligible ? "used_for_grants_on" : "used_for_grants_off") : "edited", actorId: viewer.employeeId, changes });
  return NextResponse.json({ ok: true });
}
