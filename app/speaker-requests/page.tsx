"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import PortalHeader from "@/app/PortalHeader";
import { Card, Eyebrow, PageTitle, PillButton, money, formatWhen, eventLabel, dim, faint, ink, gold, emerald } from "@/components/speaker/ui";
import RequestCard, { type ListRow } from "@/components/speaker/RequestCard";

type ApprovalRow = { id: string; gate: string; approval_token: string; created_at: string; speaker_requests: ListRow | null };

export default function SpeakerRequestsPage() {
  const [data, setData] = useState<{ mine: ListRow[]; approvals: ApprovalRow[]; all: ListRow[] | null; canSeeAll: boolean } | null>(null);
  const [tab, setTab] = useState<"mine" | "all">("mine");

  useEffect(() => {
    fetch(`/api/speaker-requests${tab === "all" ? "?scope=all" : ""}`)
      .then((r) => r.json())
      .then(setData);
  }, [tab]);

  const list = tab === "all" ? data?.all ?? [] : data?.mine ?? [];

  return (
    <main style={{ minHeight: "100vh", background: "var(--portal-sand)" }}>
      <PortalHeader />
      <div className="max-w-4xl mx-auto px-4 sm:px-8 py-8">
        <Link href="/select-app" className="text-xs" style={{ color: faint }}>
          ← Home
        </Link>
        <PageTitle
          eyebrow="Outreach · Jummah & programs"
          title="Speaker Requests"
          right={<PillButton href="/speaker-requests/new">+ New request</PillButton>}
        />
        <p className="text-sm -mt-3 mb-8 max-w-2xl" style={{ color: dim }}>
          Submit once. After approval, the honorarium goes to Finance, the speaker gets their agreement and W-9 link, and you get a calendar invite. You don&apos;t need to do anything else.
        </p>

        {data && data.approvals.length > 0 && (
          <section className="mb-10">
            <Eyebrow color={gold}>Waiting on your approval · {data.approvals.length}</Eyebrow>
            <div className="grid gap-3">
              {data.approvals.map((a) =>
                a.speaker_requests ? (
                  <Link key={a.id} href={`/speaker-requests/approve/${a.approval_token}`} className="block transition-transform hover:-translate-y-0.5">
                    <Card className="!p-4" style={{ borderColor: `${gold}66`, background: "#FFFCF5" }}>
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <div className="text-[15px] font-bold" style={{ color: ink }}>
                            {a.speaker_requests.speaker_name} · {money(a.speaker_requests.total_cost)}
                          </div>
                          <div className="text-xs" style={{ color: dim }}>
                            {a.speaker_requests.coordinator_name} · {eventLabel(a.speaker_requests)} · {formatWhen(a.speaker_requests.event_at, a.speaker_requests.event_timezone)}
                          </div>
                        </div>
                        <span className="text-xs font-bold rounded-full px-3 py-1.5" style={{ background: gold, color: "#fff" }}>
                          {a.gate === "area_manager" ? "Review as AM →" : "Leadership sign-off →"}
                        </span>
                      </div>
                    </Card>
                  </Link>
                ) : null
              )}
            </div>
          </section>
        )}

        {data?.canSeeAll && (
          <div className="inline-flex rounded-full p-1 mb-4" style={{ background: "#fff", border: "1px solid var(--portal-line)" }}>
            {(["mine", "all"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className="text-xs font-bold rounded-full px-4 py-1.5"
                style={{ background: tab === t ? emerald : "transparent", color: tab === t ? "#fff" : dim }}
              >
                {t === "mine" ? "My requests" : "All requests"}
              </button>
            ))}
          </div>
        )}
        {!data?.canSeeAll && <Eyebrow>My requests</Eyebrow>}

        {!data && <p className="text-sm" style={{ color: faint }}>Loading…</p>}
        {data && list.length === 0 && (
          <Card>
            <p className="text-sm m-0" style={{ color: dim }}>
              No speaker requests yet. <Link href="/speaker-requests/new" style={{ color: emerald, fontWeight: 700 }}>Start one →</Link>
            </p>
          </Card>
        )}
        <div className="grid gap-3">
          {list.map((r) => (
            <RequestCard key={r.id} r={r} />
          ))}
        </div>
      </div>
    </main>
  );
}
