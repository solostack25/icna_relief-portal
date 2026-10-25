import Link from "next/link";
import { fmtDate, money } from "@/lib/grantManagement/shared";
import { spendGroup } from "@/lib/pex/categories";
import { Card, Empty } from "@/components/grantManagement/ui";
import { emerald, faint, gold, ink, td, tdNum, th, thNum } from "@/components/grantManagement/styles";
import { holderName, PexStatusPill } from "./pexUi";

// Card transactions table for the PEX app. Grant-card rows show their
// Grant Management coding status and link there.
export type PexTxRow = {
  id: string;
  transaction_date: string;
  merchant: string | null;
  mcc: string | null;
  amount: number;
  is_pending: boolean;
  card_id: string | null;
  employee_id: string | null;
  status: string;
  in_grant_scope?: boolean;
};
export type PexCardRow = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  last4: string | null;
  card_status: string | null;
  available_balance: number | null;
  employee_id: string | null;
  office_id: string | null;
  grant_eligible: boolean;
  is_virtual: boolean;
};


export default function PexTxTable({
  rows,
  cardById,
  names,
  officeName,
  showHolder = true,
}: {
  rows: PexTxRow[];
  cardById: Map<string, PexCardRow>;
  names: Map<string, string>;
  officeName: Map<string, string>;
  showHolder?: boolean;
}) {
  if (!rows.length) return <Empty>No transactions yet.</Empty>;
  return (
    <Card className="!p-0 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full" style={{ borderCollapse: "separate", borderSpacing: 0 }}>
          <thead>
            <tr>
              <th style={th}>Date</th>
              <th style={th}>Merchant</th>
              {showHolder && <th style={th}>Card holder</th>}
              <th style={th}>Grant</th>
              <th style={thNum}>Amount</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((t) => {
              const c = t.card_id ? cardById.get(t.card_id) : undefined;
              // In Grant Management only if the card was assigned to a grant that day.
              const grant = !!t.in_grant_scope;
              return (
                <tr key={t.id}>
                  <td style={{ ...td, whiteSpace: "nowrap" }}>
                    {fmtDate(t.transaction_date)}
                    {t.is_pending && (
                      <div className="text-[11px] font-semibold" style={{ color: gold }}>
                        Pending
                      </div>
                    )}
                  </td>
                  <td style={td}>
                    <div className="font-semibold">{t.merchant ?? "—"}</div>
                    <div className="text-xs" style={{ color: faint }}>
                      {spendGroup(t.mcc)}
                    </div>
                  </td>
                  {showHolder && (
                    <td style={td}>
                      {c ? (
                        <Link href={`/pex/cards/${c.id}`} className="hover:underline" style={{ color: ink }}>
                          {names.get(c.employee_id ?? "") ?? holderName(c)}
                        </Link>
                      ) : (
                        "—"
                      )}
                      <div className="text-xs" style={{ color: faint }}>
                        {[c?.last4 ? `•••• ${c.last4}` : null, officeName.get(c?.office_id ?? "")].filter(Boolean).join(" · ")}
                      </div>
                    </td>
                  )}
                  <td style={td}>
                    {grant ? (
                      <Link href={`/grant-management/pex/${t.id}`} title="Open in Grant Management">
                        <PexStatusPill status={t.status} pending={t.is_pending} />
                      </Link>
                    ) : (
                      <span className="text-xs" style={{ color: faint }}>
                        —
                      </span>
                    )}
                  </td>
                  <td style={{ ...tdNum, color: Number(t.amount) < 0 ? emerald : ink }}>{money(Number(t.amount), true)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

