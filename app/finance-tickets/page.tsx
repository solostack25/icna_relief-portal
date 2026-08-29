"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import { CATEGORY_LABELS } from "@/lib/financeTicketForms";

type Ticket = {
  id: string;
  ticket_number: string;
  title: string;
  category: string;
  total: number;
  status: string;
  priority: string;
  submitted_at: string | null;
};

const STATUS_COLOR: Record<string, string> = {
  draft: "#999",
  open: "#1F6F54",
  pending: "#A57420",
  in_progress: "#3B6EA5",
  on_hold: "#B5566B",
  fixing: "#B5566B",
  processed: "#16302B",
  denied: "#B5566B",
  duplicate: "#999",
};

export default function FinanceTicketsPage() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    fetch("/api/finance-tickets")
      .then((r) => r.json())
      .then((d) => {
        setTickets(d.tickets ?? []);
        setLoaded(true);
      });
  }, []);

  return (
    <div className="max-w-3xl mx-auto p-6">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <h1 style={{ fontFamily: "'Fraunces', serif", fontStyle: "italic", fontWeight: 500, fontSize: 28, margin: 0 }}>
          Finance Tickets
        </h1>
        <Link
          href="/finance-tickets/new"
          style={{
            border: "1.5px solid #8A5FB5",
            background: "rgba(138,95,181,0.1)",
            color: "#8A5FB5",
            borderRadius: 999,
            padding: "8px 16px",
            fontSize: 13,
            fontWeight: 600,
          }}
        >
          + New Ticket
        </Link>
      </div>

      {loaded && tickets.length === 0 && <div style={{ fontSize: 14, color: "rgba(22,48,43,0.5)", marginTop: 20 }}>No tickets yet.</div>}

      <div style={{ display: "grid", gap: 10, marginTop: 20 }}>
        {tickets.map((t) => (
          <Link key={t.id} href={`/finance-tickets/${t.id}`} style={{ background: "#fff", borderRadius: 16, padding: 16, boxShadow: "0 3px 12px rgba(22,48,43,0.06)", display: "block" }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: 14, color: "#16302B" }}>{t.title}</div>
                <div style={{ fontSize: 12, color: "rgba(22,48,43,0.5)" }}>
                  {t.ticket_number} · {CATEGORY_LABELS[t.category] ?? t.category}
                </div>
              </div>
              <div style={{ fontSize: 12, fontWeight: 700, color: STATUS_COLOR[t.status] ?? "#666" }}>{t.status.replace("_", " ").toUpperCase()}</div>
            </div>
            <div style={{ fontSize: 13, color: "rgba(22,48,43,0.6)", marginTop: 4 }}>${t.total.toLocaleString()}</div>
          </Link>
        ))}
      </div>
    </div>
  );
}
