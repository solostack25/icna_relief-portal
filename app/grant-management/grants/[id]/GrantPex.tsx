import Link from "next/link";
import { createAdminClient, nameMap } from "@/lib/grantManagement/server";
import { fmtDate, money } from "@/lib/grantManagement/shared";
import { Card, Empty, Eyebrow } from "@/components/grantManagement/ui";
import { dim, emerald, faint, gold, ink, td, tdNum, th, thNum } from "@/components/grantManagement/styles";
import { CardStatusPill, holderName } from "@/components/grantManagement/pex/pexUi";
import GrantPexLink from "./GrantPexLink";

// Grant page -> PEX tab: which cards spend on this grant, and what's
// waiting to be coded to it.
export default async function GrantPex({ id, grant, isManager }: { id: string; grant: { start_date: string; end_date: string; status: string }; isManager: boolean }) {
  const admin = createAdminClient();
  const today = new Date().toISOString().slice(0, 10);
  const [{ data: links }, { data: waiting }, { data: coded }, { data: allCards }] = await Promise.all([
    admin
      .from("gm_pex_card_grants")
      .select("id, card_id, start_date, end_date, is_default, card:card_id(id, first_name, last_name, last4, card_status, employee_id)")
      .eq("grant_id", id)
      .order("start_date", { ascending: false }),
    admin.from("gm_pex_transactions").select("amount, allocated_amount, non_grant_amount").eq("suggested_grant_id", id).eq("in_grant_scope", true).in("status", ["unmatched", "partial"]).eq("is_pending", false),
    admin.from("gm_expenses").select("amount, status").eq("grant_id", id).eq("source", "pex").neq("status", "rejected"),
    isManager ? admin.from("pex_cards").select("id, first_name, last_name, last4").eq("grant_eligible", true).order("last_name") : Promise.resolve({ data: [] }),
  ]);
  type CardRow = { id: string; first_name: string | null; last_name: string | null; last4: string | null; card_status: string | null; employee_id: string | null };
  const rows = (links ?? []).map((l) => ({ ...l, card: l.card as unknown as CardRow }));
  const names = await nameMap(admin, rows.map((r) => r.card?.employee_id));
  const waitingAmt = (waiting ?? []).reduce((s, w) => s + Number(w.amount) - Number(w.allocated_amount) - Number(w.non_grant_amount), 0);
  const approved = (coded ?? []).filter((c) => c.status === "approved").reduce((s, c) => s + Number(c.amount), 0);
  const inReview = (coded ?? []).filter((c) => c.status !== "approved").reduce((s, c) => s + Number(c.amount), 0);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Link href={`/grant-management/pex?status=waiting&grant=${id}`} className="block">
          <Card className="!p-4">
            <Eyebrow color={gold}>Waiting to code</Eyebrow>
            <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 22, fontWeight: 600, color: ink }}>{(waiting ?? []).length}</div>
            <div className="text-xs" style={{ color: dim }}>
              {money(waitingAmt, true)} on this grant&apos;s cards →
            </div>
          </Card>
        </Link>
        <Card className="!p-4">
          <Eyebrow>PEX spend approved</Eyebrow>
          <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 22, fontWeight: 600, color: ink }}>{money(approved, true)}</div>
        </Card>
        <Card className="!p-4">
          <Eyebrow>PEX spend in review</Eyebrow>
          <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 22, fontWeight: 600, color: ink }}>{money(inReview, true)}</div>
          <div className="text-xs" style={{ color: dim }}>
            drafts + submitted
          </div>
        </Card>
      </div>

      <Card className="!p-0 overflow-hidden">
        <div className="px-5 pt-4 pb-2 flex flex-wrap items-center justify-between gap-2">
          <div className="text-sm font-bold" style={{ color: ink }}>
            PEX cards that spend on this grant
          </div>
          <Link href={`/grant-management/pex?status=all&grant=${id}`} className="text-xs font-semibold" style={{ color: emerald }}>
            All PEX activity for this grant →
          </Link>
        </div>
        {!rows.length ? (
          <div className="px-5 pb-5">
            <Empty>No cards linked yet. Link the cards that spend this grant&apos;s money, and their transactions will be routed here for coding.</Empty>
          </div>
        ) : (
          <table className="w-full" style={{ borderCollapse: "separate", borderSpacing: 0 }}>
            <thead>
              <tr>
                <th style={th}>Card holder</th>
                <th style={th}>Card</th>
                <th style={th}>Dates</th>
                <th style={thNum}>Role</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const live = r.start_date <= today && (!r.end_date || r.end_date >= today);
                return (
                  <tr key={r.id} style={{ opacity: live ? 1 : 0.55 }}>
                    <td style={td}>
                      {isManager ? (
                        <Link href={`/grant-management/pex/cards/${r.card_id}`} className="font-semibold hover:underline" style={{ color: ink }}>
                          {names.get(r.card?.employee_id ?? "") ?? holderName(r.card)}
                        </Link>
                      ) : (
                        <span className="font-semibold">{names.get(r.card?.employee_id ?? "") ?? holderName(r.card)}</span>
                      )}
                    </td>
                    <td style={td}>
                      <span style={{ fontFamily: "'IBM Plex Mono', monospace" }}>•••• {r.card?.last4 ?? "????"}</span> <CardStatusPill status={r.card?.card_status ?? null} />
                    </td>
                    <td style={td}>
                      {fmtDate(r.start_date)} → {r.end_date ? fmtDate(r.end_date) : "ongoing"}
                      {!live && (
                        <span className="text-xs" style={{ color: faint }}>
                          {" "}
                          (ended)
                        </span>
                      )}
                    </td>
                    <td style={{ ...tdNum, fontFamily: undefined }}>{r.is_default ? "Default" : "Secondary"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Card>

      {isManager && grant.status !== "closed" && (
        <GrantPexLink
          grantId={id}
          grantStart={grant.start_date}
          grantEnd={grant.end_date}
          cards={(allCards ?? []).filter((c) => !rows.some((r) => r.card_id === c.id && (!r.end_date || r.end_date >= today))).map((c) => ({ id: c.id, label: `${holderName(c)} · •••• ${c.last4 ?? "????"}` }))}
        />
      )}
    </div>
  );
}
