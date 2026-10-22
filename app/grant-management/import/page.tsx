import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/grantManagement/server";
import { getGmViewer, nameMap } from "@/lib/grantManagement/server";
import { EXPENSE_TEMPLATE, PEX_TEMPLATE } from "@/lib/grantManagement/importRows";
import { PageTitle } from "@/components/grantManagement/ui";
import ImportClient from "./ImportClient";

export default async function ImportPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const viewer = (await getGmViewer())!;
  if (!viewer.isManager) redirect("/grant-management");
  const admin = createAdminClient();
  const [{ data: grants }, { data: batches }] = await Promise.all([
    admin.from("gm_grants").select("id, code, name, start_date, end_date, gm_budget_lines(category, subcategory, is_active, sort_order)").eq("status", "active").order("code"),
    admin.from("gm_import_batches").select("id, kind, file_name, row_count, total, status, created_by, created_at").order("created_at", { ascending: false }).limit(25),
  ]);
  const names = await nameMap(admin, (batches ?? []).map((b) => b.created_by));
  const reference = (grants ?? []).flatMap((g) =>
    (g.gm_budget_lines ?? [])
      .filter((l: { is_active: boolean }) => l.is_active)
      .sort((a: { sort_order: number }, b: { sort_order: number }) => a.sort_order - b.sort_order)
      .map((l: { category: string; subcategory: string | null }) => ({ code: g.code, grant: g.name, category: l.category, subcategory: l.subcategory ?? "", start: g.start_date, end: g.end_date }))
  );

  return (
    <div>
      <PageTitle eyebrow="Payroll, fringe, allocations, indirect and PEX" title="Bulk upload" />
      <ImportClient
        initialKind={sp.kind === "pex" ? "pex" : "expenses"}
        expenseTemplate={EXPENSE_TEMPLATE}
        pexTemplate={PEX_TEMPLATE}
        reference={reference}
        batches={(batches ?? []).map((b) => ({ ...b, total: Number(b.total), by: names.get(b.created_by) ?? "" }))}
      />
    </div>
  );
}
