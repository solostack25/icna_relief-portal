"use client";

import { useEffect, useState } from "react";

type Office = { id: string; field_office: string };
type EmployeeResult = { id: string; first_name: string; last_name: string; email: string };
type Card = {
  id: string;
  last4: string | null;
  job_title: string | null;
  grant_eligible: boolean;
  assigned_date: string | null;
  employee: { first_name: string; last_name: string; email: string } | null;
  office: { field_office: string } | null;
};

const inputStyle: React.CSSProperties = {
  border: "1.5px solid var(--portal-line, rgba(22,48,43,0.12))",
  borderRadius: 10,
  padding: "9px 12px",
  fontSize: 14,
  background: "#fff",
  outline: "none",
};
const cardStyle: React.CSSProperties = { background: "#fff", borderRadius: 16, padding: 16, boxShadow: "0 3px 12px rgba(22,48,43,0.06)" };

export default function PexCardsAdminClient({ offices }: { offices: Office[] }) {
  const [cards, setCards] = useState<Card[]>([]);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<EmployeeResult[]>([]);
  const [selectedEmployee, setSelectedEmployee] = useState<EmployeeResult | null>(null);
  const [officeId, setOfficeId] = useState("");
  const [last4, setLast4] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [grantEligible, setGrantEligible] = useState(false);
  const [saving, setSaving] = useState(false);

  async function load() {
    const res = await fetch("/api/admin/finance-tickets/pex-cards");
    const data = await res.json();
    setCards(data.cards ?? []);
  }
  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([]);
      return;
    }
    const t = setTimeout(() => {
      fetch(`/api/admin/finance-tickets/employee-search?q=${encodeURIComponent(query)}`)
        .then((r) => r.json())
        .then((d) => setResults(d.employees ?? []));
    }, 250);
    return () => clearTimeout(t);
  }, [query]);

  async function createCard() {
    if (!selectedEmployee || !last4.trim()) return;
    setSaving(true);
    try {
      await fetch("/api/admin/finance-tickets/pex-cards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ employee_id: selectedEmployee.id, office_id: officeId || null, last4: last4.trim(), job_title: jobTitle || null, grant_eligible: grantEligible }),
      });
      setSelectedEmployee(null);
      setQuery("");
      setLast4("");
      setJobTitle("");
      setGrantEligible(false);
      await load();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ display: "grid", gap: 24 }}>
      <div style={{ ...cardStyle, display: "grid", gap: 12 }}>
        <div style={{ fontSize: 14, fontWeight: 700 }}>Issue a Card</div>
        <div style={{ position: "relative" }}>
          <input
            placeholder="Search employee by name or email…"
            value={selectedEmployee ? `${selectedEmployee.first_name} ${selectedEmployee.last_name}` : query}
            onChange={(e) => {
              setSelectedEmployee(null);
              setQuery(e.target.value);
            }}
            style={inputStyle}
          />
          {!selectedEmployee && results.length > 0 && (
            <div style={{ position: "absolute", top: "100%", left: 0, right: 0, background: "#fff", border: "1px solid rgba(22,48,43,0.1)", borderRadius: 10, marginTop: 4, zIndex: 10 }}>
              {results.map((r) => (
                <div
                  key={r.id}
                  onClick={() => {
                    setSelectedEmployee(r);
                    setResults([]);
                  }}
                  style={{ padding: "8px 12px", fontSize: 13, cursor: "pointer" }}
                >
                  {r.first_name} {r.last_name} <span style={{ color: "rgba(22,48,43,0.5)" }}>({r.email})</span>
                </div>
              ))}
            </div>
          )}
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <input placeholder="Last 4 digits" value={last4} onChange={(e) => setLast4(e.target.value)} style={{ ...inputStyle, width: 120 }} />
          <select value={officeId} onChange={(e) => setOfficeId(e.target.value)} style={inputStyle}>
            <option value="">Office…</option>
            {offices.map((o) => (
              <option key={o.id} value={o.id}>
                {o.field_office}
              </option>
            ))}
          </select>
          <input placeholder="Job title" value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} style={inputStyle} />
        </div>
        <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13 }}>
          <input type="checkbox" checked={grantEligible} onChange={(e) => setGrantEligible(e.target.checked)} />
          Grant eligible
        </label>
        <button
          onClick={createCard}
          disabled={saving || !selectedEmployee || !last4.trim()}
          style={{
            border: "1.5px solid #8A5FB5",
            background: "rgba(138,95,181,0.1)",
            color: "#8A5FB5",
            borderRadius: 999,
            padding: "9px 18px",
            fontSize: 13,
            fontWeight: 600,
            width: "fit-content",
          }}
        >
          {saving ? "Saving…" : "Issue Card"}
        </button>
      </div>

      <div style={{ display: "grid", gap: 8 }}>
        <div style={{ fontSize: 14, fontWeight: 700 }}>All Cards</div>
        {cards.map((c) => (
          <div key={c.id} style={cardStyle}>
            <div style={{ fontWeight: 600, fontSize: 14 }}>
              {c.employee ? `${c.employee.first_name} ${c.employee.last_name}` : "Unknown"} — •••• {c.last4}
            </div>
            <div style={{ fontSize: 12, color: "rgba(22,48,43,0.5)" }}>
              {c.office?.field_office ?? "No office"} {c.job_title ? `· ${c.job_title}` : ""} {c.grant_eligible ? "· Grant Eligible" : ""}
            </div>
          </div>
        ))}
        {cards.length === 0 && <div style={{ fontSize: 13, color: "rgba(22,48,43,0.5)" }}>No cards issued yet.</div>}
      </div>
    </div>
  );
}
