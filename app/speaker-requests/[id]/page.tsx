"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import PortalHeader from "@/app/PortalHeader";
import { Card, CheckStep, Eyebrow, PageTitle, PillButton, Row, StatusPill, money, formatWhen, eventLabel, dim, faint, ink, emerald, gold, rose } from "@/components/speaker/ui";

type Approval = { id: string; gate: string; approver_name: string; approver_email: string; approver_role: string | null; decision: string; notes: string | null; decided_at: string | null; approval_token: string | null };
type Event = { id: string; kind: string; message: string; ok: boolean; created_at: string };
type Detail = {
  request: Record<string, any>;
  approvals: Approval[];
  events: Event[];
  office: { field_office: string; state: string } | null;
  financeTicket: { id: string; ticket_number: string; status: string; total: number } | null;
  viewer: { isCoordinator: boolean; isAdmin: boolean; canManageFinance: boolean };
};

const DECISION_COLORS: Record<string, string> = { pending: "#A57420", approved: emerald, denied: rose, superseded: "#999" };
const DECISION_LABELS: Record<string, string> = { pending: "Waiting", approved: "Approved", denied: "Denied", superseded: "Not needed" };

export default function SpeakerRequestDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [d, setD] = useState<Detail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  const load = useCallback(() => {
    fetch(`/api/speaker-requests/${id}`)
      .then(async (r) => {
        const body = await r.json();
        if (!r.ok) throw new Error(body.error ?? "Couldn't load");
        setD(body);
      })
      .catch((e) => setError(e.message));
  }, [id]);
  useEffect(load, [load]);

  async function act(action: "cancel" | "resend" | "retry") {
    if (action === "cancel" && !confirm("Cancel this request? Pending approvers won't be able to act on it.")) return;
    setBusy(action);
    setFlash(null);
    const res = await fetch(`/api/speaker-requests/${id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) });
    const body = await res.json();
    setBusy(null);
    setFlash(res.ok ? (action === "cancel" ? "Request cancelled." : action === "resend" ? "Approval emails re-sent." : "Automation re-run. Check the activity log below.") : body.error);
    load();
  }

  if (error)
    return (
      <main style={{ minHeight: "100vh", background: "var(--portal-sand)" }}>
        <PortalHeader />
        <div className="max-w-3xl mx-auto px-4 py-12 text-sm" style={{ color: rose }}>
          {error}
        </div>
      </main>
    );
  if (!d)
    return (
      <main style={{ minHeight: "100vh", background: "var(--portal-sand)" }}>
        <PortalHeader />
        <div className="max-w-3xl mx-auto px-4 py-12 text-sm" style={{ color: faint }}>
          Loading…
        </div>
      </main>
    );

  const r = d.request;
  const am = d.approvals.filter((a) => a.gate === "area_manager");
  const lead = d.approvals.filter((a) => a.gate === "leadership");
  const myPending = d.approvals.find((a) => a.approval_token);
  const pending = r.status === "pending_am" || r.status === "pending_leadership";
  const approved = r.status === "approved";
  const failed = d.events.filter((e) => !e.ok);
  const lastFailByKind = new Set(failed.map((e) => e.kind));
  const canManage = d.viewer.isCoordinator || d.viewer.isAdmin || d.viewer.canManageFinance;

  return (
    <main style={{ minHeight: "100vh", background: "var(--portal-sand)" }}>
      <PortalHeader />
      <div className="max-w-5xl mx-auto px-4 sm:px-8 py-8">
        <Link href="/speaker-requests" className="text-xs" style={{ color: faint }}>
          ← Speaker Requests
        </Link>
        <PageTitle eyebrow={`${r.request_number} · ${r.travel_required ? "Escalated pathway (travel)" : "Fast-track (local)"}`} title={r.speaker_name} right={<StatusPill status={r.status} />} />

        {flash && (
          <div className="text-sm rounded-xl p-3 mb-5 font-semibold" style={{ background: "#fff", border: "1px solid var(--portal-line)", color: ink }}>
            {flash}
          </div>
        )}

        {myPending && pending && (
          <Card className="mb-5" style={{ background: "#FFFCF5", borderColor: `${gold}66` }}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="text-sm font-bold" style={{ color: ink }}>
                This request is waiting on your decision.
              </div>
              <PillButton href={`/speaker-requests/approve/${myPending.approval_token}`}>Review & decide</PillButton>
            </div>
          </Card>
        )}

        <div className="grid lg:grid-cols-[1fr_340px] gap-5 items-start">
          <div className="space-y-5">
            <Card>
              <Eyebrow>Event</Eyebrow>
              <Row k="Event" v={eventLabel(r as { event_type: string; event_type_other: string | null })} />
              <Row k="When" v={formatWhen(r.event_at, r.event_timezone)} />
              <Row k="Region" v={r.region} />
              {d.office && <Row k="Office" v={`${d.office.field_office}${d.office.state ? `, ${d.office.state}` : ""}`} />}
              <Row k="Coordinator" v={r.coordinator_name} />
              <Row k="Area Manager" v={r.area_manager_name} />
              <Row k="Speaker contact" v={[r.speaker_email, r.speaker_phone].filter(Boolean).join(" · ") || "—"} />
              {r.travel_required && <Row k="W-9 on file (per coordinator)" v={r.w9_on_file ? "Yes" : "No"} />}
            </Card>

            <Card>
              <Eyebrow>Costs</Eyebrow>
              <Row k="Honorarium" v={money(r.honorarium)} />
              {r.travel_required && (
                <>
                  <Row k="Estimated travel" v={money(r.travel_cost)} />
                  <Row k="Estimated hotel" v={money(r.hotel_cost)} />
                </>
              )}
              <div className="flex justify-between pt-3 text-[15px] font-bold" style={{ color: ink }}>
                <span>Combined total</span>
                <span style={{ fontFamily: "'IBM Plex Mono', monospace" }}>{money(r.total_cost)}</span>
              </div>
              {r.justification && (
                <div className="mt-4 rounded-xl p-4 text-sm whitespace-pre-wrap" style={{ background: "#F4F3EE", color: ink }}>
                  <div className="text-xs font-bold mb-1" style={{ color: dim }}>
                    Strategic justification
                  </div>
                  {r.justification}
                </div>
              )}
            </Card>

            <Card>
              <Eyebrow>Activity</Eyebrow>
              <div className="mt-2">
                {d.events.map((e) => (
                  <div key={e.id} className="flex gap-3 py-2.5" style={{ borderBottom: "1px dashed var(--portal-line)" }}>
                    <span className="mt-1.5 w-2 h-2 rounded-full flex-shrink-0" style={{ background: e.ok ? emerald : rose }} />
                    <div className="min-w-0">
                      <div className="text-sm" style={{ color: e.ok ? ink : rose }}>
                        {e.message}
                      </div>
                      <div className="text-[11px] mt-0.5" style={{ color: faint, fontFamily: "'IBM Plex Mono', monospace" }}>
                        {new Date(e.created_at).toLocaleString()}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          </div>

          <div className="space-y-5 lg:sticky lg:top-6">
            <Card>
              <Eyebrow>Approvals</Eyebrow>
              {[{ title: "Gate 1 · Area Manager", list: am }, ...(r.requires_leadership ? [{ title: "Gate 2 · Joint leadership", list: lead }] : [])].map((g) => (
                <div key={g.title} className="mt-3">
                  <div className="text-xs font-bold mb-1.5" style={{ color: dim }}>
                    {g.title}
                  </div>
                  {g.list.length === 0 && (
                    <div className="text-xs" style={{ color: faint }}>
                      {r.status === "pending_leadership" ? "No approvers yet — see activity." : "Starts after the Area Manager approves."}
                    </div>
                  )}
                  {g.list.map((a) => (
                    <div key={a.id} className="py-1.5">
                      <div className="flex justify-between gap-2 text-sm">
                        <span className="font-semibold" style={{ color: ink }}>
                          {a.approver_name}
                        </span>
                        <span className="text-xs font-bold" style={{ color: DECISION_COLORS[a.decision] }}>
                          {DECISION_LABELS[a.decision] ?? a.decision}
                        </span>
                      </div>
                      <div className="text-[11px]" style={{ color: faint }}>
                        {a.approver_role}
                        {a.decided_at ? ` · ${new Date(a.decided_at).toLocaleDateString()}` : ""}
                      </div>
                      {a.notes && (
                        <div className="text-xs mt-1 italic" style={{ color: dim }}>
                          “{a.notes}”
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ))}
            </Card>

            <Card>
              <Eyebrow>Automatic after approval</Eyebrow>
              <div className="mt-1">
                <CheckStep
                  done={!!d.financeTicket}
                  warn={approved && !d.financeTicket && lastFailByKind.has("finance_ticket")}
                  label="Finance honorarium ticket"
                  detail={
                    d.financeTicket ? (
                      <Link href={`/finance-tickets/${d.financeTicket.id}`} style={{ color: emerald, fontWeight: 700 }}>
                        {d.financeTicket.ticket_number} · {money(d.financeTicket.total)} →
                      </Link>
                    ) : approved ? (
                      "Not created — retry below"
                    ) : (
                      "Submitted to Finance when approved"
                    )
                  }
                />
                <CheckStep done={!!r.speaker_packet_sent_at} warn={approved && !r.speaker_packet_sent_at} label="Agreement sent to speaker" detail={r.speaker_packet_sent_at ? new Date(r.speaker_packet_sent_at).toLocaleString() : undefined} />
                <CheckStep
                  done={!!r.agreement_signed_at}
                  label="Speaker signed agreement"
                  detail={
                    r.agreement_signed_at ? (
                      <a href={`/api/speaker-requests/${r.id}/documents/agreement`} style={{ color: emerald, fontWeight: 700 }}>
                        Signed by {r.agreement_signed_name} — download
                      </a>
                    ) : approved ? (
                      "Waiting on speaker (auto-reminded every 3 days)"
                    ) : undefined
                  }
                />
                {(r.w9_needed || r.w9_received_at || (approved && r.w9_needed)) && (
                  <CheckStep done={!!r.w9_received_at} label="W-9 received" detail={r.w9_received_at ? "Attached to the finance ticket" : approved ? "Waiting on speaker" : undefined} />
                )}
                {approved && !r.w9_needed && <CheckStep done label="W-9 already on file" />}
              </div>
              {approved && r.speaker_portal_url && (
                <div className="mt-3 text-[11px] break-all rounded-lg p-2.5" style={{ background: "#F4F3EE", color: dim }}>
                  Speaker link: <span style={{ color: ink }}>{r.speaker_portal_url}</span>
                </div>
              )}
            </Card>

            {canManage && (pending || approved) && (
              <div className="flex flex-wrap gap-2">
                {pending && (
                  <PillButton variant="ghost" onClick={() => act("resend")} disabled={!!busy}>
                    {busy === "resend" ? "Sending…" : "Re-send approvals"}
                  </PillButton>
                )}
                {approved && failed.length > 0 && (
                  <PillButton variant="ghost" onClick={() => act("retry")} disabled={!!busy}>
                    {busy === "retry" ? "Running…" : "Retry automation"}
                  </PillButton>
                )}
                {pending && (d.viewer.isCoordinator || d.viewer.isAdmin) && (
                  <PillButton variant="danger" onClick={() => act("cancel")} disabled={!!busy}>
                    Cancel request
                  </PillButton>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
