"use client";

import { use, useCallback, useEffect, useState } from "react";
import PortalHeader from "@/app/PortalHeader";
import { Card, PageTitle, PillButton, inputStyle, dim, faint, ink, emerald, rose, gold } from "@/components/speaker/ui";

// An area manager reviews and signs one office goal agreement. Linked from
// the agreement email; also reachable from /goal-agreements.

type View = {
  agreement: {
    id: string;
    year: number;
    metric: string;
    amount: number;
    previous_amount: number | null;
    kind: "new" | "modified";
    status: "pending" | "signed" | "superseded";
    signed_name: string | null;
    signed_at: string | null;
    created_at: string;
  };
  office: string;
  setBy: string | null;
  metricLabel: string;
  sections: { title: string; body: string }[];
  canSign: boolean;
  me: { name: string };
};

const fmtGoal = (metric: string, n: number) => (metric === "people_served" ? Math.round(n).toLocaleString("en-US") : `$${Math.round(n).toLocaleString("en-US")}`);
const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" }) : "");

export default function GoalAgreementPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [view, setView] = useState<View | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const r = await fetch(`/api/goal-agreements/${id}`);
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return setError(j.error ?? "Couldn't load this agreement.");
    setView(j);
    setName((n) => n || j.me?.name || "");
  }, [id]);
  useEffect(() => {
    load();
  }, [load]);

  async function sign() {
    setFormError(null);
    if (!agree) return setFormError("Check the box to confirm you agree.");
    setBusy(true);
    const r = await fetch(`/api/goal-agreements/${id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ signature_name: name, agree }) });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok || !j.ok) return setFormError(j.error ?? "Couldn't sign.");
    load();
  }

  const a = view?.agreement;
  return (
    <main style={{ minHeight: "100vh", background: "var(--portal-sand)" }}>
      <PortalHeader />
      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8">
        <a href="/goal-agreements" className="text-xs font-semibold" style={{ color: emerald }}>
          ← All goal agreements
        </a>
        {error ? (
          <Card className="mt-4">
            <p className="text-sm" style={{ color: rose }}>{error}</p>
          </Card>
        ) : !view || !a ? (
          <p className="text-sm mt-8 text-center" style={{ color: faint }}>Loading…</p>
        ) : (
          <>
            <div className="mt-4">
              <PageTitle eyebrow={`${view.office} · ${a.year}`} title={a.kind === "modified" ? "Revised goal agreement" : "Goal agreement"} />
            </div>

            {a.status === "signed" && (
              <Card className="mb-4" style={{ borderColor: `${emerald}55` }}>
                <p className="text-sm font-bold" style={{ color: emerald }}>✓ Signed by {a.signed_name} on {when(a.signed_at)}</p>
                <p className="text-xs mt-1" style={{ color: dim }}>A signed copy was emailed to you. It&apos;s also kept on record with upper management.</p>
              </Card>
            )}
            {a.status === "superseded" && (
              <Card className="mb-4" style={{ borderColor: `${gold}77` }}>
                <p className="text-sm font-bold" style={{ color: ink }}>This goal was changed after this agreement was sent.</p>
                <p className="text-xs mt-1" style={{ color: dim }}>It no longer needs signing. Open the newer agreement from your list.</p>
              </Card>
            )}

            <Card>
              <div className="flex flex-wrap items-baseline justify-between gap-2 pb-4 mb-4" style={{ borderBottom: "1px solid var(--portal-line)" }}>
                <div>
                  <div className="text-xs" style={{ color: dim }}>{view.metricLabel}</div>
                  <div className="text-2xl font-bold tabular-nums" style={{ color: ink }}>
                    {fmtGoal(a.metric, a.amount)}
                  </div>
                  {a.kind === "modified" && a.previous_amount != null && (
                    <div className="text-xs" style={{ color: dim }}>
                      Previously {fmtGoal(a.metric, a.previous_amount)}
                    </div>
                  )}
                </div>
                <div className="text-xs text-right" style={{ color: dim }}>
                  Set {when(a.created_at)}
                  {view.setBy ? <><br />by {view.setBy}</> : null}
                </div>
              </div>
              <div className="space-y-4">
                {view.sections.map((s) => (
                  <section key={s.title}>
                    <h2 className="text-sm font-bold" style={{ color: ink }}>{s.title}</h2>
                    <p className="text-sm leading-relaxed mt-1" style={{ color: ink }}>{s.body}</p>
                  </section>
                ))}
              </div>
              <a href={`/api/goal-agreements/${a.id}/pdf`} target="_blank" rel="noreferrer" className="inline-block mt-5 text-xs font-semibold" style={{ color: emerald }}>
                {a.status === "signed" ? "Download signed copy (PDF)" : "Download as PDF"}
              </a>
            </Card>

            {a.status === "pending" && (
              <Card className="mt-4">
                {view.canSign ? (
                  <div className="space-y-4">
                    <label className="block">
                      <span className="text-xs font-semibold" style={{ color: dim }}>Type your full name to sign</span>
                      <input value={name} onChange={(e) => setName(e.target.value)} style={{ ...inputStyle, marginTop: 6, fontFamily: "'Fraunces', serif", fontStyle: "italic", fontSize: 18 }} autoComplete="name" />
                    </label>
                    <label className="flex items-start gap-2 text-sm" style={{ color: ink }}>
                      <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} className="mt-1" />
                      <span>I agree to this {a.year} goal for {view.office} and that typing my name is my electronic signature.</span>
                    </label>
                    {formError && <p className="text-sm" style={{ color: rose }}>{formError}</p>}
                    <PillButton onClick={sign} disabled={busy || name.trim().length < 3}>
                      {busy ? "Signing…" : "Sign agreement"}
                    </PillButton>
                  </div>
                ) : (
                  <p className="text-sm" style={{ color: dim }}>Waiting for {view.office}&apos;s area manager to sign.</p>
                )}
              </Card>
            )}
          </>
        )}
      </div>
    </main>
  );
}
