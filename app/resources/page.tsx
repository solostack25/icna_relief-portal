"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { card, dim, DaysPill, Empty, fmtDate, H1, ink, line } from "./ui";
import { REQUEST_STATUSES } from "@/lib/resources/schema";

type Dash = {
  counts: Record<string, number>;
  expiring: { kind: string; title: string; office: string; date: string; days: number; href: string }[];
  openByStatus: Record<string, number>;
  openTotal: number;
  activity: { id: number; summary: string; at: string; office: string; href: string | null }[];
};

export default function ResourcesDashboard() {
  const [d, setD] = useState<Dash | null>(null);
  const [err, setErr] = useState("");
  useEffect(() => {
    fetch("/api/resources/dashboard")
      .then(async (r) => (r.ok ? r.json() : Promise.reject((await r.json()).error)))
      .then(setD)
      .catch((e) => setErr(String(e)));
  }, []);

  if (err) return <Empty>{err}</Empty>;
  if (!d) return <Empty>Loading…</Empty>;
  const soon = d.expiring.filter((e) => e.days <= 30).length;

  return (
    <div>
      <H1>Vehicles, properties &amp; insurance</H1>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 12, marginBottom: 18 }}>
        {[
          { label: "Active vehicles", n: d.counts.vehicles, href: "/resources/vehicles" },
          { label: "Active properties", n: d.counts.properties, href: "/resources/properties" },
          { label: "Approved drivers", n: d.counts.drivers, href: "/resources/drivers" },
          { label: "Open insurance requests", n: d.openTotal, href: "/resources/requests" },
          { label: "Expiring in 30 days", n: soon, href: "#expiring", warn: soon > 0 },
        ].map((s) => (
          <Link key={s.label} href={s.href} style={{ ...card, display: "block", borderTop: `4px solid ${s.warn ? "#D97706" : "var(--portal-emerald, #1F6F54)"}` }}>
            <div style={{ fontFamily: "'Fraunces', serif", fontSize: 32, fontWeight: 600, color: ink, lineHeight: 1 }}>{s.n ?? 0}</div>
            <div style={{ fontSize: 13, color: dim, marginTop: 6 }}>{s.label}</div>
          </Link>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 3fr) minmax(0, 2fr)", gap: 16 }} className="res-dash-grid">
        <section id="expiring" style={card}>
          <h2 style={{ fontSize: 16, margin: "0 0 10px", color: ink }}>Expiring in the next 90 days</h2>
          {d.expiring.length === 0 ? (
            <Empty>Nothing expiring soon.</Empty>
          ) : (
            <div style={{ display: "grid" }}>
              {d.expiring.map((e, i) => (
                <Link key={i} href={e.href} style={{ display: "flex", justifyContent: "space-between", gap: 10, padding: "10px 0", borderTop: i ? `1px solid ${line}` : 0, color: ink }}>
                  <span>
                    <b style={{ fontSize: 14 }}>{e.title}</b>
                    <span style={{ display: "block", fontSize: 12, color: dim }}>
                      {e.kind} · {e.office} · {fmtDate(e.date)}
                    </span>
                  </span>
                  <DaysPill days={e.days} />
                </Link>
              ))}
            </div>
          )}
        </section>

        <div style={{ display: "grid", gap: 16, alignContent: "start" }}>
          <section style={card}>
            <h2 style={{ fontSize: 16, margin: "0 0 10px", color: ink }}>Open insurance requests</h2>
            {d.openTotal === 0 ? (
              <Empty>None open.</Empty>
            ) : (
              REQUEST_STATUSES.filter((s) => d.openByStatus[s.value]).map((s) => (
                <Link key={s.value} href={`/resources/requests?status=${s.value}`} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", fontSize: 14, color: ink }}>
                  <span style={{ color: s.color, fontWeight: 600 }}>{s.label}</span>
                  <b>{d.openByStatus[s.value]}</b>
                </Link>
              ))
            )}
          </section>
          <section style={card}>
            <h2 style={{ fontSize: 16, margin: "0 0 10px", color: ink }}>Recent changes</h2>
            {d.activity.length === 0 ? (
              <Empty>No activity yet.</Empty>
            ) : (
              d.activity.map((a) => (
                <div key={a.id} style={{ padding: "6px 0", fontSize: 13, borderTop: `1px solid ${line}` }}>
                  {a.href ? <Link href={a.href} style={{ color: ink, fontWeight: 600 }}>{a.summary}</Link> : <b>{a.summary}</b>}
                  <div style={{ color: dim, fontSize: 12 }}>
                    {a.office} · {fmtDate(a.at)}
                  </div>
                </div>
              ))
            )}
          </section>
        </div>
      </div>
      <style>{`@media (max-width: 860px) { .res-dash-grid { grid-template-columns: 1fr !important; } }`}</style>
    </div>
  );
}
