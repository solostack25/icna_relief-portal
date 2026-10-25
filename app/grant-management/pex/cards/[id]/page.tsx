import Link from "next/link";
import { createAdminClient, getGmViewer, nameMap } from "@/lib/grantManagement/server";
import { fmtDate, money } from "@/lib/grantManagement/shared";
import { Card, Empty, Notice, PageTitle, Row, Stat } from "@/components/grantManagement/ui";
import { dim, emerald, faint, ink, td, tdNum, th, thNum } from "@/components/grantManagement/styles";
import { ago, CardStatusPill, holderName, PexStatusPill } from "@/components/grantManagement/pex/pexUi";
import PexCardManager, { type GrantOption, type LinkRow } from "@/components/grantManagement/pex/PexCardManager";

export default async function PexCardPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { id } = await params;
  const sp = await searchParams;
  const viewer = (await getGmViewer())!;
  if (!viewer.isManager) return <Notice tone="warn">Only Grant Management can manage PEX cards.</Notice>;
  const admin = createAdminClient();
  const { data: card } = await admin.from("pex_cards").select("*").eq("id", id).maybeSingle();
  if (!card) return <Notice tone="warn">Card not found.</Notice>;

  const [{ data: links }, { data: grants }, { data: lines }, { data: emps }, { data: txs }] = await Promise.all([
    admin.from("gm_pex_card_grants").select("id, grant_id, start_date, end_date, is_default, default_line_id, grant:grant_id(code, name, start_date, end_date)").eq("card_id", id).order("start_date", { ascending: false }),
    admin.from("gm_grants").select("id, code, name, start_date, end_date, status").neq("status", "closed").order("code"),
    admin.from("gm_budget_lines").select("id, grant_id, category, subcategory, sort_order").eq("is_active", true).order("sort_order"),
    admin.from("employees").select("id, first_name, last_name").eq("is_active", true).order("first_name"),
    admin.from("gm_pex_transactions").select("id, transaction_date, merchant, amount, status, is_pending, allocated_amount, non_grant_amount").eq("card_id", id).eq("in_grant_scope", true).order("transaction_date", { ascending: false }).limit(40),
  ]);
  const grantOptions: GrantOption[] = (grants ?? []).map((g) => ({ ...g, lines: (lines ?? []).filter((l) => l.grant_id === g.id) }));
  const linkRows: LinkRow[] = (links ?? []).map((l) => {
    const g = l.grant as unknown as { code: string; name: string; start_date: string; end_date: string };
    return { id: l.id, grant_id: l.grant_id, code: g.code, name: g.name, start_date: l.start_date, end_date: l.end_date, is_default: l.is_default, default_line_id: l.default_line_id, grant_start: g.start_date, grant_end: g.end_date };
  });
  // A closed grant that's still linked should stay visible in the picker list.
  for (const l of linkRows) if (!grantOptions.some((g) => g.id === l.grant_id)) grantOptions.push({ id: l.grant_id, code: l.code, name: l.name, start_date: l.grant_start, end_date: l.grant_end, status: "closed", lines: [] });
  const names = await nameMap(admin, [card.employee_id]);
  const rows = txs ?? [];
  const toCode = rows.filter((t) => ["unmatched", "partial"].includes(t.status) && !t.is_pending).length;

  return (
    <div className="max-w-6xl">
      <Link href="/grant-management/pex?tab=cards" className="text-xs" style={{ color: faint }}>
        ← PEX cards
      </Link>
      <PageTitle eyebrow={`PEX card •••• ${card.last4 ?? "????"}`} title={holderName(card)} right={<CardStatusPill status={card.card_status} />} />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <Stat label="Available" value={card.available_balance != null ? money(Number(card.available_balance), true) : "—"} sub={card.synced_at ? `as of ${ago(card.synced_at)}` : "not synced from PEX"} />
        <Stat label="Portal employee" value={<span style={{ fontSize: 16 }}>{names.get(card.employee_id) ?? "Not linked"}</span>} />
        <Stat label="Grant links" value={linkRows.filter((l) => !l.end_date || l.end_date >= new Date().toISOString().slice(0, 10)).length} sub="active now" />
        <Stat label="To code" value={toCode} href={`/grant-management/pex?status=waiting&card=${id}`} />
      </div>

      <div className="grid lg:grid-cols-[1.3fr_1fr] gap-5 items-start">
        <PexCardManager
          cardId={id}
          employeeId={card.employee_id}
          employees={(emps ?? []).map((e) => ({ id: e.id, name: `${e.first_name} ${e.last_name}` }))}
          links={linkRows}
          grants={grantOptions}
          presetGrantId={sp.grant}
        />
        <div className="space-y-5">
          <Card>
            <Row k="PEX account" v={card.pex_account_id ?? "Not synced (added by hand)"} />
            <Row k="Email at PEX" v={card.email ?? "—"} />
            <Row k="Type" v={card.is_virtual ? "Virtual" : "Physical"} />
            {Array.isArray(card.user_groups) && card.user_groups.length > 0 && <Row k="PEX groups" v={(card.user_groups as { Name?: string }[]).map((g) => g.Name).filter(Boolean).join(", ")} />}
          </Card>
          <Card className="!p-0 overflow-hidden">
            <div className="px-5 pt-4 pb-2 text-sm font-bold" style={{ color: ink }}>
              Transactions during its grant assignments
            </div>
            {!rows.length ? (
              <div className="p-4">
                <Empty>No transactions on this card during its grant assignment dates yet.</Empty>
              </div>
            ) : (
              <table className="w-full" style={{ borderCollapse: "separate", borderSpacing: 0 }}>
                <thead>
                  <tr>
                    <th style={th}>Date</th>
                    <th style={th}>Merchant</th>
                    <th style={thNum}>Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((t) => (
                    <tr key={t.id}>
                      <td style={{ ...td, whiteSpace: "nowrap" }}>{fmtDate(t.transaction_date)}</td>
                      <td style={td}>
                        <Link href={`/grant-management/pex/${t.id}`} className="hover:underline" style={{ color: ink }}>
                          {t.merchant ?? "—"}
                        </Link>
                        <div className="mt-1">
                          <PexStatusPill status={t.status} pending={t.is_pending} />
                        </div>
                      </td>
                      <td style={tdNum}>{money(Number(t.amount), true)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>
          <p className="text-xs" style={{ color: dim }}>
            Funding, freezing and closing cards stay in the PEX dashboard.{" "}
            <span style={{ color: emerald }}>The portal only reads card data.</span>
          </p>
        </div>
      </div>
    </div>
  );
}
