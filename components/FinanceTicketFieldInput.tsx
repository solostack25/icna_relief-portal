"use client";

import type { TicketField } from "@/lib/financeTicketForms";

export const financeFieldInputStyle: React.CSSProperties = {
  border: "1.5px solid var(--portal-line, rgba(22,48,43,0.12))",
  borderRadius: 10,
  padding: "9px 12px",
  fontSize: 14,
  background: "#fff",
  outline: "none",
  width: "100%",
};
export const financeFieldLabelStyle: React.CSSProperties = { fontSize: 13, fontWeight: 600, marginBottom: 6 };

export type FinanceOffice = { id: string; field_office: string };
export type FinancePexCard = { id: string; last4: string | null };

// Shared single-field renderer for finance ticket forms - used by
// both the intake form (app/finance-tickets/new) and the resubmit
// edit form (app/finance-tickets/[id]), so a field never renders
// differently between "submitting for the first time" and "editing
// after a change request".
export default function FinanceTicketFieldInput({
  field,
  value,
  onChange,
  offices,
  pexCards,
}: {
  field: TicketField;
  value: unknown;
  onChange: (v: unknown) => void;
  offices: FinanceOffice[];
  pexCards: FinancePexCard[];
}) {
  if (field.type === "checkbox") {
    return (
      <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13 }}>
        <input type="checkbox" checked={!!value} onChange={(e) => onChange(e.target.checked)} />
        {field.label}
      </label>
    );
  }
  return (
    <div>
      <div style={financeFieldLabelStyle}>
        {field.label}
        {field.required && " *"}
      </div>
      {field.type === "textarea" ? (
        <textarea value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value)} style={financeFieldInputStyle} rows={3} />
      ) : field.type === "select" ? (
        <select value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value)} style={financeFieldInputStyle}>
          <option value="">Select…</option>
          {field.options?.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      ) : field.type === "office" ? (
        <select value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value)} style={financeFieldInputStyle}>
          <option value="">Select office…</option>
          {offices.map((o) => (
            <option key={o.id} value={o.id}>
              {o.field_office}
            </option>
          ))}
        </select>
      ) : field.type === "pex_card" ? (
        <select value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value)} style={financeFieldInputStyle}>
          <option value="">Select your card…</option>
          {pexCards.map((c) => (
            <option key={c.id} value={c.id}>
              •••• {c.last4}
            </option>
          ))}
          {pexCards.length === 0 && <option disabled>No cards on file — contact Finance</option>}
        </select>
      ) : (
        <input
          type={field.type === "number" ? "number" : field.type === "date" ? "date" : "text"}
          value={(value as string) ?? ""}
          onChange={(e) => onChange(field.type === "number" ? Number(e.target.value) : e.target.value)}
          style={financeFieldInputStyle}
        />
      )}
    </div>
  );
}
