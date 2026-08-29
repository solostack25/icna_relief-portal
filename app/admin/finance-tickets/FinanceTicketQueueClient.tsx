"use client";

import { useEffect, useState } from "react";
import { CATEGORY_LABELS } from "@/lib/financeTicketForms";
import FinanceTicketDetailView from "@/components/FinanceTicketDetailView";

type Ticket = {
  id: string;
  ticket_number: string;
  title: string;
  category: string;
  total: number;
  status: string;
  priority: string;
  grant_eligible: boolean;
  submitted_at: string | null;
  technician_id: string | null;
  requestor: { first_name: string; last_name: string; email: string } | null;
  technician: { first_name: string; last_name: string } | null;
};

const STATUS_OPTIONS = ["open", "pending", "in_progress", "on_hold", "fixing", "processed", "denied", "duplicate"];
const STATUS_COLOR: Record<string, string> = {
  open: "#1F6F54",
  pending: "#A57420",
  in_progress: "#3B6EA5",
  on_hold: "#B5566B",
  fixing: "#B5566B",
  processed: "#16302B",
  denied: "#B5566B",
  duplicate: "#999",
};

const cardStyle: React.CSSProperties = { background: "#fff", borderRadius: 16, padding: 16, boxShadow: "0 3px 12px rgba(22,48,43,0.06)" };
const inputStyle: React.CSSProperties = {
  border: "1.5px solid var(--portal-line, rgba(22,48,43,0.12))",
  borderRadius: 8,
  padding: "6px 10px",
  fontSize: 13,
  background: "#fff",
  outline: "none",
};
const pillButton: React.CSSProperties = {
  border: "1.5px solid rgba(22,48,43,0.12)",
  background: "#fff",
  color: "rgba(22,48,43,0.75)",
  borderRadius: 999,
  padding: "6px 14px",
  fontSize: 12,
  fontWeight: 600,
  cursor: "pointer",
};

export default function FinanceTicketQueueClient() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [saving, setSaving] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [expandedDetail, setExpandedDetail] = useState<{ detail: unknown; approvals?: { approval_level: number; chain_person_name: string; approval_status: string; comments: string | null }[] } | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  async function load() {
    const res = await fetch("/api/admin/finance-tickets");
    const data = await res.json();
    setTickets(data.tickets ?? []);
  }
  useEffect(() => {
    load();
  }, []);

  async function toggleExpand(id: string) {
    if (expandedId === id) {
      setExpandedId(null);
      setExpandedDetail(null);
      return;
    }
    setExpandedId(id);
    setLoadingDetail(true);
    try {
      const res = await fetch(`/api/admin/finance-tickets/${id}/detail`);
      const data = await res.json();
      setExpandedDetail(data);
    } finally {
      setLoadingDetail(false);
    }
  }

  async function assignToMe(id: string) {
    setSaving(id);
    try {
      await fetch(`/api/admin/finance-tickets/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assign_to_me: true }),
      });
      await load();
    } finally {
      setSaving(null);
    }
  }

  async function setStatus(id: string, status: string) {
    setSaving(id);
    try {
      await fetch(`/api/admin/finance-tickets/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      await load();
    } finally {
      setSaving(null);
    }
  }

  const filtered = statusFilter ? tickets.filter((t) => t.status === statusFilter) : tickets;

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button onClick={() => setStatusFilter("")} style={{ ...pillButton, ...(statusFilter === "" ? { borderColor: "#8A5FB5", color: "#8A5FB5" } : {}) }}>
          All
        </button>
        {STATUS_OPTIONS.map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            style={{ ...pillButton, ...(statusFilter === s ? { borderColor: "#8A5FB5", color: "#8A5FB5" } : {}) }}
          >
            {s.replace("_", " ")}
          </button>
        ))}
      </div>

      <div style={{ display: "grid", gap: 10 }}>
        {filtered.map((t) => (
          <div key={t.id} style={cardStyle}>
            <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: 14 }}>{t.title}</div>
                <div style={{ fontSize: 12, color: "rgba(22,48,43,0.5)" }}>
                  {t.ticket_number} · {CATEGORY_LABELS[t.category] ?? t.category} · {t.requestor ? `${t.requestor.first_name} ${t.requestor.last_name}` : "Unknown"}
                  {t.grant_eligible ? " · Grant Eligible" : ""}
                </div>
                <div style={{ fontSize: 13, color: "rgba(22,48,43,0.6)", marginTop: 4 }}>${t.total?.toLocaleString?.() ?? t.total}</div>
                {t.technician && <div style={{ fontSize: 12, color: "rgba(22,48,43,0.5)" }}>Assigned: {t.technician.first_name} {t.technician.last_name}</div>}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-end" }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: STATUS_COLOR[t.status] ?? "#666" }}>{t.status.replace("_", " ").toUpperCase()}</span>
                <div style={{ display: "flex", gap: 6 }}>
                  <button onClick={() => toggleExpand(t.id)} style={pillButton}>
                    {expandedId === t.id ? "Hide" : "Details"}
                  </button>
                  {!t.technician_id && (
                    <button onClick={() => assignToMe(t.id)} disabled={saving === t.id} style={pillButton}>
                      Assign to me
                    </button>
                  )}
                  <select value={t.status} onChange={(e) => setStatus(t.id, e.target.value)} disabled={saving === t.id} style={inputStyle}>
                    {STATUS_OPTIONS.map((s) => (
                      <option key={s} value={s}>
                        {s.replace("_", " ")}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
            {expandedId === t.id && (
              <div style={{ borderTop: "1px solid rgba(22,48,43,0.08)", marginTop: 12, paddingTop: 12 }}>
                {loadingDetail ? (
                  <div style={{ fontSize: 13, color: "rgba(22,48,43,0.5)" }}>Loading…</div>
                ) : (
                  expandedDetail && (
                    <div style={{ display: "grid", gap: 12 }}>
                      <FinanceTicketDetailView category={t.category} detail={expandedDetail.detail} />
                      {expandedDetail.approvals && (
                        <div>
                          <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 4 }}>Approval Chain</div>
                          {expandedDetail.approvals.map((a, i) => (
                            <div key={i} style={{ fontSize: 12, color: "rgba(22,48,43,0.6)" }}>
                              Level {a.approval_level} — {a.chain_person_name}: {a.approval_status}
                              {a.comments ? ` ("${a.comments}")` : ""}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                )}
              </div>
            )}
          </div>
        ))}
        {filtered.length === 0 && <div style={{ fontSize: 14, color: "rgba(22,48,43,0.5)" }}>No tickets match this filter.</div>}
      </div>
    </div>
  );
}
