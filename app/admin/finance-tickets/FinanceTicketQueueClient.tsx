"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CATEGORY_LABELS } from "@/lib/financeTicketForms";
import {
  FINANCE_TICKET_STATUS_COLORS,
  financeTicketStatusLabel,
  FINANCE_APPROVAL_STATUS_COLORS,
  financeApprovalStatusLabel,
} from "@/lib/financeTicketStatus";
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
  created_at: string;
  technician_id: string | null;
  requestor: { first_name: string; last_name: string; email: string } | null;
  technician: { first_name: string; last_name: string } | null;
  waiting_on: { level: number; name: string; title: string | null; covering: boolean; since: string | null } | null;
};
type Step = {
  approval_level: number;
  chain_person_name: string;
  chain_person_job_title: string | null;
  acting_as_delegate_for_email: string | null;
  approval_status: string;
  decision_date: string | null;
  comments: string | null;
};

const STATUS_OPTIONS = ["open", "pending", "in_progress", "on_hold", "fixing", "processed", "denied", "duplicate"];
// Quick views across the one list (replaces the separate Approval Chains screen)
const VIEWS = [
  { key: "active", label: "Active", test: (t: Ticket) => !["processed", "denied", "duplicate"].includes(t.status) },
  { key: "waiting", label: "Waiting on approval", test: (t: Ticket) => !!t.waiting_on },
  { key: "to_pay", label: "Ready to process", test: (t: Ticket) => !t.waiting_on && ["open", "in_progress", "on_hold"].includes(t.status) },
  { key: "mine", label: "Assigned to me", test: () => true },
  { key: "all", label: "All", test: () => true },
] as const;

const cardStyle: React.CSSProperties = { background: "#fff", borderRadius: 16, padding: 16, boxShadow: "0 3px 12px rgba(22,48,43,0.06)" };
const inputStyle: React.CSSProperties = {
  border: "1.5px solid var(--portal-line, rgba(22,48,43,0.12))",
  borderRadius: 8,
  padding: "6px 10px",
  fontSize: 13,
  background: "#fff",
  outline: "none",
};
const pill = (active = false): React.CSSProperties => ({
  border: active ? "1.5px solid #8A5FB5" : "1.5px solid rgba(22,48,43,0.12)",
  background: active ? "rgba(138,95,181,0.1)" : "#fff",
  color: active ? "#8A5FB5" : "rgba(22,48,43,0.75)",
  borderRadius: 999,
  padding: "6px 14px",
  fontSize: 12,
  fontWeight: 600,
  cursor: "pointer",
});

function daysSince(iso: string | null) {
  if (!iso) return 0;
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
}

export default function FinanceTicketQueueClient({ currentEmployeeId }: { currentEmployeeId: string | null }) {
  const [tickets, setTickets] = useState<Ticket[] | null>(null);
  const [view, setView] = useState<(typeof VIEWS)[number]["key"]>("active");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [query, setQuery] = useState("");
  const [saving, setSaving] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [expandedDetail, setExpandedDetail] = useState<{ detail: unknown; approvals?: Step[] } | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const res = await fetch("/api/admin/finance-tickets");
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return setError(data.error ?? "Couldn't load tickets");
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
      setExpandedDetail(await res.json());
    } finally {
      setLoadingDetail(false);
    }
  }

  async function patch(id: string, body: Record<string, unknown>) {
    setSaving(id);
    try {
      await fetch(`/api/admin/finance-tickets/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      await load();
    } finally {
      setSaving(null);
    }
  }

  if (error) return <p style={{ fontSize: 13, color: "#B5566B" }}>{error}</p>;
  if (!tickets) return <p style={{ fontSize: 13, color: "rgba(22,48,43,0.5)" }}>Loading…</p>;

  const v = VIEWS.find((x) => x.key === view)!;
  const q = query.trim().toLowerCase();
  const filtered = tickets.filter(
    (t) =>
      v.test(t) &&
      (view !== "mine" || (currentEmployeeId && t.technician_id === currentEmployeeId)) &&
      (!statusFilter || t.status === statusFilter) &&
      (!q ||
        [t.title, t.ticket_number, t.requestor?.first_name, t.requestor?.last_name, t.requestor?.email, t.waiting_on?.name]
          .filter(Boolean)
          .some((s) => String(s).toLowerCase().includes(q)))
  );
  const countFor = (k: (typeof VIEWS)[number]["key"]) => {
    const vv = VIEWS.find((x) => x.key === k)!;
    return tickets.filter((t) => vv.test(t) && (k !== "mine" || (currentEmployeeId && t.technician_id === currentEmployeeId))).length;
  };

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {VIEWS.map((x) => (
          <button key={x.key} onClick={() => setView(x.key)} style={pill(view === x.key)}>
            {x.label} <span style={{ opacity: 0.6 }}>{countFor(x.key)}</span>
          </button>
        ))}
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search ticket #, title, requestor or approver…"
          style={{ ...inputStyle, flex: "1 1 260px", padding: "8px 12px" }}
        />
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={inputStyle} aria-label="Status">
          <option value="">Any status</option>
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {financeTicketStatusLabel(s)}
            </option>
          ))}
        </select>
      </div>

      <div style={{ display: "grid", gap: 10 }}>
        {filtered.map((t) => {
          const waitDays = daysSince(t.waiting_on?.since ?? null);
          return (
            <div key={t.id} style={cardStyle}>
              <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
                <div style={{ minWidth: 0 }}>
                  <Link href={`/finance-tickets/${t.id}`} style={{ fontWeight: 600, fontSize: 14, color: "inherit" }}>
                    {t.title}
                  </Link>
                  <div style={{ fontSize: 12, color: "rgba(22,48,43,0.5)" }}>
                    {t.ticket_number} · {CATEGORY_LABELS[t.category] ?? t.category} · {t.requestor ? `${t.requestor.first_name} ${t.requestor.last_name}` : "Unknown"}
                    {t.grant_eligible ? " · Grant eligible" : ""}
                  </div>
                  <div style={{ fontSize: 13, color: "rgba(22,48,43,0.7)", marginTop: 4 }}>${Number(t.total ?? 0).toLocaleString()}</div>
                  {t.waiting_on && (
                    <div style={{ fontSize: 12, marginTop: 4, color: "#7A5A17" }}>
                      ⏳ Waiting on {t.waiting_on.name}
                      {t.waiting_on.title ? ` (${t.waiting_on.title})` : ""}
                      {t.waiting_on.covering ? " — covering" : ""} · level {t.waiting_on.level}
                      {waitDays >= 1 ? ` · ${waitDays} day${waitDays === 1 ? "" : "s"}` : ""}
                      {waitDays >= 2 ? " ⚠" : ""}
                    </div>
                  )}
                  {t.technician && (
                    <div style={{ fontSize: 12, color: "rgba(22,48,43,0.5)" }}>
                      Processing: {t.technician.first_name} {t.technician.last_name}
                    </div>
                  )}
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-end" }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: FINANCE_TICKET_STATUS_COLORS[t.status] ?? "#666" }}>{financeTicketStatusLabel(t.status)}</span>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
                    <button onClick={() => toggleExpand(t.id)} style={pill()}>
                      {expandedId === t.id ? "Hide" : "Details & approvals"}
                    </button>
                    {!t.technician_id && (
                      <button onClick={() => patch(t.id, { assign_to_me: true })} disabled={saving === t.id} style={pill()}>
                        Assign to me
                      </button>
                    )}
                    <select value={t.status} onChange={(e) => patch(t.id, { status: e.target.value })} disabled={saving === t.id} style={inputStyle} aria-label="Change status">
                      {STATUS_OPTIONS.map((s) => (
                        <option key={s} value={s}>
                          {financeTicketStatusLabel(s)}
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
                        <div>
                          <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 4 }}>Approval chain</div>
                          {(expandedDetail.approvals ?? []).length === 0 && (
                            <div style={{ fontSize: 12, color: "rgba(22,48,43,0.45)" }}>No approval steps recorded.</div>
                          )}
                          {[...(expandedDetail.approvals ?? [])]
                            .sort((a, b) => a.approval_level - b.approval_level)
                            .map((a, i) => (
                              <div key={i} style={{ display: "flex", justifyContent: "space-between", gap: 12, fontSize: 12, padding: "2px 0" }}>
                                <span style={{ color: "rgba(22,48,43,0.75)" }}>
                                  {a.approval_level}. {a.chain_person_name}
                                  {a.chain_person_job_title ? ` (${a.chain_person_job_title})` : ""}
                                  {a.acting_as_delegate_for_email ? " — covering" : ""}
                                  {a.comments ? ` · “${a.comments}”` : ""}
                                </span>
                                <span style={{ fontWeight: 600, whiteSpace: "nowrap", color: FINANCE_APPROVAL_STATUS_COLORS[a.approval_status] ?? "#8A5FB5" }}>
                                  {financeApprovalStatusLabel(a.approval_status)}
                                  {a.decision_date ? ` · ${new Date(a.decision_date).toLocaleDateString()}` : ""}
                                </span>
                              </div>
                            ))}
                        </div>
                      </div>
                    )
                  )}
                </div>
              )}
            </div>
          );
        })}
        {filtered.length === 0 && <div style={{ fontSize: 14, color: "rgba(22,48,43,0.5)" }}>No tickets match.</div>}
      </div>
    </div>
  );
}
