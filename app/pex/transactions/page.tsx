import Link from "next/link";
import { nameMap } from "@/lib/grantManagement/server";
import { money } from "@/lib/grantManagement/shared";
import { getPexViewer, pexAdmin } from "@/lib/pex/access";
import { monthLabel, shiftMonth } from "@/lib/pex/categories";
import { loadTransactions, readFilters } from "@/lib/pex/txQuery";
import { PageTitle } from "@/components/grantManagement/ui";
import { dim, emerald, ink } from "@/components/grantManagement/styles";
import { holderName } from "@/components/grantManagement/pex/pexUi";
import PexTxTable, { type PexCardRow, type PexTxRow } from "@/components/grantManagement/pex/PexTxTable";

type SP = Record<string, string | undefined>;

export default async function PexTransactionsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const viewer = (await getPexViewer())!;
  const db = pexAdmin();
  const f = readFilters(sp);
  const { rows, cards } = await loadTransactions(db, viewer, f);
  const { data: offices } = await db.from("b2s_offices").select("id, field_office").eq("is_active", true).order("field_office");
  const cardList = cards as PexCardRow[];
  const cardById = new Map(cardList.map((c) => [c.id, c]));
  const officeName = new Map((offices ?? []).map((o) => [o.id, o.field_office as string]));
  const names = await nameMap(db as never, cardList.map((c) => c.employee_id));
  const tx = rows as unknown as PexTxRow[];
  const settled = tx.filter((t) => !t.is_pending);
  const total = settled.reduce((s, t) => s + Number(t.amount), 0);

  const qs = (patch: SP) => {
    const p = new URLSearchParams();
    const next: SP = { month: f.month, card: f.card, office: f.office, q: f.q, pending: f.pending ? "1" : undefined, use: f.use, ...patch };
    for (const [k, v] of Object.entries(next)) if (v) p.set(k, v);
    return p.toString();
  };
  const pill = (active: boolean) =>
    active ? { background: ink, color: "#fff" } : { background: "#fff", border: "1px solid var(--portal-line)", color: dim };
  const thisMonth = new Date().toISOString().slice(0, 7);

  return (
    <div>
      <PageTitle
        eyebrow={viewer.isAdmin ? "PEX · all cards" : "PEX · your card"}
        title="Transactions"
        right={
          viewer.isAdmin ? (
            <a href={`/api/pex/transactions?${qs({})}&format=csv`} className="rounded-full px-4 py-2 text-sm font-bold" style={{ background: "#fff", border: "1.5px solid var(--portal-line)", color: ink }}>
              Download CSV
            </a>
          ) : undefined
        }
      />

      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="flex items-center gap-1 rounded-full px-1 py-1" style={{ background: "#fff", border: "1px solid var(--portal-line)" }}>
          <Link href={`/pex/transactions?${qs({ month: shiftMonth(f.month, -1) })}`} className="px-3 py-1 text-sm font-bold" style={{ color: dim }}>
            ‹
          </Link>
          <span className="text-sm font-semibold px-1" style={{ color: ink, minWidth: 130, textAlign: "center" }}>
            {monthLabel(f.month)}
          </span>
          {f.month < thisMonth ? (
            <Link href={`/pex/transactions?${qs({ month: shiftMonth(f.month, 1) })}`} className="px-3 py-1 text-sm font-bold" style={{ color: dim }}>
              ›
            </Link>
          ) : (
            <span className="px-3 py-1 text-sm" style={{ color: "transparent" }}>
              ›
            </span>
          )}
        </div>
        {viewer.isAdmin &&
          ([
            [undefined, "All cards"],
            ["grant", "Grant cards"],
            ["other", "Other cards"],
          ] as const).map(([k, l]) => (
            <Link key={l} href={`/pex/transactions?${qs({ use: k })}`} className="text-sm rounded-full px-4 py-1.5 font-semibold" style={pill(f.use === k)}>
              {l}
            </Link>
          ))}
        <Link href={`/pex/transactions?${qs({ pending: f.pending ? undefined : "1" })}`} className="text-sm rounded-full px-4 py-1.5 font-semibold" style={pill(!!f.pending)}>
          Pending only
        </Link>
        <form action="/pex/transactions" className="flex flex-wrap gap-2 ml-auto">
          <input type="hidden" name="month" value={f.month} />
          {f.use && <input type="hidden" name="use" value={f.use} />}
          {f.pending && <input type="hidden" name="pending" value="1" />}
          {viewer.isAdmin && (
            <>
              <select name="office" defaultValue={f.office ?? ""} className="text-sm rounded-full px-3 py-1.5" style={{ border: "1px solid var(--portal-line)", background: "#fff" }}>
                <option value="">All offices</option>
                {(offices ?? []).map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.field_office}
                  </option>
                ))}
              </select>
              <select name="card" defaultValue={f.card ?? ""} className="text-sm rounded-full px-3 py-1.5" style={{ border: "1px solid var(--portal-line)", background: "#fff", maxWidth: 220 }}>
                <option value="">All card holders</option>
                {[...cardList]
                  .sort((a, b) => (names.get(a.employee_id ?? "") ?? holderName(a)).localeCompare(names.get(b.employee_id ?? "") ?? holderName(b)))
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {names.get(c.employee_id ?? "") ?? holderName(c)} · {c.last4}
                    </option>
                  ))}
              </select>
            </>
          )}
          <input name="q" defaultValue={f.q ?? ""} placeholder="Search merchant" className="text-sm rounded-full px-4 py-1.5" style={{ border: "1px solid var(--portal-line)", background: "#fff", minWidth: 160 }} />
          <button type="submit" className="text-sm rounded-full px-4 py-1.5 font-bold" style={{ background: emerald, color: "#fff" }}>
            Filter
          </button>
        </form>
      </div>

      <div className="text-sm mb-3" style={{ color: dim }}>
        {settled.length} settled · <b style={{ color: ink }}>{money(total, true)}</b>
        {tx.length > settled.length && ` · ${tx.length - settled.length} pending`}
      </div>
      <PexTxTable rows={tx} cardById={cardById} names={names} officeName={officeName} showHolder={viewer.isAdmin} />
    </div>
  );
}
