import Link from "next/link";
import { nameMap } from "@/lib/grantManagement/server";
import { fmtDate, money } from "@/lib/grantManagement/shared";
import { getPexViewer, pexAdmin } from "@/lib/pex/access";
import { monthStart } from "@/lib/pex/categories";
import { Card, Eyebrow, Notice, PageTitle, Row, Stat } from "@/components/grantManagement/ui";
import { dim, emerald, faint, ink, sky } from "@/components/grantManagement/styles";
import { ago, CardStatusPill, holderName } from "@/components/grantManagement/pex/pexUi";
import PexGrantSwitch from "@/components/grantManagement/pex/PexGrantSwitch";
import PexCardEdit from "@/components/grantManagement/pex/PexCardEdit";
import PexTxTable, { type PexCardRow, type PexTxRow } from "@/components/grantManagement/pex/PexTxTable";

export default async function PexCardPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const viewer = (await getPexViewer())!;
  const db = pexAdmin();
  const { data: card } = await db.from("pex_cards").select("*").eq("id", id).maybeSingle();
  if (!card || (!viewer.isAdmin && card.employee_id !== viewer.employeeId)) return <Notice tone="warn">Card not found.</Notice>;

  const today = new Date().toISOString().slice(0, 10);
  const [{ data: links }, { data: txs }, { data: month }, { data: offices }, { data: emps }] = await Promise.all([
    db.from("gm_pex_card_grants").select("id, start_date, end_date, is_default, grant:grant_id(id, code, name)").eq("card_id", id).order("start_date", { ascending: false }),
    db.from("gm_pex_transactions").select("id, transaction_date, merchant, mcc, amount, is_pending, card_id, employee_id, status").eq("card_id", id).order("transaction_date", { ascending: false }).limit(60),
    db.from("gm_pex_transactions").select("amount").eq("card_id", id).eq("is_pending", false).gte("transaction_date", monthStart()),
    db.from("b2s_offices").select("id, field_office").eq("is_active", true).order("field_office"),
    viewer.isAdmin ? db.from("employees").select("id, first_name, last_name").eq("is_active", true).order("first_name") : Promise.resolve({ data: [] }),
  ]);
  const names = await nameMap(db as never, [card.employee_id]);
  const office = (offices ?? []).find((o) => o.id === card.office_id)?.field_office;
  const spent = (month ?? []).reduce((s, t) => s + Number(t.amount), 0);
  const current = (links ?? []).filter((l) => !l.end_date || l.end_date >= today);
  const past = (links ?? []).filter((l) => l.end_date && l.end_date < today);
  const canEditGrants = viewer.isAdmin || viewer.isGrantManager;

  return (
    <div className="max-w-6xl">
      <Link href={viewer.isAdmin ? "/pex/cards" : "/pex"} className="text-xs" style={{ color: faint }}>
        ← {viewer.isAdmin ? "Cards" : "My card"}
      </Link>
      <PageTitle eyebrow={`PEX card •••• ${card.last4 ?? "????"}`} title={names.get(card.employee_id ?? "") ?? holderName(card)} right={<CardStatusPill status={card.card_status} />} />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <Stat label="Available" value={card.available_balance != null ? money(Number(card.available_balance), true) : "—"} sub={card.synced_at ? `as of ${ago(card.synced_at)}` : "not synced from PEX"} />
        <Stat label="Spent this month" value={money(spent)} />
        <Stat label="Office" value={<span style={{ fontSize: 16 }}>{office ?? "—"}</span>} />
        <Stat label="Type" value={<span style={{ fontSize: 16 }}>{card.is_virtual ? "Virtual" : "Physical"}</span>} sub={card.pex_account_id ? `PEX account ${card.pex_account_id}` : "added by hand"} />
      </div>

      <div className="grid lg:grid-cols-[1fr_1.5fr] gap-5 items-start">
        <div className="space-y-5">
          <Card>
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-sm font-bold" style={{ color: ink }}>
                  Grant spending
                </div>
                <p className="text-xs mt-1" style={{ color: dim }}>
                  When on, this card&apos;s transactions go to Grant Management to be coded to a grant.
                </p>
              </div>
              <PexGrantSwitch cardId={card.id} on={card.grant_eligible} canEdit={canEditGrants} compact />
            </div>
            {card.grant_eligible && (
              <div className="mt-4 pt-3" style={{ borderTop: "1px dashed var(--portal-line)" }}>
                <Eyebrow color={sky}>Grants this card spends on</Eyebrow>
                {current.length ? (
                  current.map((l) => {
                    const g = l.grant as unknown as { id: string; code: string; name: string };
                    return (
                      <div key={l.id} className="text-sm py-1" style={{ color: ink }}>
                        <b>{g.code}</b> · {g.name}
                        <div className="text-xs" style={{ color: dim }}>
                          {fmtDate(l.start_date)} → {l.end_date ? fmtDate(l.end_date) : "ongoing"}
                          {l.is_default ? " · default" : ""}
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <p className="text-sm" style={{ color: "#A57420" }}>
                    No grant picked yet. Grant Management chooses which grant(s) this card spends on.
                  </p>
                )}
                {past.length > 0 && (
                  <p className="text-xs mt-1" style={{ color: faint }}>
                    + {past.length} earlier grant link{past.length === 1 ? "" : "s"}
                  </p>
                )}
                {viewer.isGrantManager && (
                  <Link href={`/grant-management/pex/cards/${card.id}`} className="inline-block text-xs font-semibold mt-2" style={{ color: emerald }}>
                    Pick grants & dates in Grant Management →
                  </Link>
                )}
              </div>
            )}
          </Card>

          {viewer.isAdmin ? (
            <PexCardEdit
              cardId={card.id}
              initial={{ employee_id: card.employee_id, office_id: card.office_id, notes: card.notes }}
              employees={(emps ?? []).map((e) => ({ id: e.id, name: `${e.first_name} ${e.last_name}` }))}
              offices={(offices ?? []).map((o) => ({ id: o.id, name: o.field_office }))}
            />
          ) : (
            <Card>
              <Row k="Card holder" v={names.get(card.employee_id ?? "") ?? holderName(card)} />
              {card.notes && <Row k="Notes" v={card.notes} />}
            </Card>
          )}
          <p className="text-xs" style={{ color: faint }}>
            Funding, freezing and closing cards happen in the PEX dashboard. The portal only reads card data.
          </p>
        </div>
        <div>
          <Eyebrow>Recent transactions</Eyebrow>
          <PexTxTable rows={(txs ?? []) as PexTxRow[]} cardById={new Map([[card.id, card as PexCardRow]])} names={names} officeName={new Map()} showHolder={false} />
          <Link href={`/pex/transactions?card=${card.id}`} className="inline-block text-sm font-semibold mt-3" style={{ color: emerald }}>
            All of this card&apos;s transactions →
          </Link>
        </div>
      </div>
    </div>
  );
}
