import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/grantManagement/server";
import { requireViewer, fail, readJson } from "@/lib/grantManagement/api";
import { cleanBudgetLines } from "@/lib/grantManagement/grantInput";
import { grantAccess } from "@/lib/grantManagement/server";
import { activateDraft, discardDraft, saveDraft } from "@/lib/grantManagement/budget";

// action: save (draft) | activate (approve the draft) | discard
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireViewer();
  if ("res" in auth) return auth.res;
  const { viewer } = auth;
  const admin = createAdminClient();
  if (!(await grantAccess(viewer, id, admin)).canManage) return fail("Only Grant Management can change budgets.", 403);
  const { data: grant } = await admin.from("gm_grants").select("status").eq("id", id).maybeSingle();
  if (!grant) return fail("Grant not found.", 404);
  if (grant.status === "closed") return fail("This grant is closed. Reopen it to amend the budget.");

  const body = await readJson(req);
  const action = String(body.action ?? "save");
  const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);

  if (action === "discard") {
    await discardDraft(admin, id, viewer.employeeId);
    return NextResponse.json({ ok: true });
  }

  if (action === "save" || action === "save_activate") {
    const { lines, error } = cleanBudgetLines(body.lines);
    if (!lines) return fail(error ?? "Invalid budget.");
    if (!lines.length) return fail("Add at least one budget line.");
    const r = await saveDraft(admin, id, lines, { reason: str(body.reason), effective_date: str(body.effective_date), funder_approved_date: str(body.funder_approved_date) }, viewer.employeeId);
    if (r.error) return fail(r.error);
    if (action === "save") return NextResponse.json({ ok: true, versionId: r.versionId });
  }

  if (action === "activate" || action === "save_activate") {
    const r = await activateDraft(admin, id, viewer.employeeId);
    if (r.error) return fail(r.error);
    return NextResponse.json({ ok: true, activated: true });
  }

  return fail("Unknown action.");
}
