import Link from "next/link";
import { createAdminClient, getGmViewer, nameMap } from "@/lib/grantManagement/server";
import { getIntegrationSetting } from "@/lib/integrationSettings";
import { isDemoUrl } from "@/lib/pex/demo";
import { fmtDate, money } from "@/lib/grantManagement/shared";
import { mccCategory } from "@/lib/pex/rules";
import { Card, Empty, PageTitle, Stat } from "@/components/grantManagement/ui";
import { dim, emerald, faint, gold, ink, rose, td, tdNum, th, thNum } from "@/components/grantManagement/styles";
import { ago, CardStatusPill, FlagPills, holderName, PexStatusPill } from "@/components/grantManagement/pex/pexUi";
import PexRowActions from "./PexRowActions";
import { grantCardIds, grantScopeFilter } from "@/lib/pex/access";

type SP = Record<string, string | undefined>;

// Grant Management sees PEX spending from cards switched on for grants
// (PEX → Cards → "Used for grants"), plus older CSV uploads and anything
// already coded. Org-wide card spending lives in the PEX app (/pex).
const TABS = [
  ["transactions", "To code"],
  ["cards", "Grant cards"],
] as const;

const FILTERS = [
  ["waiting", "To code"],
  ["partial", "Partly coded"],
  ["coded", "Coded"],
  ["ignored", "Excluded"],
  ["pending", "Pending at PEX"],
  ["all", "All"],
] as const;

export default async function PexPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const viewer = (await getGmViewer())!;
  const admin = createAdminClient();
  const tab = viewer.isManager && TABS.some(([k]) => k === sp.tab) ? (sp.tab as string) : "transactions";

  // ---------- headline numbers ----------
  const monthStart = new Date().toISOString().slice(0, 8) + "01";
  // Managers see every card; everyone else only their own transactions.
  const own: Record<string, string> = viewer.isManager ? {} : { employee_id: viewer.employeeId };
  const scope = grantScopeFilter(await grantCardIds(admin));
  const [waitingQ, partialQ, codedQ, pendingQ, flaggedQ, lastRunQ] = await Promise.all([
    admin.from("gm_pex_transactions").select("amount, allocated_amount, non_grant_amount").match(own).or(scope).eq("status", "unmatched").eq("is_pending", false),
    admin.from("gm_pex_transactions").select("amount, allocated_amount, non_grant_amount").match(own).or(scope).eq("status", "partial"),
    admin.from("gm_pex_transactions").select("allocated_amount").match(own).or(scope).eq("status", "coded").gte("transaction_date", monthStart),
    admin.from("gm_pex_transactions").select("id", { count: "exact", head: true }).match(own).or(scope).eq("is_pending", true),
    admin.from("gm_pex_transactions").select("id", { count: "exact", head: true }).match(own).or(scope).in("status", ["unmatched", "partial"]).neq("flags", "{}"),
    admin.from("pex_sync_runs").select("started_at, finished_at, ok, error, stats, kind").order("started_at", { ascending: false }).limit(1).maybeSingle(),
  ]);
  const left = (rows: { amount: number; allocated_amount: number; non_grant_amount: number }[] | null) =>
    (rows ?? []).reduce((s, r) => s + Number(r.amount) - Number(r.allocated_amount) - Number(r.non_grant_amount), 0);
  const waitingRows = waitingQ.data ?? [];
  const partialRows = partialQ.data ?? [];
  const codedMonth = (codedQ.data ?? []).reduce((s, r) => s + Number(r.allocated_amount), 0);
  const lastRun = lastRunQ.data;
  const balance = (lastRun?.stats as { balance?: number | null } | null)?.balance ?? null;

  const { count: grantCards } = viewer.isManager
    ? await admin.from("gm_pex_card_grants").select("card_id", { count: "exact", head: true }).lte("start_date", new Date().toISOString().slice(0, 10)).or(`end_date.is.null,end_date.gte.${new Date().toISOString().slice(0, 10)}`)
    : { count: null };

  const demo = isDemoUrl(await getIntegrationSetting("pex_api_url", process.env.PEX_API_URL));

  return (
    <div>
      {demo && (
        <div className="mb-4 rounded-xl px-4 py-2.5 text-sm flex flex-wrap items-center justify-between gap-2" style={{ background: `${gold}14`, border: `1px solid ${gold}55`, color: ink }}>
          <span>
            <b>Demo mode:</b> these PEX cards and transactions are fake, for trying things out.
          </span>
          {viewer.isManager && (
            <Link href="/pex/connection" className="text-xs font-bold" style={{ color: emerald }}>
              Manage demo →
            </Link>
          )}
        </div>
      )}
      <PageTitle
        eyebrow={viewer.isManager ? "PEX cards · grant spending" : "Your PEX card"}
        title="PEX"
        right={
          viewer.isManager ? (
            <div className="text-xs text-right" style={{ color: dim }}>
              {lastRun ? (
                <>
                  Last sync {ago(lastRun.finished_at ?? lastRun.started_at)}{" "}
                  <span style={{ color: lastRun.ok ? emerald : rose, fontWeight: 600 }}>{lastRun.ok ? "✓" : "failed"}</span>
                </>
              ) : (
                "Not synced with PEX yet"
              )}
            </div>
          ) : undefined
        }
      />

      <div className={`grid grid-cols-2 ${viewer.isManager ? "lg:grid-cols-6" : "lg:grid-cols-5"} gap-3 mb-6`}>
        <Stat label="Waiting to code" value={waitingRows.length} sub={money(left(waitingRows), true)} tone={waitingRows.length ? gold : undefined} href="/grant-management/pex?status=waiting" />
        <Stat label="Partly coded" value={partialRows.length} sub={`${money(left(partialRows), true)} left`} href="/grant-management/pex?status=partial" />
        <Stat label="Coded this month" value={money(codedMonth)} sub="to grants" />
        <Stat label="Needs a look" value={flaggedQ.count ?? 0} sub="flagged transactions" tone={flaggedQ.count ? rose : undefined} href="/grant-management/pex?status=waiting&flagged=1" />
        <Stat label="Pending at PEX" value={pendingQ.count ?? 0} sub="can code once settled" href="/grant-management/pex?status=pending" />
        {viewer.isManager && <Stat label="Grant cards" value={grantCards ?? 0} sub="linked to a grant now" href="/grant-management/pex?tab=cards" />}
      </div>

      {viewer.isManager && (
        <div className="flex gap-2 mb-5 flex-wrap">
          {TABS.map(([k, l]) => (
            <Link key={k} href={`/grant-management/pex?tab=${k}`} className="text-sm rounded-full px-4 py-1.5 font-semibold" style={tab === k ? { background: ink, color: "#fff" } : { background: "#fff", border: "1px solid var(--portal-line)", color: dim }}>
              {l}
            </Link>
          ))}
        </div>
      )}

      {tab === "transactions" && <Transactions sp={sp} viewer={viewer} />}
      {tab === "cards" && <Cards />}
    </div>
  );
}

// ---------- transactions ----------
async function Transactions({ sp, viewer }: { sp: SP; viewer: NonNullable<Awaited<ReturnType<typeof getGmViewer>>> }) {
  const admin = createAdminClient();
  const filter = FILTERS.some(([k]) => k === sp.status) ? sp.status! : "waiting";
  let q = admin
    .from("gm_pex_transactions")
    .select("id, transaction_date, card_holder, card_last4, card_id, merchant, merchant_city, merchant_state, mcc, amount, memo, employee_id, status, is_pending, allocated_amount, non_grant_amount, suggested_grant_id, flags, source")
    .order("transaction_date", { ascending: false })
    .limit(300);
  if (filter === "waiting") q = q.eq("status", "unmatched").eq("is_pending", false);
  else if (filter === "pending") q = q.eq("is_pending", true);
  else if (filter === "partial") q = q.eq("status", "partial");
  else if (filter === "coded") q = q.eq("status", "coded");
  else if (filter === "ignored") q = q.eq("status", "ignored");
  q = q.or(grantScopeFilter(await grantCardIds(admin)));
  if (!viewer.isManager) q = q.eq("employee_id", viewer.employeeId);
  if (sp.card) q = q.eq("card_id", sp.card);
  if (sp.flagged) q = q.neq("flags", "{}");
  if (sp.q) q = q.ilike("merchant", `%${sp.q.replace(/[%_,()]/g, " ")}%`);
  if (sp.grant) {
    // Suggested to this grant, or already coded to it.
    const { data: coded } = await admin.from("gm_expenses").select("pex_transaction_id").eq("grant_id", sp.grant).not("pex_transaction_id", "is", null);
    const ids = [...new Set((coded ?? []).map((c) => c.pex_transaction_id as string))];
    q = ids.length ? q.or(`suggested_grant_id.eq.${sp.grant},id.in.(${ids.join(",")})`) : q.eq("suggested_grant_id", sp.grant);
  }
  const { data } = await q;
  const rows = data ?? [];

  const txIds = rows.map((r) => r.id);
  const { data: exps } = txIds.length
    ? await admin.from("gm_expenses").select("pex_transaction_id, amount, status, grant_id").in("pex_transaction_id", txIds).neq("status", "rejected")
    : { data: [] };
  const grantIds = [...new Set([...(exps ?? []).map((e) => e.grant_id), ...rows.map((r) => r.suggested_grant_id).filter(Boolean)])] as string[];
  const { data: grants } = grantIds.length ? await admin.from("gm_grants").select("id, code, name").in("id", grantIds) : { data: [] };
  const gMap = new Map((grants ?? []).map((g) => [g.id, g]));
  const byTx = new Map<string, { grant_id: string; amount: number }[]>();
  (exps ?? []).forEach((e) => byTx.set(e.pex_transaction_id as string, [...(byTx.get(e.pex_transaction_id as string) ?? []), { grant_id: e.grant_id, amount: Number(e.amount) }]));

  const names = await nameMap(admin, rows.map((r) => r.employee_id));
  const { data: emps } = viewer.isManager ? await admin.from("employees").select("id, first_name, last_name").eq("is_active", true).order("first_name") : { data: [] };
  const employees = (emps ?? []).map((e: { id: string; first_name: string; last_name: string }) => ({ id: e.id, name: `${e.first_name} ${e.last_name}` }));
  const filterGrant = sp.grant ? gMap.get(sp.grant) ?? (await admin.from("gm_grants").select("id, code, name").eq("id", sp.grant).maybeSingle()).data : null;

  const href = (patch: SP) => {
    const p = new URLSearchParams();
    const next = { status: filter, card: sp.card, grant: sp.grant, q: sp.q, flagged: sp.flagged, ...patch };
    for (const [k, v] of Object.entries(next)) if (v) p.set(k, v);
    return `/grant-management/pex?${p.toString()}`;
  };

  return (
    <>
      <div className="flex flex-wrap items-center gap-2 mb-4">
        {FILTERS.map(([k, l]) => (
          <Link key={k} href={href({ status: k })} className="text-sm rounded-full px-4 py-1.5 font-semibold" style={filter === k ? { background: emerald, color: "#fff" } : { background: "#fff", border: "1px solid var(--portal-line)", color: dim }}>
            {l}
          </Link>
        ))}
        <form action="/grant-management/pex" className="ml-auto flex gap-2">
          <input type="hidden" name="status" value={filter} />
          {sp.grant && <input type="hidden" name="grant" value={sp.grant} />}
          {sp.card && <input type="hidden" name="card" value={sp.card} />}
          <input name="q" defaultValue={sp.q ?? ""} placeholder="Search merchant" className="text-sm rounded-full px-4 py-1.5" style={{ border: "1px solid var(--portal-line)", background: "#fff", minWidth: 180 }} />
        </form>
      </div>
      <p className="text-xs mb-4 -mt-1" style={{ color: faint }}>
        <b>To code</b>: nothing assigned yet · <b>Partly coded</b>: split, with some of the amount still unassigned · <b>Coded</b>: the full amount is assigned to grant(s) and/or excluded · <b>Excluded</b>: the whole charge isn&apos;t a grant expense · <b>Pending at PEX</b>: not settled yet, can be coded once it settles.
      </p>
      {(filterGrant || sp.card || sp.flagged) && (
        <div className="flex flex-wrap gap-2 mb-3 text-xs" style={{ color: dim }}>
          {filterGrant && <Chip label={`Grant: ${filterGrant.code}`} href={href({ grant: undefined })} />}
          {sp.card && <Chip label="One card" href={href({ card: undefined })} />}
          {sp.flagged && <Chip label="Flagged only" href={href({ flagged: undefined })} />}
        </div>
      )}

      {!rows.length ? (
        <Empty>{filter === "waiting" ? "Nothing waiting to be coded. 🎉" : "No transactions here."}</Empty>
      ) : (
        <Card className="!p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full" style={{ borderCollapse: "separate", borderSpacing: 0 }}>
              <thead>
                <tr>
                  <th style={th}>Date</th>
                  <th style={th}>Merchant</th>
                  <th style={th}>Card holder</th>
                  <th style={th}>Grant</th>
                  <th style={thNum}>Amount</th>
                  <th style={thNum}>Left</th>
                  <th style={th} />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const amount = Number(r.amount);
                  const leftAmt = amount - Number(r.allocated_amount) - Number(r.non_grant_amount);
                  const portions = byTx.get(r.id) ?? [];
                  const sug = r.suggested_grant_id ? gMap.get(r.suggested_grant_id) : null;
                  const cat = mccCategory(r.mcc);
                  return (
                    <tr key={r.id}>
                      <td style={{ ...td, whiteSpace: "nowrap" }}>
                        {fmtDate(r.transaction_date)}
                        <div className="mt-1">
                          <PexStatusPill status={r.status} pending={r.is_pending} />
                        </div>
                      </td>
                      <td style={td}>
                        <Link href={`/grant-management/pex/${r.id}`} className="font-semibold hover:underline" style={{ color: ink }}>
                          {r.merchant ?? "—"}
                        </Link>
                        <div className="text-xs" style={{ color: faint }}>
                          {[[r.merchant_city, r.merchant_state].filter(Boolean).join(", "), cat ? [cat.category, cat.subcategory].filter(Boolean).join(" · ") : null, r.memo].filter(Boolean).join(" · ")}
                        </div>
                        <FlagPills flags={r.flags} />
                      </td>
                      <td style={td}>
                        {names.get(r.employee_id) ?? <span style={{ color: "#A57420" }}>Unassigned</span>}
                        <div className="text-xs" style={{ color: faint }}>
                          {r.card_id ? (
                            viewer.isManager ? (
                              <Link href={`/grant-management/pex/cards/${r.card_id}`} className="hover:underline">
                                {[r.card_holder, r.card_last4 ? `•••• ${r.card_last4}` : null].filter(Boolean).join(" · ")}
                              </Link>
                            ) : (
                              [r.card_holder, r.card_last4 ? `•••• ${r.card_last4}` : null].filter(Boolean).join(" · ")
                            )
                          ) : (
                            [r.card_holder, r.card_last4 ? `•••• ${r.card_last4}` : null].filter(Boolean).join(" · ")
                          )}
                        </div>
                      </td>
                      <td style={td}>
                        {portions.length ? (
                          <div className="flex flex-col gap-0.5">
                            {portions.map((p, i) => (
                              <span key={i} className="text-xs">
                                <b>{gMap.get(p.grant_id)?.code ?? "Grant"}</b> {money(p.amount, true)}
                              </span>
                            ))}
                            {Number(r.non_grant_amount) !== 0 && (
                              <span className="text-xs" style={{ color: faint }}>
                                Non-grant {money(Number(r.non_grant_amount), true)}
                              </span>
                            )}
                          </div>
                        ) : sug ? (
                          <span className="text-xs" style={{ color: dim }} title={sug.name}>
                            Suggested: <b>{sug.code}</b>
                          </span>
                        ) : r.status === "ignored" ? (
                          <span className="text-xs" style={{ color: faint }}>
                            Excluded: not a grant expense
                          </span>
                        ) : (
                          <span className="text-xs" style={{ color: "#A57420" }} title="This card is used for grants, but no grant is picked for this date. Pick one when coding, or set the card's grants on the Grant cards tab.">
                            No grant picked for this date
                          </span>
                        )}
                      </td>
                      <td style={tdNum}>{money(amount, true)}</td>
                      <td style={{ ...tdNum, color: Math.abs(leftAmt) > 0.005 ? ink : faint }}>{Math.abs(leftAmt) > 0.005 ? money(leftAmt, true) : "—"}</td>
                      <td style={{ ...td, textAlign: "right" }}>
                        <PexRowActions
                          id={r.id}
                          status={r.status}
                          pending={r.is_pending}
                          canCode={["unmatched", "partial"].includes(r.status) && !r.is_pending && (r.employee_id === viewer.employeeId || viewer.isManager)}
                          isManager={viewer.isManager}
                          employees={employees}
                          allocated={Number(r.allocated_amount)}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
      {viewer.isManager && (
        <p className="text-xs mt-3" style={{ color: faint }}>
          Transactions arrive from PEX automatically once connected. You can still bring in a PEX export through{" "}
          <Link href="/grant-management/import?kind=pex" className="underline">
            Bulk upload → PEX
          </Link>
          .
        </p>
      )}
    </>
  );
}

function Chip({ label, href }: { label: string; href: string }) {
  return (
    <Link href={href} className="rounded-full px-3 py-1 font-semibold" style={{ background: "#fff", border: "1px solid var(--portal-line)", color: ink }}>
      {label} ✕
    </Link>
  );
}

// ---------- cards ----------
async function Cards() {
  const admin = createAdminClient();
  const today = new Date().toISOString().slice(0, 10);
  const [{ data: cards }, { data: links }, { data: waiting }] = await Promise.all([
    admin.from("pex_cards").select("id, pex_account_id, first_name, last_name, last4, card_status, available_balance, employee_id, is_virtual, grant_eligible, synced_at").eq("grant_eligible", true).order("last_name"),
    admin.from("gm_pex_card_grants").select("card_id, grant_id, start_date, end_date, is_default, grant:grant_id(code, name)"),
    admin.from("gm_pex_transactions").select("card_id").in("status", ["unmatched", "partial"]).eq("is_pending", false).not("card_id", "is", null),
  ]);
  const names = await nameMap(admin, (cards ?? []).map((c) => c.employee_id));
  const waitingBy = new Map<string, number>();
  (waiting ?? []).forEach((w) => waitingBy.set(w.card_id as string, (waitingBy.get(w.card_id as string) ?? 0) + 1));
  const activeLinks = (links ?? []).filter((l) => l.start_date <= today && (!l.end_date || l.end_date >= today));
  const list = [...(cards ?? [])].sort((a, b) => Number(activeLinks.some((l) => l.card_id === b.id)) - Number(activeLinks.some((l) => l.card_id === a.id)));

  return (
    <>
      <p className="text-sm mb-4 max-w-3xl" style={{ color: dim }}>
        Cards Finance has switched on as <b>Used for grants</b>. Open a card to pick which grant(s) it spends on and for which dates. To add or remove cards here, use{" "}
        <Link href="/pex/cards" className="font-semibold underline" style={{ color: emerald }}>
          PEX → Cards
        </Link>
        .
      </p>
      {!list.length ? (
        <Empty>No cards are marked as used for grants yet. Finance switches them on in PEX → Cards.</Empty>
      ) : (
        <Card className="!p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full" style={{ borderCollapse: "separate", borderSpacing: 0 }}>
              <thead>
                <tr>
                  <th style={th}>Card holder</th>
                  <th style={th}>Card</th>
                  <th style={th}>Portal employee</th>
                  <th style={th}>Grants it spends on</th>
                  <th style={thNum}>Balance</th>
                  <th style={thNum}>To code</th>
                  <th style={th} />
                </tr>
              </thead>
              <tbody>
                {list.map((c) => {
                  const cur = activeLinks.filter((l) => l.card_id === c.id);
                  return (
                    <tr key={c.id}>
                      <td style={td}>
                        <div className="font-semibold">{holderName(c)}</div>
                        {c.is_virtual && (
                          <div className="text-xs" style={{ color: faint }}>
                            Virtual card
                          </div>
                        )}
                      </td>
                      <td style={td}>
                        <div style={{ fontFamily: "'IBM Plex Mono', monospace" }}>•••• {c.last4 ?? "????"}</div>
                        <div className="mt-1">
                          <CardStatusPill status={c.card_status} />
                        </div>
                      </td>
                      <td style={td}>{names.get(c.employee_id) ?? <span style={{ color: "#A57420" }}>Not linked</span>}</td>
                      <td style={td}>
                        {cur.length ? (
                          cur.map((l, i) => {
                            const g = l.grant as unknown as { code: string; name: string } | null;
                            return (
                              <div key={i} className="text-xs" title={g?.name}>
                                <b>{g?.code}</b> {l.is_default ? "" : "(secondary)"} <span style={{ color: faint }}>{l.end_date ? `until ${fmtDate(l.end_date)}` : "ongoing"}</span>
                              </div>
                            );
                          })
                        ) : (
                          <span className="text-xs" style={{ color: "#A57420" }}>
                            No grant picked yet
                          </span>
                        )}
                      </td>
                      <td style={tdNum}>{c.available_balance != null ? money(Number(c.available_balance), true) : "—"}</td>
                      <td style={tdNum}>{waitingBy.get(c.id) ?? "—"}</td>
                      <td style={{ ...td, textAlign: "right" }}>
                        <Link href={`/grant-management/pex/cards/${c.id}`} className="text-sm font-semibold" style={{ color: emerald }}>
                          Manage →
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
    </>
  );
}
