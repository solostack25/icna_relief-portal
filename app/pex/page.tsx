import Link from "next/link";
import { fetchAll, nameMap } from "@/lib/grantManagement/server";
import { money } from "@/lib/grantManagement/shared";
import { getPexViewer, pexAdmin } from "@/lib/pex/access";
import { monthStart, spendGroup } from "@/lib/pex/categories";
import { Card, Eyebrow, PageTitle, Stat } from "@/components/grantManagement/ui";
import { dim, emerald, faint, gold, ink, rose, sky } from "@/components/grantManagement/styles";
import { ago, CardStatusPill, holderName } from "@/components/grantManagement/pex/pexUi";
import PexTxTable, { type PexCardRow as CardRow, type PexTxRow as Tx } from "@/components/grantManagement/pex/PexTxTable";

const TX_COLS = "id, transaction_date, merchant, mcc, amount, is_pending, card_id, employee_id, status";

export default async function PexDashboard() {
  const viewer = (await getPexViewer())!;
  return viewer.isAdmin ? <OrgDashboard /> : <MyCard employeeId={viewer.employeeId} />;
}

// ---------- Finance / PEX admin ----------
async function OrgDashboard() {
  const db = pexAdmin();
  const today = new Date();
  const thisMonth = monthStart(today);
  const lastMonth = monthStart(new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 1, 15)));

  const [{ data: cards }, { data: offices }, { data: lastRun }, monthTx, lastMonthTx, { data: recent }] = await Promise.all([
    db.from("pex_cards").select("id, first_name, last_name, last4, card_status, available_balance, employee_id, office_id, grant_eligible, is_virtual"),
    db.from("b2s_offices").select("id, field_office"),
    db.from("pex_sync_runs").select("started_at, finished_at, ok, error, stats").order("started_at", { ascending: false }).limit(1).maybeSingle(),
    fetchAll<Tx>((f, t) => db.from("gm_pex_transactions").select(TX_COLS).gte("transaction_date", thisMonth).range(f, t)),
    fetchAll<{ amount: number; is_pending: boolean }>((f, t) => db.from("gm_pex_transactions").select("amount, is_pending").gte("transaction_date", lastMonth).lt("transaction_date", thisMonth).range(f, t)),
    db.from("gm_pex_transactions").select(TX_COLS).order("transaction_date", { ascending: false }).order("transaction_time", { ascending: false }).limit(12),
  ]);
  const cardList = (cards ?? []) as CardRow[];
  const cardById = new Map(cardList.map((c) => [c.id, c]));
  const officeName = new Map((offices ?? []).map((o) => [o.id, o.field_office as string]));

  const settled = monthTx.filter((t) => !t.is_pending);
  const spent = settled.reduce((s, t) => s + Number(t.amount), 0);
  const spentLast = lastMonthTx.filter((t) => !t.is_pending).reduce((s, t) => s + Number(t.amount), 0);
  const pending = monthTx.filter((t) => t.is_pending);
  const grantCards = cardList.filter((c) => c.grant_eligible);
  const grantSpend = settled.filter((t) => t.card_id && cardById.get(t.card_id)?.grant_eligible).reduce((s, t) => s + Number(t.amount), 0);
  const active = cardList.filter((c) => (c.card_status ?? "").toUpperCase() === "ACTIVE");
  const balance = (lastRun?.stats as { balance?: number | null } | null)?.balance ?? null;
  const onCards = cardList.reduce((s, c) => s + Number(c.available_balance ?? 0), 0);

  // Breakdowns for this month.
  const sumBy = (key: (t: Tx) => string) => {
    const m = new Map<string, number>();
    for (const t of settled) m.set(key(t), (m.get(key(t)) ?? 0) + Number(t.amount));
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  };
  const byOffice = sumBy((t) => officeName.get(cardById.get(t.card_id ?? "")?.office_id ?? "") ?? "No office");
  const byGroup = sumBy((t) => spendGroup(t.mcc));
  const byCard = sumBy((t) => t.card_id ?? "unknown").slice(0, 6);
  const names = await nameMap(db as never, [...cardList.map((c) => c.employee_id), ...(recent ?? []).map((r) => r.employee_id)]);

  return (
    <div>
      <PageTitle
        eyebrow="PEX · all cards"
        title="Card spending"
        right={
          <div className="text-xs text-right" style={{ color: dim }}>
            {lastRun ? (
              <>
                Synced {ago(lastRun.finished_at ?? lastRun.started_at)} <span style={{ color: lastRun.ok ? emerald : rose, fontWeight: 600 }}>{lastRun.ok ? "✓" : "failed"}</span>
              </>
            ) : (
              <Link href="/pex/connection" className="font-semibold underline" style={{ color: emerald }}>
                Connect PEX or try demo data
              </Link>
            )}
          </div>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-6 gap-3 mb-8">
        <Stat label="PEX balance" value={balance != null ? money(balance) : "—"} sub={`${money(onCards)} loaded on cards`} />
        <Stat label="Spent this month" value={money(spent)} sub={spentLast ? `${money(spentLast)} last month` : undefined} />
        <Stat label="Pending holds" value={pending.length} sub={money(pending.reduce((s, t) => s + Number(t.amount), 0))} href="/pex/transactions?pending=1" />
        <Stat label="Active cards" value={active.length} sub={`${cardList.length} total`} href="/pex/cards" />
        <Stat label="Used for grants" value={grantCards.length} sub={`${money(grantSpend)} this month`} tone={sky} href="/pex/cards?use=grant" />
        <Stat label="Transactions" value={settled.length} sub="this month" href="/pex/transactions" />
      </div>

      <div className="grid lg:grid-cols-3 gap-5 mb-8">
        <Breakdown title="By office · this month" rows={byOffice} total={spent} />
        <Breakdown title="By type of spending" rows={byGroup} total={spent} />
        <Breakdown
          title="Top cardholders"
          rows={byCard.map(([id, v]) => {
            const c = cardById.get(id);
            return [c ? `${names.get(c.employee_id ?? "") ?? holderName(c)} · ${c.last4 ?? ""}` : "Unknown card", v] as [string, number];
          })}
          total={spent}
          hrefFor={(i) => (byCard[i][0] !== "unknown" ? `/pex/cards/${byCard[i][0]}` : undefined)}
        />
      </div>

      <Eyebrow>Latest transactions</Eyebrow>
      <PexTxTable rows={(recent ?? []) as Tx[]} cardById={cardById} names={names} officeName={officeName} />
      <div className="mt-3">
        <Link href="/pex/transactions" className="text-sm font-semibold" style={{ color: emerald }}>
          All transactions →
        </Link>
      </div>
    </div>
  );
}

function Breakdown({ title, rows, total, hrefFor }: { title: string; rows: [string, number][]; total: number; hrefFor?: (i: number) => string | undefined }) {
  return (
    <Card>
      <div className="text-sm font-bold mb-3" style={{ color: ink }}>
        {title}
      </div>
      {!rows.length ? (
        <p className="text-sm" style={{ color: faint }}>
          No spending yet this month.
        </p>
      ) : (
        <div className="space-y-2.5">
          {rows.slice(0, 7).map(([label, v], i) => {
            const pct = total > 0 ? Math.max(0, (v / total) * 100) : 0;
            const href = hrefFor?.(i);
            const inner = (
              <>
                <div className="flex justify-between text-xs mb-1">
                  <span className="truncate pr-2" style={{ color: ink }}>
                    {label}
                  </span>
                  <span style={{ fontFamily: "'IBM Plex Mono', monospace", color: dim }}>{money(v)}</span>
                </div>
                <div className="h-1.5 rounded-full" style={{ background: "rgba(22,48,43,0.07)" }}>
                  <div className="h-1.5 rounded-full" style={{ width: `${pct}%`, background: label.startsWith("Restricted") ? rose : emerald }} />
                </div>
              </>
            );
            return href ? (
              <Link key={label} href={href} className="block hover:opacity-80">
                {inner}
              </Link>
            ) : (
              <div key={label}>{inner}</div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

// ---------- cardholder ----------
async function MyCard({ employeeId }: { employeeId: string }) {
  const db = pexAdmin();
  const { data: cards } = await db.from("pex_cards").select("id, first_name, last_name, last4, card_status, available_balance, employee_id, office_id, grant_eligible, is_virtual, synced_at").eq("employee_id", employeeId);
  const mine = (cards ?? []) as (CardRow & { synced_at: string | null })[];
  const ids = mine.map((c) => c.id);
  const thisMonth = monthStart();
  const [{ data: monthTx }, { data: recent }, { count: toCode }] = await Promise.all([
    db.from("gm_pex_transactions").select("amount, is_pending").in("card_id", ids).gte("transaction_date", thisMonth),
    db.from("gm_pex_transactions").select(TX_COLS).in("card_id", ids).order("transaction_date", { ascending: false }).limit(15),
    db
      .from("gm_pex_transactions")
      .select("id", { count: "exact", head: true })
      .in("card_id", mine.filter((c) => c.grant_eligible).map((c) => c.id).concat(["00000000-0000-0000-0000-000000000000"]))
      .in("status", ["unmatched", "partial"])
      .eq("is_pending", false),
  ]);
  const spent = (monthTx ?? []).filter((t) => !t.is_pending).reduce((s, t) => s + Number(t.amount), 0);
  const cardById = new Map(mine.map((c) => [c.id, c]));

  return (
    <div>
      <PageTitle eyebrow="PEX" title={mine.length > 1 ? "Your cards" : "Your card"} />
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        {mine.map((c) => (
          <Card key={c.id} className="!p-4">
            <div className="flex justify-between items-start">
              <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 15, color: ink }}>•••• {c.last4 ?? "????"}</div>
              <CardStatusPill status={c.card_status} />
            </div>
            <div className="mt-3" style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 24, fontWeight: 600, color: ink }}>
              {c.available_balance != null ? money(Number(c.available_balance), true) : "—"}
            </div>
            <div className="text-xs" style={{ color: dim }}>
              available{c.synced_at ? ` · as of ${ago(c.synced_at)}` : ""}
            </div>
            {c.grant_eligible && (
              <div className="text-xs mt-2 font-semibold" style={{ color: sky }}>
                Used for grant spending
              </div>
            )}
          </Card>
        ))}
        <Stat label="Spent this month" value={money(spent)} />
        {!!toCode && <Stat label="Grant receipts to code" value={toCode} tone={gold} sub="in Grant Management" href="/grant-management/pex" />}
      </div>
      <Eyebrow>Recent transactions</Eyebrow>
      <PexTxTable rows={(recent ?? []) as Tx[]} cardById={cardById} names={new Map()} officeName={new Map()} showHolder={false} />
      <p className="text-xs mt-4" style={{ color: faint }}>
        Need more funds on your card? Send a PEX Recharge Request through Finance Tickets.
      </p>
    </div>
  );
}
