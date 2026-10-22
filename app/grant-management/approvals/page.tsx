import { createAdminClient } from "@/lib/grantManagement/server";
import { getGmViewer, nameMap, visibleGrantIds } from "@/lib/grantManagement/server";
import { lineLabel } from "@/lib/grantManagement/shared";
import { Empty, PageTitle } from "@/components/grantManagement/ui";
import ApprovalsClient from "./ApprovalsClient";

export default async function ApprovalsPage() {
  const viewer = (await getGmViewer())!;
  const admin = createAdminClient();
  const ids = await visibleGrantIds(viewer, admin);
  if (ids && !ids.length) return <Empty>No grants are assigned to you.</Empty>;

  let q = admin
    .from("gm_expenses")
    .select("id, grant_id, line_id, expense_date, vendor, description, amount, doc_required, created_by, submitted_at, gm_expense_documents(id)")
    .eq("status", "submitted")
    .order("submitted_at")
    .limit(500);
  if (ids) q = q.in("grant_id", ids);
  if (!viewer.isManager) q = q.neq("created_by", viewer.employeeId);
  const { data } = await q;
  const rows = data ?? [];

  // Approvers only see grants they can approve on (office approver or grant approver).
  const gids = [...new Set(rows.map((r) => r.grant_id))];
  const lids = [...new Set(rows.map((r) => r.line_id))];
  const [{ data: grants }, { data: lines }, { data: mem }] = await Promise.all([
    gids.length ? admin.from("gm_grants").select("id, code, name, office_id").in("id", gids) : Promise.resolve({ data: [] }),
    lids.length ? admin.from("gm_budget_lines").select("id, category, subcategory").in("id", lids) : Promise.resolve({ data: [] }),
    admin.from("gm_grant_members").select("grant_id, role").eq("employee_id", viewer.employeeId),
  ]);
  const memRole = new Map((mem ?? []).map((m: { grant_id: string; role: string }) => [m.grant_id, m.role]));
  const canApprove = (g: { id: string; office_id: string | null }) =>
    viewer.isManager ||
    ["approver", "grant_manager"].includes(memRole.get(g.id) ?? "") ||
    (viewer.role === "approver" && !!g.office_id && viewer.officeIds.includes(g.office_id));
  const gm = new Map((grants ?? []).map((g: { id: string; code: string; name: string; office_id: string | null }) => [g.id, g]));
  const lm = new Map((lines ?? []).map((l: { id: string; category: string; subcategory: string | null }) => [l.id, lineLabel(l)]));
  const names = await nameMap(admin, rows.map((r) => r.created_by));

  const items = rows
    .filter((r) => gm.get(r.grant_id) && canApprove(gm.get(r.grant_id)!))
    .map((r) => ({
      id: r.id,
      grant: `${gm.get(r.grant_id)!.code} · ${gm.get(r.grant_id)!.name}`,
      grant_id: r.grant_id,
      line: lm.get(r.line_id) ?? "",
      date: r.expense_date,
      vendor: r.vendor,
      description: r.description,
      amount: Number(r.amount),
      docs: r.gm_expense_documents?.length ?? 0,
      doc_required: r.doc_required,
      by: names.get(r.created_by) ?? "",
      own: r.created_by === viewer.employeeId,
      submitted_at: r.submitted_at,
    }));

  return (
    <div>
      <PageTitle eyebrow="Submitted expenses waiting on you" title="Approvals" />
      {items.length ? <ApprovalsClient items={items} /> : <Empty>Nothing waiting for approval. 🎉</Empty>}
    </div>
  );
}
