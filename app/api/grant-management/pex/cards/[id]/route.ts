import { NextResponse } from "next/server";
import { audit, createAdminClient, diff } from "@/lib/grantManagement/server";
import { requireViewer, fail, readJson } from "@/lib/grantManagement/api";

// Update who holds a card, its office, grant-eligible flag, notes.
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireViewer({ manager: true });
  if ("res" in auth) return auth.res;
  const db = createAdminClient();
  const { data: card } = await db.from("pex_cards").select("*").eq("id", id).maybeSingle();
  if (!card) return fail("Card not found.", 404);
  const body = await readJson(req);
  const patch: Record<string, unknown> = {};
  if ("employee_id" in body) patch.employee_id = typeof body.employee_id === "string" && body.employee_id ? body.employee_id : null;
  if ("office_id" in body) patch.office_id = typeof body.office_id === "string" && body.office_id ? body.office_id : null;
  if ("grant_eligible" in body) patch.grant_eligible = !!body.grant_eligible;
  if ("notes" in body) patch.notes = typeof body.notes === "string" ? body.notes.slice(0, 500) : null;
  const changes = diff(card, patch, Object.keys(patch));
  if (!Object.keys(changes).length) return NextResponse.json({ ok: true });
  const { error } = await db.from("pex_cards").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) return fail(error.message, 500);
  // New holder: route the card's uncoded transactions to them.
  if ("employee_id" in patch && patch.employee_id) {
    await db.from("gm_pex_transactions").update({ employee_id: patch.employee_id }).eq("card_id", id).in("status", ["unmatched", "partial"]);
  }
  await audit(db, { entity: "pex_card", entityId: id, action: "edited", actorId: auth.viewer.employeeId, changes });
  return NextResponse.json({ ok: true });
}
