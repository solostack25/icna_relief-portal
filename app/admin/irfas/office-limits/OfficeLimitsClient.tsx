"use client";

import { useEffect, useState } from "react";

type OfficeRow = {
  office_id: string;
  field_office: string;
  region: string;
  limit_amount: number | null;
  given: number;
};

const inputStyle: React.CSSProperties = {
  border: "1.5px solid var(--portal-line, rgba(22,48,43,0.12))",
  borderRadius: 10,
  padding: "8px 12px",
  fontSize: 14,
  background: "#fff",
  outline: "none",
  width: 140,
};
const cardStyle: React.CSSProperties = { background: "#fff", borderRadius: 16, padding: 16, boxShadow: "0 3px 12px rgba(22,48,43,0.06)" };
const saveButton: React.CSSProperties = {
  border: "1.5px solid #8A5FB5",
  background: "rgba(138,95,181,0.1)",
  color: "#8A5FB5",
  borderRadius: 999,
  padding: "8px 16px",
  fontSize: 13,
  fontWeight: 600,
};

function money(n: number) {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

export default function OfficeLimitsClient() {
  const [offices, setOffices] = useState<OfficeRow[]>([]);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const res = await fetch("/api/admin/irfas/office-limits");
    const body = await res.json();
    if (!res.ok) return setError(body.error);
    setOffices(body.offices);
  }
  useEffect(() => {
    load();
  }, []);

  async function save(officeId: string) {
    const value = edits[officeId];
    if (!value || Number.isNaN(Number(value))) return;
    setSaving(officeId);
    setError(null);
    try {
      const res = await fetch("/api/admin/irfas/office-limits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ office_id: officeId, limit_amount: Number(value) }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error);
      await load();
      setEdits((e) => ({ ...e, [officeId]: "" }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(null);
    }
  }

  if (offices.length === 0 && !error) return <p style={{ fontSize: 13, color: "rgba(22,48,43,0.5)" }}>Loading…</p>;

  return (
    <div style={{ display: "grid", gap: 10 }}>
      {error && <p style={{ fontSize: 13, color: "#B5566B" }}>{error}</p>}
      {offices.map((o) => {
        const overLimit = o.limit_amount !== null && o.given > o.limit_amount;
        return (
          <div key={o.office_id} style={cardStyle}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: 14 }}>{o.field_office}</div>
                <div style={{ fontSize: 12, color: overLimit ? "#B5566B" : "rgba(22,48,43,0.5)" }}>
                  Given: {money(o.given)}
                  {o.limit_amount !== null ? ` of ${money(o.limit_amount)} limit` : " · no limit set"}
                  {overLimit ? " — over limit" : ""}
                </div>
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <input
                  type="number"
                  placeholder={o.limit_amount !== null ? String(o.limit_amount) : "No limit"}
                  value={edits[o.office_id] ?? ""}
                  onChange={(e) => setEdits((prev) => ({ ...prev, [o.office_id]: e.target.value }))}
                  style={inputStyle}
                />
                <button onClick={() => save(o.office_id)} disabled={saving === o.office_id || !edits[o.office_id]} style={saveButton}>
                  {saving === o.office_id ? "Saving…" : "Save"}
                </button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
