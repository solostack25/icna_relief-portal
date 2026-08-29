"use client";

// Shared detail renderer for a finance ticket's type-specific detail
// (line items for Credit Card / Mileage, single record for the rest).
// Used by both the approver token page and the finance queue's
// expanded view, so the two never drift on how a ticket is displayed.

const HIDDEN_KEYS = new Set(["id", "created_at", "requestor_id", "statement_id", "batch_id"]);

function toLabel(key: string) {
  return key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function FinanceTicketDetailFields({ row }: { row: Record<string, unknown> }) {
  const entries = Object.entries(row).filter(([k, v]) => !HIDDEN_KEYS.has(k) && v !== null && v !== "" && v !== false);
  if (entries.length === 0) return null;
  return (
    <div style={{ fontSize: 13, color: "rgba(22,48,43,0.6)", display: "grid", gap: 2 }}>
      {entries.map(([k, v]) => (
        <div key={k}>
          <span style={{ color: "rgba(22,48,43,0.4)" }}>{toLabel(k)}:</span> {typeof v === "boolean" ? "Yes" : String(v)}
        </div>
      ))}
    </div>
  );
}

export default function FinanceTicketDetailView({ category, detail }: { category: string; detail: unknown }) {
  if (!detail) return <div style={{ fontSize: 13, color: "rgba(22,48,43,0.4)" }}>No detail on file.</div>;

  if (category === "credit_card_reimbursement") {
    const d = detail as { statement: Record<string, unknown> | null; transactions: Record<string, unknown>[] };
    return (
      <div style={{ display: "grid", gap: 10 }}>
        <div style={{ fontSize: 13, fontWeight: 700 }}>Statement</div>
        {d.statement && <FinanceTicketDetailFields row={d.statement} />}
        <div style={{ fontSize: 13, fontWeight: 700, marginTop: 6 }}>Transactions ({d.transactions?.length ?? 0})</div>
        {(d.transactions ?? []).map((t, i) => (
          <div key={i} style={{ borderTop: "1px solid rgba(22,48,43,0.08)", paddingTop: 8 }}>
            <FinanceTicketDetailFields row={t} />
          </div>
        ))}
      </div>
    );
  }

  if (category === "mileage_reimbursement") {
    const d = detail as { batch: Record<string, unknown> | null; trips: Record<string, unknown>[] };
    return (
      <div style={{ display: "grid", gap: 10 }}>
        <div style={{ fontSize: 13, fontWeight: 700 }}>Mileage Batch</div>
        {d.batch && <FinanceTicketDetailFields row={d.batch} />}
        <div style={{ fontSize: 13, fontWeight: 700, marginTop: 6 }}>Trips ({d.trips?.length ?? 0})</div>
        {(d.trips ?? []).map((t, i) => (
          <div key={i} style={{ borderTop: "1px solid rgba(22,48,43,0.08)", paddingTop: 8 }}>
            <FinanceTicketDetailFields row={t} />
          </div>
        ))}
      </div>
    );
  }

  return <FinanceTicketDetailFields row={detail as Record<string, unknown>} />;
}
