"use client";

import { useEffect, useState } from "react";
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
export type FinanceGrant = { id: string; title: string; funder_name: string | null };
export type FinanceEmployeeRef = { id: string; first_name: string; last_name: string; email: string };

// Type-ahead employee picker for POC fields - any active employee is
// a valid POC, not just finance staff, so this hits the general
// (non-admin-gated) search endpoint.
function EmployeeLookup({ value, onChange }: { value: unknown; onChange: (v: unknown) => void }) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<FinanceEmployeeRef | null>(null);
  const [results, setResults] = useState<FinanceEmployeeRef[]>([]);

  useEffect(() => {
    if (!value || (selected && selected.id === value)) return;
    // Value came from elsewhere (e.g. pre-filled on edit) without a
    // matching selected employee in local state yet - nothing to
    // resolve to a name without another fetch, so just show the id
    // until the person searches/re-selects. Acceptable for now.
  }, [value, selected]);

  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([]);
      return;
    }
    const t = setTimeout(() => {
      fetch(`/api/finance-tickets/employee-search?q=${encodeURIComponent(query)}`)
        .then((r) => r.json())
        .then((d) => setResults(d.employees ?? []));
    }, 250);
    return () => clearTimeout(t);
  }, [query]);

  return (
    <div style={{ position: "relative" }}>
      <input
        placeholder="Search by name or email…"
        value={selected ? `${selected.first_name} ${selected.last_name}` : query}
        onChange={(e) => {
          setSelected(null);
          onChange(undefined);
          setQuery(e.target.value);
        }}
        style={financeFieldInputStyle}
      />
      {!selected && results.length > 0 && (
        <div style={{ position: "absolute", top: "100%", left: 0, right: 0, background: "#fff", border: "1px solid rgba(22,48,43,0.1)", borderRadius: 10, marginTop: 4, zIndex: 10 }}>
          {results.map((r) => (
            <div
              key={r.id}
              onClick={() => {
                setSelected(r);
                setResults([]);
                onChange(r.id);
              }}
              style={{ padding: "8px 12px", fontSize: 13, cursor: "pointer" }}
            >
              {r.first_name} {r.last_name} <span style={{ color: "rgba(22,48,43,0.5)" }}>({r.email})</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

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
  grants,
}: {
  field: TicketField;
  value: unknown;
  onChange: (v: unknown) => void;
  offices: FinanceOffice[];
  pexCards: FinancePexCard[];
  grants?: FinanceGrant[];
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
      ) : field.type === "grant" ? (
        <select value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value)} style={financeFieldInputStyle}>
          <option value="">Select grant…</option>
          {(grants ?? []).map((g) => (
            <option key={g.id} value={g.id}>
              {g.title}
            </option>
          ))}
        </select>
      ) : field.type === "employee" ? (
        <EmployeeLookup value={value} onChange={onChange} />
      ) : field.type === "multitext" ? (
        <input
          placeholder="e.g. Hunger Prevention, Transitional Housing"
          value={Array.isArray(value) ? value.join(", ") : ((value as string) ?? "")}
          onChange={(e) =>
            onChange(
              e.target.value
                .split(",")
                .map((v) => v.trim())
                .filter(Boolean)
            )
          }
          style={financeFieldInputStyle}
        />
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
