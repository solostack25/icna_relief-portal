import Link from "next/link";
import { createAdminClient } from "@/lib/grantManagement/server";
import { getGmViewer, nameMap, visibleGrantIds } from "@/lib/grantManagement/server";
import { EXPENSE_STATUS_LABELS, fmtDate, lineLabel, money } from "@/lib/grantManagement/shared";
import { Card, Empty, ExpenseStatusPill, ExportButtons, PageTitle } from "@/components/grantManagement/ui";
import { dim, faint, gold, ink, td, tdNum, th, thNum } from "@/components/grantManagement/styles";

export default async function ExpensesPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const viewer = (await getGmViewer())!;
  const admin = createAdminClient();
  const scope = sp.scope === "all" ? "all" : "mine";
  const status = sp.status && sp.status in EXPENSE_STATUS_LABELS ? sp.status : "";
  const ids = await visibleGrantIds(viewer, admin);

  let q = admin
    .from("gm_expenses")
    .select("id, grant_id, line_id, expense_date, vendor, description, amount, status, doc_required, created_by, source, gm_expense_documents(id)")
    .order("expense_date", { ascending: false })
    .limit(300);
  if (scope === "mine") q = q.eq("created_by", viewer.employeeId);
  else if (ids) q = ids.length ? q.in("grant_id", ids) : q.eq("grant_id", "00000000-0000-0000-0000-000000000000");
  if (status) q = q.eq("status", status);
  if (sp.grant) q = q.eq("grant_id", sp.grant);
  const { data } = await q;
  const rows = data ?? [];

  const gids = [...new Set(rows.map((r) => r.grant_id))];
  const lids = [...new Set(rows.map((r) => r.line_id))];
  const [{ data: grants }, { data: lines }] = await Promise.all([
    gids.length ? admin.from("gm_grants").select("id, code, name").in("id", gids) : Promise.resolve({ data: [] }),
    lids.length ? admin.from("gm_budget_lines").select("id, category, subcategory").in("id", lids) : Promise.resolve({ data: [] }),
  ]);
  const g = new Map((grants ?? []).map((x: { id: string; code: string; name: string }) => [x.id, x]));
  const l = new Map((lines ?? []).map((x: { id: string; category: string; subcategory: string | null }) => [x.id, lineLabel(x)]));
  const names = scope === "all" ? await nameMap(admin, rows.map((r) => r.created_by)) : new Map<string, string>();
  const link = (p: Record<string, string>) => `/grant-management/expenses?${new URLSearchParams({ scope, ...(status ? { status } : {}), ...p }).toString()}`;
  const total = rows.reduce((s, r) => s + Number(r.amount), 0);

  return (
    <div>
      <PageTitle eyebrow="Spending entered against grants" title="Expenses" right={scope === "all" ? <ExportButtons query={`report=expenses${status ? `&status=${status}` : ""}${sp.grant ? `&grant_id=${sp.grant}` : ""}`} print={false} /> : undefined} />
      <div className="flex flex-wrap items-center gap-2 mb-4">
        {[
          ["mine", "Entered by me"],
          ["all", viewer.isManager ? "All expenses" : "All on my grants"],
        ].map(([k, label]) => (
          <Link key={k} href={`/grant-management/expenses?scope=${k}`} className="text-sm rounded-full px-4 py-1.5 font-semibold" style={scope === k ? { background: ink, color: "#fff" } : { background: "#fff", border: "1px solid var(--portal-line)", color: dim }}>
            {label}
          </Link>
        ))}
        <span className="mx-1" style={{ color: faint }}>
          |
        </span>
        {["", "draft", "submitted", "returned", "approved", "rejected"].map((s) => (
          <Link key={s} href={link({ status: s })} className="text-xs rounded-full px-3 py-1.5 font-semibold" style={status === s ? { background: "#1F6F54", color: "#fff" } : { background: "#fff", border: "1px solid var(--portal-line)", color: dim }}>
            {s ? EXPENSE_STATUS_LABELS[s as keyof typeof EXPENSE_STATUS_LABELS] : "Any status"}
          </Link>
        ))}
      </div>

      {!rows.length ? (
        <Empty>{scope === "mine" ? "You haven't entered any expenses yet. Tap + Add expense to start." : "No expenses match."}</Empty>
      ) : (
        <Card className="!p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full" style={{ borderCollapse: "separate", borderSpacing: 0 }}>
              <thead>
                <tr>
                  <th style={th}>Date</th>
                  <th style={th}>Vendor / purpose</th>
                  <th style={th}>Grant · category</th>
                  <th style={thNum}>Amount</th>
                  <th style={th}>Docs</th>
                  <th style={th}>Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const docs = r.gm_expense_documents?.length ?? 0;
                  return (
                    <tr key={r.id} className="hover:bg-[#FDFBF6]">
                      <td style={{ ...td, whiteSpace: "nowrap" }}>{fmtDate(r.expense_date)}</td>
                      <td style={td}>
                        <Link href={`/grant-management/expenses/${r.id}`} className="font-semibold hover:underline" style={{ color: ink }}>
                          {r.vendor || r.description}
                        </Link>
                        <div className="text-xs" style={{ color: dim }}>
                          {r.vendor ? r.description : ""}
                          {scope === "all" && names.get(r.created_by) ? ` · ${names.get(r.created_by)}` : ""}
                          {r.source !== "manual" ? ` · ${r.source === "pex" ? "PEX" : "upload"}` : ""}
                        </div>
                      </td>
                      <td style={td}>
                        <div className="text-xs font-bold" style={{ fontFamily: "'IBM Plex Mono', monospace", color: faint }}>
                          {g.get(r.grant_id)?.code}
                        </div>
                        <div className="text-xs">{l.get(r.line_id)}</div>
                      </td>
                      <td style={tdNum}>{money(r.amount, true)}</td>
                      <td style={{ ...td, color: r.doc_required && !docs ? gold : dim }}>{docs ? `📎 ${docs}` : r.doc_required ? "Missing" : "n/a"}</td>
                      <td style={td}>
                        <ExpenseStatusPill status={r.status} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr style={{ background: "#FDFBF6" }}>
                  <td style={{ ...td, fontWeight: 700 }} colSpan={3}>
                    {rows.length} expense{rows.length === 1 ? "" : "s"}
                    {rows.length === 300 ? " (latest 300; use Reports for everything)" : ""}
                  </td>
                  <td style={{ ...tdNum, fontWeight: 700 }}>{money(total, true)}</td>
                  <td style={td} colSpan={2} />
                </tr>
              </tfoot>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
