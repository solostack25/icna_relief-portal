import { NextResponse } from "next/server";
import { audit, createAdminClient } from "@/lib/grantManagement/server";
import { requireViewer, fail, readJson } from "@/lib/grantManagement/api";
import { linkUploadedToCards } from "@/lib/pex/sync";

// Add a card by hand (before PEX is connected, or for a card only seen
// in CSV exports). API-synced cards appear on their own.
export async function POST(req: Request) {
  const auth = await requireViewer({ manager: true });
  if ("res" in auth) return auth.res;
  const body = await readJson(req);
  const last4 = String(body.last4 ?? "").replace(/\D/g, "");
  if (last4.length !== 4) return fail("Enter the card's last 4 digits.", 400, { last4: "4 digits." });
  const employeeId = typeof body.employee_id === "string" && body.employee_id ? body.employee_id : null;
  const db = createAdminClient();
  let first: string | null = null;
  let last: string | null = null;
  let office: string | null = null;
  if (employeeId) {
    const { data: e } = await db.from("employees").select("first_name, last_name, assigned_office_id").eq("id", employeeId).maybeSingle();
    if (!e) return fail("Employee not found.", 404);
    first = e.first_name;
    last = e.last_name;
    office = e.assigned_office_id ?? null;
  }
  const { data, error } = await db
    .from("pex_cards")
    .insert({ last4, employee_id: employeeId, first_name: first, last_name: last, office_id: office, grant_eligible: !!body.grant_eligible, card_status: "ACTIVE" })
    .select("id")
    .single();
  if (error || !data) return fail(error?.message ?? "Couldn't add the card.", 500);
  await audit(db, { entity: "pex_card", entityId: data.id, action: "created", actorId: auth.viewer.employeeId, changes: { last4, employee_id: employeeId } });
  await linkUploadedToCards(db);
  return NextResponse.json({ id: data.id });
}
