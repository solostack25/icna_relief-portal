"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import FinanceTicketDetailView from "@/components/FinanceTicketDetailView";
import FinanceTicketFieldInput, { type FinanceOffice, type FinancePexCard } from "@/components/FinanceTicketFieldInput";
import { CATEGORY_LABELS, SINGLE_RECORD_CATEGORIES } from "@/lib/financeTicketForms";

type Data = {
  ticket: {
    id: string;
    ticket_number: string;
    title: string;
    category: string;
    total: number;
    status: string;
    priority: string;
    grant_eligible: boolean;
    submitted_at: string | null;
  };
  detail: unknown;
  approvals: { approval_level: number; chain_person_name: string; approval_status: string; decision_date: string | null; comments: string | null }[];
};

const cardStyle: React.CSSProperties = { background: "#fff", borderRadius: 20, padding: 20, boxShadow: "0 3px 12px rgba(22,48,43,0.06)" };
const pillButton = (active: boolean): React.CSSProperties => ({
  border: active ? "1.5px solid #8A5FB5" : "1.5px solid rgba(22,48,43,0.12)",
  background: active ? "rgba(138,95,181,0.1)" : "#fff",
  color: active ? "#8A5FB5" : "rgba(22,48,43,0.75)",
  borderRadius: 999,
  padding: "9px 18px",
  fontSize: 13,
  fontWeight: 600,
  cursor: "pointer",
});
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

export default function FinanceTicketDetailClient({ id, offices }: { id: string; offices: FinanceOffice[] }) {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [resubmitting, setResubmitting] = useState(false);
  const [resubmitted, setResubmitted] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editedDetail, setEditedDetail] = useState<Record<string, unknown>>({});
  const [pexCards, setPexCards] = useState<FinancePexCard[]>([]);

  async function load() {
    const res = await fetch(`/api/finance-tickets/${id}`);
    const body = await res.json();
    if (!res.ok) {
      setError(body.error ?? "Couldn't load ticket");
      return;
    }
    setData(body);
    setEditedDetail((body.detail as Record<string, unknown>) ?? {});
  }
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    if (data?.ticket.category === "pex_recharge_request") {
      fetch("/api/finance-tickets/pex-cards")
        .then((r) => r.json())
        .then((d) => setPexCards(d.cards ?? []))
        .catch(() => {});
    }
  }, [data?.ticket.category]);

  async function resubmit(withEdits: boolean) {
    setResubmitting(true);
    try {
      const res = await fetch(`/api/finance-tickets/${id}/resubmit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(withEdits ? { detail: editedDetail } : {}),
      });
      const body = await res.json();
      if (!res.ok) {
        setError(body.error ?? "Couldn't resubmit");
        return;
      }
      setResubmitted(true);
      await load();
    } finally {
      setResubmitting(false);
    }
  }

  if (error) return <div style={{ color: "#B5566B" }}>{error}</div>;
  if (!data) return <div style={{ color: "rgba(22,48,43,0.5)" }}>Loading…</div>;

  const { ticket } = data;
  const editableConfig = SINGLE_RECORD_CATEGORIES[ticket.category];
  const canEditInline = ticket.status === "fixing" && !!editableConfig;

  return (
    <>
      <Link href="/finance-tickets" style={{ fontSize: 13, color: "rgba(22,48,43,0.5)" }}>
        ← All tickets
      </Link>

      <div style={{ ...cardStyle, marginTop: 16, display: "grid", gap: 16 }}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 600, color: "rgba(22,48,43,0.5)" }}>
            {ticket.ticket_number} · {CATEGORY_LABELS[ticket.category] ?? ticket.category}
          </div>
          <div style={{ fontSize: 20, fontWeight: 600 }}>{ticket.title}</div>
          <div style={{ fontSize: 22, fontWeight: 700, marginTop: 4 }}>${ticket.total.toLocaleString()}</div>
          <div style={{ fontSize: 13, fontWeight: 700, color: STATUS_COLOR[ticket.status] ?? "#666", marginTop: 6 }}>
            {ticket.status.replace("_", " ").toUpperCase()}
          </div>
        </div>

        {!editing && (
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>Details</div>
            <FinanceTicketDetailView category={ticket.category} detail={data.detail} />
          </div>
        )}

        {editing && editableConfig && (
          <div style={{ display: "grid", gap: 12 }}>
            <div style={{ fontSize: 13, fontWeight: 700 }}>Edit Before Resubmitting</div>
            {editableConfig.fields.map((f) => (
              <FinanceTicketFieldInput
                key={f.key}
                field={f}
                value={editedDetail[f.key]}
                onChange={(v) => setEditedDetail((d) => ({ ...d, [f.key]: v }))}
                offices={offices}
                pexCards={pexCards}
              />
            ))}
          </div>
        )}

        {data.approvals.length > 0 && (
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>Approval Progress</div>
            <div style={{ display: "grid", gap: 4 }}>
              {data.approvals.map((a, i) => (
                <div key={i} style={{ fontSize: 13, color: "rgba(22,48,43,0.6)" }}>
                  Level {a.approval_level} — {a.chain_person_name}: <strong>{a.approval_status}</strong>
                  {a.comments ? ` ("${a.comments}")` : ""}
                </div>
              ))}
            </div>
          </div>
        )}

        {ticket.status === "fixing" && !resubmitted && (
          <div style={{ borderTop: "1px solid rgba(22,48,43,0.08)", paddingTop: 16 }}>
            <p style={{ fontSize: 13, color: "rgba(22,48,43,0.6)", marginBottom: 12 }}>
              An approver requested changes — see their note above. Once you've addressed it, resubmit for approval; it
              picks back up at the same approval level rather than starting the chain over.
              {!editableConfig && " This ticket type doesn't support inline editing here — contact Finance if something needs to change, otherwise resubmit as-is."}
            </p>
            <div style={{ display: "flex", gap: 10 }}>
              {canEditInline && !editing && (
                <button onClick={() => setEditing(true)} style={pillButton(false)}>
                  Edit Details
                </button>
              )}
              {editing ? (
                <>
                  <button onClick={() => resubmit(true)} disabled={resubmitting} style={pillButton(true)}>
                    {resubmitting ? "Saving…" : "Save & Resubmit"}
                  </button>
                  <button onClick={() => setEditing(false)} style={pillButton(false)}>
                    Cancel
                  </button>
                </>
              ) : (
                <button onClick={() => resubmit(false)} disabled={resubmitting} style={pillButton(true)}>
                  {resubmitting ? "Resubmitting…" : "Resubmit for Approval"}
                </button>
              )}
            </div>
          </div>
        )}
        {resubmitted && <div style={{ fontSize: 13, color: "#1F6F54" }}>Resubmitted — the approver has been notified.</div>}
      </div>
    </>
  );
}
