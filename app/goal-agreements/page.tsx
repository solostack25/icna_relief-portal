"use client";

import { useEffect, useState } from "react";
import PortalHeader from "@/app/PortalHeader";
import { Card, PageTitle, dim, faint, ink, emerald, gold, rose } from "@/components/speaker/ui";

// An area manager's goal agreements: anything waiting for their signature
// first, then what they've already signed.

type Item = {
  agreement: { id: string; year: number; amount: number; kind: "new" | "modified"; status: "pending" | "signed"; signed_at: string | null; created_at: string; metric: string };
  office: string;
  metricLabel: string;
  canSign: boolean;
};

const amount = (i: Item) =>
  i.agreement.metric === "people_served" ? Math.round(i.agreement.amount).toLocaleString("en-US") : `$${Math.round(i.agreement.amount).toLocaleString("en-US")}`;

export default function GoalAgreementsList() {
  const [items, setItems] = useState<Item[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    fetch("/api/goal-agreements")
      .then(async (r) => {
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(j.error ?? "Couldn't load");
        setItems(j.agreements);
      })
      .catch((e) => setError(e.message));
  }, []);
  const pending = items?.filter((i) => i.agreement.status === "pending") ?? [];
  const signed = items?.filter((i) => i.agreement.status === "signed") ?? [];

  const row = (i: Item) => (
    <a key={i.agreement.id} href={`/goal-agreements/${i.agreement.id}`} className="flex items-center justify-between gap-3 py-3" style={{ borderBottom: "1px solid var(--portal-line)" }}>
      <div>
        <div className="text-sm font-bold" style={{ color: ink }}>
          {i.office} · {i.metricLabel} {i.agreement.year}
          {i.agreement.kind === "modified" && <span className="ml-2 text-[10.5px] font-bold rounded-full px-2 py-0.5" style={{ background: `${gold}22`, color: "#8a6416" }}>Changed</span>}
        </div>
        <div className="text-xs" style={{ color: dim }}>
          {amount(i)} · {i.agreement.status === "signed" ? `signed ${new Date(i.agreement.signed_at!).toLocaleDateString()}` : `sent ${new Date(i.agreement.created_at).toLocaleDateString()}`}
        </div>
      </div>
      <span className="text-xs font-bold" style={{ color: i.agreement.status === "signed" ? emerald : rose }}>
        {i.agreement.status === "signed" ? "✓ Signed" : i.canSign ? "Sign →" : "Waiting"}
      </span>
    </a>
  );

  return (
    <main style={{ minHeight: "100vh", background: "var(--portal-sand)" }}>
      <PortalHeader />
      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8">
        <PageTitle eyebrow="Goals & Budgets" title="Goal agreements" />
        {error ? (
          <Card><p className="text-sm" style={{ color: rose }}>{error}</p></Card>
        ) : !items ? (
          <p className="text-sm text-center" style={{ color: faint }}>Loading…</p>
        ) : items.length === 0 ? (
          <Card><p className="text-sm" style={{ color: dim }}>No goal agreements for you yet. When upper management sets or changes your office&apos;s goals, they&apos;ll show up here to sign.</p></Card>
        ) : (
          <div className="space-y-4">
            {pending.length > 0 && (
              <Card>
                <h2 className="text-sm font-bold mb-1" style={{ color: rose }}>Waiting for your signature ({pending.length})</h2>
                {pending.map(row)}
              </Card>
            )}
            {signed.length > 0 && (
              <Card>
                <h2 className="text-sm font-bold mb-1" style={{ color: ink }}>Signed</h2>
                {signed.map(row)}
              </Card>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
