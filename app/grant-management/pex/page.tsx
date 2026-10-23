import Link from "next/link";
import { createAdminClient } from "@/lib/grantManagement/server";
import { getGmViewer, nameMap } from "@/lib/grantManagement/server";
import { fmtDate, money } from "@/lib/grantManagement/shared";
import { Card, Empty, PageTitle } from "@/components/grantManagement/ui";
import { dim, emerald, faint, ink, td, tdNum, th, thNum } from "@/components/grantManagement/styles";
import PexRowActions from "./PexRowActions";

export default async function PexPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const viewer = (await getGmViewer())!;
  const admin = createAdminClient();
  const status = ["unmatched", "coded", "ignored"].includes(sp.status ?? "") ? sp.status! : "unmatched";
  let q = admin.from("gm_pex_transactions").select("id, transaction_date, card_holder, card_last4, merchant, amount, memo, employee_id, status, expense_id").eq("status", status).order("transaction_date", { ascending: false }).limit(500);
  if (!viewer.isManager) q = q.eq("employee_id", viewer.employeeId);
  const { data } = await q;
  const rows = data ?? [];
  const names = await nameMap(admin, rows.map((r) => r.employee_id));
  const { data: emps } = viewer.isManager ? await admin.from("employees").select("id, first_name, last_name").eq("is_active", true).order("first_name") : { data: [] };
  const employees = (emps ?? []).map((e: { id: string; first_name: string; last_name: string }) => ({ id: e.id, name: `${e.first_name} ${e.last_name}` }));

  return (
    <div>
      <PageTitle eyebrow="Card transactions to code to a grant" title="PEX transactions" />
      <p className="text-sm -mt-3 mb-4 max-w-3xl" style={{ color: dim }}>
        Each PEX transaction needs its receipt and the grant and budget category it belongs to. Tap <b>Code it</b>, snap the receipt, pick the grant and category, and submit.
        {viewer.isManager && (
          <>
            {" "}
            New transactions come in through{" "}
            <Link href="/grant-management/import?kind=pex" className="font-semibold underline" style={{ color: emerald }}>
              Bulk upload → PEX
            </Link>
            .
          </>
        )}
      </p>
      <div className="flex gap-2 mb-4">
        {[
          ["unmatched", "Waiting"],
          ["coded", "Coded"],
          ["ignored", "Not grant expenses"],
        ].map(([k, l]) => (
          <Link key={k} href={`/grant-management/pex?status=${k}`} className="text-sm rounded-full px-4 py-1.5 font-semibold" style={status === k ? { background: ink, color: "#fff" } : { background: "#fff", border: "1px solid var(--portal-line)", color: dim }}>
            {l}
          </Link>
        ))}
      </div>
      {!rows.length ? (
        <Empty>{status === "unmatched" ? "No PEX transactions waiting to be coded." : "Nothing here."}</Empty>
      ) : (
        <Card className="!p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full" style={{ borderCollapse: "separate", borderSpacing: 0 }}>
              <thead>
                <tr>
                  <th style={th}>Date</th>
                  <th style={th}>Merchant</th>
                  <th style={th}>Card holder</th>
                  <th style={thNum}>Amount</th>
                  <th style={th} />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td style={{ ...td, whiteSpace: "nowrap" }}>{fmtDate(r.transaction_date)}</td>
                    <td style={td}>
                      <div className="font-semibold">{r.merchant ?? "—"}</div>
                      {r.memo && (
                        <div className="text-xs" style={{ color: dim }}>
                          {r.memo}
                        </div>
                      )}
                    </td>
                    <td style={td}>
                      {names.get(r.employee_id) ?? <span style={{ color: "#A57420" }}>Unassigned</span>}
                      <div className="text-xs" style={{ color: faint }}>
                        {[r.card_holder, r.card_last4 ? `•••• ${r.card_last4}` : null].filter(Boolean).join(" · ")}
                      </div>
                    </td>
                    <td style={tdNum}>{money(r.amount, true)}</td>
                    <td style={{ ...td, textAlign: "right" }}>
                      {r.status === "coded" && r.expense_id ? (
                        <Link href={`/grant-management/expenses/${r.expense_id}`} className="text-sm font-semibold" style={{ color: emerald }}>
                          View expense →
                        </Link>
                      ) : (
                        <PexRowActions id={r.id} status={r.status} canCode={r.status === "unmatched" && (r.employee_id === viewer.employeeId || viewer.isManager)} isManager={viewer.isManager} employees={employees} />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
