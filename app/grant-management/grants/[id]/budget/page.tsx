import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/grantManagement/server";
import { getGmViewer, grantAccess, loadLineSummaries } from "@/lib/grantManagement/server";
import { getVersions } from "@/lib/grantManagement/budget";
import { loadLibrary } from "@/lib/grantManagement/library";
import BudgetPageClient from "./BudgetPageClient";

export default async function BudgetPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const viewer = (await getGmViewer())!;
  const admin = createAdminClient();
  if (!(await grantAccess(viewer, id, admin)).canManage) notFound();
  const [{ data: grant }, versions, lines, library] = await Promise.all([
    admin.from("gm_grants").select("id, name, code, award_amount, status").eq("id", id).single(),
    getVersions(admin, id),
    loadLineSummaries([id], admin),
    loadLibrary(),
  ]);
  if (!grant) notFound();
  const draft = versions.find((v) => v.status === "draft");
  const active = versions.find((v) => v.status === "active");
  const source = draft ?? active;
  const amounts = new Map((source?.gm_budget_amounts ?? []).map((a) => [a.line_id, Number(a.amount)]));
  const initial = lines
    .filter((l) => amounts.has(l.line_id))
    .map((l) => ({ key: l.line_id, line_id: l.line_id, category: l.category, subcategory: l.subcategory, amount: String(amounts.get(l.line_id) ?? ""), actual: l.actual }));

  return (
    <BudgetPageClient
      grant={{ id, name: grant.name, code: grant.code, award: Number(grant.award_amount), closed: grant.status === "closed" }}
      library={library}
      initial={initial}
      mode={draft ? (active ? "amend_draft" : "original_draft") : active ? "amend_new" : "original_new"}
      draftMeta={draft ? { reason: draft.reason ?? "", funder_approved_date: draft.funder_approved_date ?? "", effective_date: draft.effective_date ?? "", version_no: draft.version_no } : null}
      activeVersion={active?.version_no ?? null}
    />
  );
}
