"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type Stats = {
  helpdesk: { open_count: number; recent: { id: string; title: string; created_at: string; submitted_by: string }[] };
  volunteer: { upcoming_events: { id: string; title: string; starts_on: string; ends_on: string; slug: string; signups: number }[] };
  fundraisers: { active: { id: string; title: string; goal: number; raised: number }[]; total_raised: number };
  clients: { total_active: number; new_this_month: number; backpacks_distributed_this_year: number };
  finance: { pending_count: number; pending_total: number; recent: { id: string; amount: number; title: string | null; created_at: string }[] };
};

const cardStyle: React.CSSProperties = {
  background: "#fff",
  border: "1px solid rgba(22,48,43,0.1)",
  borderRadius: 14,
  padding: "18px 20px",
};

const statNumStyle: React.CSSProperties = { fontSize: 28, fontWeight: 700, color: "#16302B", lineHeight: 1 };
const statLabelStyle: React.CSSProperties = { fontSize: 12, color: "rgba(22,48,43,0.5)", marginTop: 4 };

function money(n: number) {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

export default function OfficeDashboardStats({ officeId }: { officeId: string }) {
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/office-info/${officeId}/stats`)
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load office stats");
        return res.json();
      })
      .then((data) => {
        if (!cancelled) setStats(data);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load office stats");
      });
    return () => {
      cancelled = true;
    };
  }, [officeId]);

  if (error) {
    return (
      <p className="text-sm mb-8" style={{ color: "#B3261E" }}>
        {error}
      </p>
    );
  }

  if (!stats) {
    return (
      <p className="text-sm mb-8" style={{ color: "rgba(22,48,43,0.4)" }}>
        Loading office activity…
      </p>
    );
  }

  return (
    <div className="mb-10">
      <div className="grid gap-4 mb-6" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
        <div style={cardStyle}>
          <div style={statNumStyle}>{stats.helpdesk.open_count}</div>
          <div style={statLabelStyle}>Open Help Desk Tickets</div>
        </div>
        <div style={cardStyle}>
          <div style={statNumStyle}>{stats.volunteer.upcoming_events.length}</div>
          <div style={statLabelStyle}>Upcoming Volunteer Events</div>
        </div>
        <div style={cardStyle}>
          <div style={statNumStyle}>{money(stats.fundraisers.total_raised)}</div>
          <div style={statLabelStyle}>Raised — {stats.fundraisers.active.length} Active Fundraiser{stats.fundraisers.active.length === 1 ? "" : "s"}</div>
        </div>
        <div style={cardStyle}>
          <div style={statNumStyle}>{stats.clients.total_active}</div>
          <div style={statLabelStyle}>Active Clients ({stats.clients.new_this_month} new this month)</div>
        </div>
        <div style={cardStyle}>
          <div style={statNumStyle}>{stats.finance.pending_count}</div>
          <div style={statLabelStyle}>Finance Approvals Pending{stats.finance.pending_total > 0 ? ` (${money(stats.finance.pending_total)})` : ""}</div>
        </div>
      </div>

      <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))" }}>
        {stats.helpdesk.recent.length > 0 && (
          <div style={cardStyle}>
            <h3 style={{ fontSize: 13, fontWeight: 700, margin: "0 0 10px", color: "rgba(22,48,43,0.6)" }}>Recent Open Tickets</h3>
            <div className="flex flex-col gap-2">
              {stats.helpdesk.recent.map((t) => (
                <div key={t.id} className="text-sm">
                  <span style={{ fontWeight: 600 }}>{t.title}</span>
                  <span style={{ color: "rgba(22,48,43,0.45)" }}> — {t.submitted_by}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {stats.volunteer.upcoming_events.length > 0 && (
          <div style={cardStyle}>
            <h3 style={{ fontSize: 13, fontWeight: 700, margin: "0 0 10px", color: "rgba(22,48,43,0.6)" }}>Upcoming Volunteer Events</h3>
            <div className="flex flex-col gap-2">
              {stats.volunteer.upcoming_events.map((e) => (
                <div key={e.id} className="text-sm flex items-center justify-between gap-3">
                  <span style={{ fontWeight: 600 }}>{e.title}</span>
                  <span style={{ color: "rgba(22,48,43,0.45)", flexShrink: 0 }}>
                    {e.starts_on} · {e.signups} signed up
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {stats.fundraisers.active.length > 0 && (
          <div style={cardStyle}>
            <h3 style={{ fontSize: 13, fontWeight: 700, margin: "0 0 10px", color: "rgba(22,48,43,0.6)" }}>Active Fundraisers</h3>
            <div className="flex flex-col gap-2">
              {stats.fundraisers.active.map((f) => (
                <div key={f.id} className="text-sm flex items-center justify-between gap-3">
                  <span style={{ fontWeight: 600 }}>{f.title}</span>
                  <span style={{ color: "rgba(22,48,43,0.45)", flexShrink: 0 }}>
                    {money(f.raised)}
                    {f.goal ? ` of ${money(f.goal)}` : ""}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {stats.finance.recent.length > 0 && (
          <div style={cardStyle}>
            <h3 style={{ fontSize: 13, fontWeight: 700, margin: "0 0 10px", color: "rgba(22,48,43,0.6)" }}>Pending Finance Approvals</h3>
            <div className="flex flex-col gap-2">
              {stats.finance.recent.map((r) => (
                <div key={r.id} className="text-sm flex items-center justify-between gap-3">
                  <span style={{ fontWeight: 600 }}>{r.title ?? "Request"}</span>
                  <span style={{ color: "rgba(22,48,43,0.45)", flexShrink: 0 }}>{money(r.amount)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div style={cardStyle}>
          <h3 style={{ fontSize: 13, fontWeight: 700, margin: "0 0 10px", color: "rgba(22,48,43,0.6)" }}>Back to School</h3>
          <p className="text-sm" style={{ color: "rgba(22,48,43,0.6)" }}>
            {stats.clients.backpacks_distributed_this_year} backpacks distributed this school year
          </p>
        </div>
      </div>

      <p className="text-xs mt-4" style={{ color: "rgba(22,48,43,0.35)" }}>
        Need more detail? <Link href="/admin/helpdesk/manage" style={{ textDecoration: "underline" }}>Help Desk</Link>,{" "}
        <Link href="/volunteer" style={{ textDecoration: "underline" }}>Volunteer</Link>,{" "}
        <Link href="/fundraisers" style={{ textDecoration: "underline" }}>Fundraisers</Link>, and{" "}
        <Link href="/admin/finance" style={{ textDecoration: "underline" }}>Finance</Link> have the full views.
      </p>
    </div>
  );
}
