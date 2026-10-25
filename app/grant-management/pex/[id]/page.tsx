import Link from "next/link";
import { createAdminClient, getGmViewer, grantAccess, loadEntryGrants, nameMap } from "@/lib/grantManagement/server";
import { fmtDate, lineLabel, money, type ExpenseStatus } from "@/lib/grantManagement/shared";
import { activeDesignations, mccCategory, type Designation } from "@/lib/pex/rules";
import { Card, ExpenseStatusPill, Notice, PageTitle, Row } from "@/components/grantManagement/ui";
import { dim, emerald, faint, ink, rose } from "@/components/grantManagement/styles";
import { FlagPills, holderName, PexStatusPill } from "@/components/grantManagement/pex/pexUi";
import PexAllocateForm from "@/components/grantManagement/pex/PexAllocateForm";
import PexRowActions from "../PexRowActions";

export default async function PexTransactionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const viewer = (await getGmViewer())!;
  const admin = createAdminClient();
  const { data: tx } = await admin.from("gm_pex_transactions").select("*").eq("id", id).maybeSingle();
  if (!tx) return <Notice tone="warn">That PEX transaction wasn&apos;t found.</Notice>;
  // Only charges on a card assigned to a grant (on that date) belong here.
  if (!tx.in_grant_scope)
    return (
      <Notice tone="warn">
        This charge wasn&apos;t made on a card assigned to a grant for {fmtDate(tx.transaction_date)}, so it isn&apos;t part of Grant Management. It&apos;s still in the PEX app.
      </Notice>
    );

  const isOwner = !!tx.employee_id && tx.employee_id === viewer.employeeId;
  const suggestedAccess = tx.suggested_grant_id ? await grantAccess(viewer, tx.suggested_grant_id, admin) : null;
  if (!viewer.isManager && !isOwner && !suggestedAccess?.canView) return <Notice tone="warn">You don&apos;t have access to this card transaction.</Notice>;
  const canCode = (viewer.isManager || isOwner) && !tx.is_pending && ["unmatched", "partial"].includes(tx.status);

  const amount = Number(tx.amount);
  const allocated = Number(tx.allocated_amount);
  const nonGrant = Number(tx.non_grant_amount);
  const left = Math.round((amount - allocated - nonGrant) * 100) / 100;

  const [{ data: portions }, { data: card }, { data: links }, { data: history }] = await Promise.all([
    admin
      .from("gm_expenses")
      .select("id, amount, status, description, created_by, grant:grant_id(id, code, name), line:line_id(category, subcategory)")
      .eq("pex_transaction_id", id)
      .order("created_at"),
    tx.card_id ? admin.from("pex_cards").select("id, first_name, last_name, last4, card_status, employee_id").eq("id", tx.card_id).maybeSingle() : Promise.resolve({ data: null }),
    tx.card_id ? admin.from("gm_pex_card_grants").select("id, card_id, grant_id, start_date, end_date, is_default, default_line_id, grant:grant_id(code, name)").eq("card_id", tx.card_id) : Promise.resolve({ data: [] }),
    admin.from("gm_audit_log").select("action, actor_id, created_at, note").eq("entity", "pex").eq("entity_id", id).order("created_at", { ascending: false }).limit(15),
  ]);
  const active = activeDesignations((links ?? []) as Designation[], tx.card_id, tx.transaction_date);
  const linkedIds = active.map((d) => d.grant_id);
  const grants = canCode ? await loadEntryGrants(viewer, [], admin) : [];
  const people = await nameMap(admin, [tx.employee_id, ...(history ?? []).map((h) => h.actor_id), ...(portions ?? []).map((p) => p.created_by)]);
  const cat = mccCategory(tx.mcc);
  const { data: emps } = viewer.isManager ? await admin.from("employees").select("id, first_name, last_name").eq("is_active", true).order("first_name") : { data: [] };

  return (
    <div className="max-w-5xl">
      <Link href="/grant-management/pex" className="text-xs" style={{ color: faint }}>
        ← PEX transactions
      </Link>
      <PageTitle
        eyebrow={`PEX · ${fmtDate(tx.transaction_date)}`}
        title={tx.merchant ?? "Card transaction"}
        right={
          <div className="text-right">
            <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 26, fontWeight: 600, color: amount < 0 ? emerald : ink }}>{money(amount, true)}</div>
            <PexStatusPill status={tx.status} pending={tx.is_pending} />
          </div>
        }
      />

      {tx.is_pending && (
        <div className="mb-4">
          <Notice tone="info">This is still a pending hold at PEX. The final amount can change (tips, gas), so it can be coded once it settles. That usually takes 1 to 3 days.</Notice>
        </div>
      )}
      {(tx.flags ?? []).includes("amount_changed") && (
        <div className="mb-4">
          <Notice tone="warn">The amount changed when this settled at PEX. Check the coded portions still add up to {money(amount, true)}.</Notice>
        </div>
      )}

      <div className="grid lg:grid-cols-[1fr_1.6fr] gap-5 items-start">
        <div className="space-y-5">
          <Card>
            <Row k="Card holder" v={people.get(tx.employee_id) ?? tx.card_holder ?? "Unassigned"} />
            <Row k="Card" v={card ? `${holderName(card)} · •••• ${card.last4 ?? "????"}` : tx.card_last4 ? `•••• ${tx.card_last4}` : "—"} />
            <Row k="Merchant" v={[tx.merchant, [tx.merchant_city, tx.merchant_state].filter(Boolean).join(", ")].filter(Boolean).join(" · ") || "—"} />
            <Row k="Merchant type" v={tx.mcc ? `${tx.mcc}${cat ? ` · ${[cat.category, cat.subcategory].filter(Boolean).join(" › ")}` : ""}` : "—"} />
            {tx.memo && <Row k="PEX note" v={tx.memo} />}
            {Array.isArray(tx.pex_tags) && tx.pex_tags.length > 0 && (
              <Row
                k="PEX tags"
                v={(tx.pex_tags as { Name?: string; Value?: unknown }[])
                  .filter((t) => t.Value !== null && t.Value !== "")
                  .map((t) => `${t.Name ?? "Tag"}: ${typeof t.Value === "object" ? JSON.stringify(t.Value) : String(t.Value)}`)
                  .join(" · ") || "—"}
              />
            )}
            <Row k="Source" v={tx.source === "upload" ? "CSV upload" : tx.source === "webhook" ? "PEX webhook" : "PEX sync"} />
            <FlagPills flags={tx.flags} />
          </Card>

          <Card>
            <div className="text-sm font-bold mb-2" style={{ color: ink }}>
              Card&apos;s grants on {fmtDate(tx.transaction_date)}
            </div>
            {active.length ? (
              active.map((d) => {
                const g = (links ?? []).find((l) => l.id === d.id)?.grant as unknown as { code: string; name: string } | null;
                return (
                  <div key={d.id} className="text-sm py-1" style={{ color: ink }}>
                    <b>{g?.code}</b> · {g?.name}
                    {d.is_default ? "" : <span style={{ color: faint }}> (secondary)</span>}
                  </div>
                );
              })
            ) : (
              <p className="text-sm" style={{ color: dim }}>
                {tx.card_id ? "This card isn't linked to a grant for this date." : "This transaction isn't matched to a known card."} Any grant you can enter expenses on can still be picked.
              </p>
            )}
            {viewer.isManager && tx.card_id && (
              <Link href={`/grant-management/pex/cards/${tx.card_id}`} className="inline-block text-xs font-semibold mt-2" style={{ color: emerald }}>
                Manage this card&apos;s grants →
              </Link>
            )}
          </Card>

          {viewer.isManager && (
            <div className="flex justify-start">
              <PexRowActions
                id={tx.id}
                status={tx.status}
                pending={tx.is_pending}
                canCode={false}
                isManager
                employees={(emps ?? []).map((e: { id: string; first_name: string; last_name: string }) => ({ id: e.id, name: `${e.first_name} ${e.last_name}` }))}
                allocated={allocated}
              />
            </div>
          )}
        </div>

        <div className="space-y-5">
          {(portions?.length || nonGrant !== 0) && (
            <Card className="!p-0 overflow-hidden">
              <div className="px-5 pt-4 pb-2 text-sm font-bold" style={{ color: ink }}>
                Coded so far
              </div>
              {(portions ?? []).map((p) => {
                const g = p.grant as unknown as { code: string; name: string } | null;
                const l = p.line as unknown as { category: string; subcategory: string | null } | null;
                return (
                  <Link key={p.id} href={`/grant-management/expenses/${p.id}`} className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-[#FDFBF6]" style={{ borderTop: "1px solid rgba(22,48,43,0.06)" }}>
                    <div className="min-w-0">
                      <div className="text-sm font-semibold" style={{ color: p.status === "rejected" ? faint : ink, textDecoration: p.status === "rejected" ? "line-through" : undefined }}>
                        {g?.code} · {l ? lineLabel(l) : "—"}
                      </div>
                      <div className="text-xs truncate" style={{ color: dim }}>
                        {p.description}
                      </div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <ExpenseStatusPill status={p.status as ExpenseStatus} />
                      <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 13 }}>{money(Number(p.amount), true)}</span>
                    </div>
                  </Link>
                );
              })}
              {nonGrant !== 0 && (
                <div className="flex items-center justify-between gap-3 px-5 py-3" style={{ borderTop: "1px solid rgba(22,48,43,0.06)" }}>
                  <div className="text-sm" style={{ color: dim }}>
                    Not a grant expense{tx.non_grant_note ? ` · ${tx.non_grant_note}` : ""}
                  </div>
                  <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 13, color: dim }}>{money(nonGrant, true)}</span>
                </div>
              )}
              <div className="flex justify-between px-5 py-3 text-sm font-semibold" style={{ borderTop: "1px solid rgba(22,48,43,0.12)", background: "rgba(22,48,43,0.03)" }}>
                <span>Left to assign</span>
                <span style={{ fontFamily: "'IBM Plex Mono', monospace", color: Math.abs(left) > 0.005 ? rose : emerald }}>{Math.abs(left) > 0.005 ? money(left, true) : "None ✓"}</span>
              </div>
            </Card>
          )}

          {canCode ? (
            grants.length ? (
              <PexAllocateForm
                tx={{ id: tx.id, amount, left, nonGrant, nonGrantNote: tx.non_grant_note, merchant: tx.merchant, memo: tx.memo, fromPex: tx.source !== "upload" && !!tx.external_id }}
                grants={grants}
                suggestion={{ grantId: tx.suggested_grant_id, lineId: tx.suggested_line_id }}
                linkedGrantIds={linkedIds}
              />
            ) : (
              <Notice tone="warn">You aren&apos;t set up to enter expenses on any active grant. Ask Grant Management to add you to the grant this card spends on.</Notice>
            )
          ) : (
            !tx.is_pending &&
            Math.abs(left) < 0.005 && <Notice tone="ok">This transaction is fully accounted for.</Notice>
          )}

          {(history ?? []).length > 0 && (
            <Card>
              <div className="text-sm font-bold mb-2" style={{ color: ink }}>
                History
              </div>
              {(history ?? []).map((h, i) => (
                <div key={i} className="text-xs py-1" style={{ color: dim }}>
                  {fmtDate(h.created_at)} · {people.get(h.actor_id) ?? "Someone"} {h.action.replace(/_/g, " ")}
                  {h.note ? ` · “${h.note}”` : ""}
                </div>
              ))}
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
