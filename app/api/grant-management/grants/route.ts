import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/grantManagement/server";
import { requireViewer, fail, readJson } from "@/lib/grantManagement/api";
import { cleanGrantInput, cleanBudgetLines } from "@/lib/grantManagement/grantInput";
import { audit, ensureAppAccess } from "@/lib/grantManagement/server";
import { saveDraft } from "@/lib/grantManagement/budget";

// Create a grant (Grant Management only). Optionally seeds the original
// budget as a draft so it can be reviewed and approved on the next screen.
export async function POST(req: Request) {
  const auth = await requireViewer({ manager: true });
  if ("res" in auth) return auth.res;
  const { viewer } = auth;
  const body = await readJson(req);
  const { input, errors } = cleanGrantInput({ ...body, status: "draft" });
  if (!input) return fail("Please fix the highlighted fields.", 400, errors);

  const admin = createAdminClient();
  const { data: dup } = await admin.from("gm_grants").select("id").ilike("code", input.code).maybeSingle();
  if (dup) return fail("That grant code is already used.", 400, { code: "That grant code is already used." });

  if (input.office_id && (!input.region || !input.state)) {
    const { data: office } = await admin.from("b2s_offices").select("region, state").eq("id", input.office_id).maybeSingle();
    input.region = input.region ?? office?.region ?? null;
    input.state = input.state ?? office?.state ?? null;
  }

  const { data: grant, error } = await admin
    .from("gm_grants")
    .insert({ ...input, created_by: viewer.employeeId })
    .select("id")
    .single();
  if (error || !grant) return fail(error?.message ?? "Couldn't create the grant.", 500);

  await audit(admin, { entity: "grant", entityId: grant.id, grantId: grant.id, action: "created", actorId: viewer.employeeId, changes: input });

  if (body.lines) {
    const { lines, error: lineErr } = cleanBudgetLines(body.lines);
    if (lines && lines.length) {
      const r = await saveDraft(admin, grant.id, lines, {}, viewer.employeeId);
      if (r.error) return NextResponse.json({ id: grant.id, warning: `Grant created, but the budget didn't save: ${r.error}` });
    } else if (lineErr) {
      return NextResponse.json({ id: grant.id, warning: `Grant created, but the budget didn't save: ${lineErr}` });
    }
  }

  // Members picked on the create form
  const members = Array.isArray(body.members) ? (body.members as { employee_id: string; role: string }[]) : [];
  const valid = members.filter((m) => typeof m.employee_id === "string" && ["grant_manager", "approver", "office_user", "viewer"].includes(m.role));
  if (valid.length) {
    await admin.from("gm_grant_members").insert(valid.map((m) => ({ grant_id: grant.id, employee_id: m.employee_id, role: m.role, added_by: viewer.employeeId })));
    await ensureAppAccess(admin, valid.map((m) => m.employee_id));
  }

  return NextResponse.json({ id: grant.id });
}

