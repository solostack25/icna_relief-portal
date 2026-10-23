import Link from "next/link";
import { fetchAll, nameMap } from "@/lib/grantManagement/server";
import { fmtDate, money } from "@/lib/grantManagement/shared";
import { getPexViewer, pexAdmin } from "@/lib/pex/access";
import { monthStart } from "@/lib/pex/categories";
import { Card, Empty, Notice, PageTitle } from "@/components/grantManagement/ui";
import { dim, emerald, faint, ink, sky, td, tdNum, th, thNum } from "@/components/grantManagement/styles";
import { CardStatusPill, holderName } from "@/components/grantManagement/pex/pexUi";
import PexGrantSwitch from "@/components/grantManagement/pex/PexGrantSwitch";
import PexAddCard from "@/components/grantManagement/pex/PexAddCard";

type SP = Record<string, string | undefined>;

export default async function PexCardsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const viewer = (await getPexViewer())!;
  if (!viewer.isAdmin) return <Notice tone="warn">Only Finance or a PEX admin can see every card.</Notice>;
  const db = pexAdmin();
  const today = new Date().toISOString().slice(0, 10);
  const [{ data: cards }, { data: offices }, { data: links }, { data: emps }, monthTx, { data: lastTx }] = await Promise.all([
    db.from("pex_cards").select("id, first_name, last_name, last4, card_status, available_balance, employee_id, office_id, grant_eligible, is_virtual, pex_account_id"),
    db.from("b2s_offices").select("id, field_office"),
    db.from("gm_pex_card_grants").select("card_id, start_date, end_date, is_default, grant:grant_id(code)").or(`end_date.is.null,end_date.gte.${today}`),
    db.from("employees").select("id, first_name, last_name").eq("is_active", true).order("first_name"),
    fetchAll<{ card_id: string | null; amount: number }>((f, t) => db.from("gm_pex_transactions").select("card_id, amount").eq("is_pending", false).gte("transaction_date", monthStart()).range(f, t)),
    db.from("gm_pex_transactions").select("card_id, transaction_date").order("transaction_date", { ascending: false }).limit(2000),
  ]);
  const officeName = new Map((offices ?? []).map((o) => [o.id, o.field_office as string]));
  const names = await nameMap(db as never, (cards ?? []).map((c) => c.employee_id));
  const spend = new Map<string, number>();
  monthTx.forEach((t) => t.card_id && spend.set(t.card_id, (spend.get(t.card_id) ?? 0) + Number(t.amount)));
  const last = new Map<string, string>();
  (lastTx ?? []).forEach((t) => t.card_id && !last.has(t.card_id) && last.set(t.card_id, t.transaction_date));

  const use = sp.use === "grant" || sp.use === "other" ? sp.use : "all";
  const q = (sp.q ?? "").trim().toLowerCase();
  const list = (cards ?? [])
    .filter((c) => (use === "grant" ? c.grant_eligible : use === "other" ? !c.grant_eligible : true))
    .filter((c) => !q || `${names.get(c.employee_id ?? "") ?? ""} ${holderName(c)} ${c.last4 ?? ""} ${officeName.get(c.office_id ?? "") ?? ""}`.toLowerCase().includes(q))
    .sort((a, b) => (names.get(a.employee_id ?? "") ?? holderName(a)).localeCompare(names.get(b.employee_id ?? "") ?? holderName(b)));
  const grantCount = (cards ?? []).filter((c) => c.grant_eligible).length;
  const pill = (active: boolean) => (active ? { background: ink, color: "#fff" } : { background: "#fff", border: "1px solid var(--portal-line)", color: dim });

  return (
    <div>
      <PageTitle eyebrow="PEX · all cards" title="Cards" />
      <p className="text-sm -mt-3 mb-4 max-w-3xl" style={{ color: dim }}>
        Switch on <b style={{ color: sky }}>Used for grants</b> for cards that spend grant money. Only those cards&apos; transactions go to Grant Management to be coded to a grant. Grant Management then picks which grant(s) each card spends on.
      </p>

      <div className="flex flex-wrap items-center gap-2 mb-4">
        {([
          ["all", `All (${(cards ?? []).length})`],
          ["grant", `Used for grants (${grantCount})`],
          ["other", `Other (${(cards ?? []).length - grantCount})`],
        ] as const).map(([k, l]) => (
          <Link key={k} href={`/pex/cards?use=${k}${sp.q ? `&q=${encodeURIComponent(sp.q)}` : ""}`} className="text-sm rounded-full px-4 py-1.5 font-semibold" style={pill(use === k)}>
            {l}
          </Link>
        ))}
        <form action="/pex/cards" className="ml-auto">
          <input type="hidden" name="use" value={use} />
          <input name="q" defaultValue={sp.q ?? ""} placeholder="Search name, last 4, office" className="text-sm rounded-full px-4 py-1.5" style={{ border: "1px solid var(--portal-line)", background: "#fff", minWidth: 220 }} />
        </form>
      </div>

      {!list.length ? (
        <Empty>
          {(cards ?? []).length ? "No cards match." : (
            <>
              No PEX cards yet.{" "}
              <Link href="/pex/connection" className="underline font-semibold" style={{ color: emerald }}>
                Connect PEX or try demo data
              </Link>
              , or add a card below.
            </>
          )}
        </Empty>
      ) : (
        <Card className="!p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full" style={{ borderCollapse: "separate", borderSpacing: 0 }}>
              <thead>
                <tr>
                  <th style={th}>Card holder</th>
                  <th style={th}>Card</th>
                  <th style={th}>Office</th>
                  <th style={thNum}>Available</th>
                  <th style={thNum}>Spent this month</th>
                  <th style={th}>Last used</th>
                  <th style={th}>Grants</th>
                  <th style={th} />
                </tr>
              </thead>
              <tbody>
                {list.map((c) => {
                  const cur = (links ?? []).filter((l) => l.card_id === c.id && l.start_date <= today);
                  return (
                    <tr key={c.id}>
                      <td style={td}>
                        <Link href={`/pex/cards/${c.id}`} className="font-semibold hover:underline" style={{ color: ink }}>
                          {names.get(c.employee_id ?? "") ?? holderName(c)}
                        </Link>
                        {!c.employee_id && (
                          <div className="text-xs" style={{ color: "#A57420" }}>
                            Not linked to a portal user
                          </div>
                        )}
                      </td>
                      <td style={td}>
                        <span style={{ fontFamily: "'IBM Plex Mono', monospace" }}>•••• {c.last4 ?? "????"}</span>
                        {c.is_virtual && (
                          <span className="text-xs" style={{ color: faint }}>
                            {" "}
                            virtual
                          </span>
                        )}
                        <div className="mt-1">
                          <CardStatusPill status={c.card_status} />
                        </div>
                      </td>
                      <td style={td}>{officeName.get(c.office_id ?? "") ?? <span style={{ color: faint }}>—</span>}</td>
                      <td style={tdNum}>{c.available_balance != null ? money(Number(c.available_balance), true) : "—"}</td>
                      <td style={tdNum}>{spend.get(c.id) ? money(spend.get(c.id)!, true) : "—"}</td>
                      <td style={{ ...td, whiteSpace: "nowrap", color: dim }}>{last.get(c.id) ? fmtDate(last.get(c.id)!) : "—"}</td>
                      <td style={td}>
                        <PexGrantSwitch cardId={c.id} on={c.grant_eligible} canEdit />
                        {c.grant_eligible && (
                          <div className="text-xs mt-1" style={{ color: dim }}>
                            {cur.length ? (
                              cur.map((l) => (l.grant as unknown as { code: string } | null)?.code).join(", ")
                            ) : (
                              <span style={{ color: "#A57420" }}>No grant picked yet</span>
                            )}
                          </div>
                        )}
                      </td>
                      <td style={{ ...td, textAlign: "right" }}>
                        <Link href={`/pex/cards/${c.id}`} className="text-sm font-semibold" style={{ color: emerald }}>
                          Open →
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <div className="mt-4">
        <PexAddCard employees={(emps ?? []).map((e) => ({ id: e.id, name: `${e.first_name} ${e.last_name}` }))} />
      </div>
    </div>
  );
}
