"use client";

import { useEffect, useState } from "react";

type Application = {
  id: string;
  applicant_name: string;
  category: string;
  amount_requested: number;
  amount_approved: number | null;
  payee_name: string | null;
  payee_address: string | null;
  status: string;
  decided_at: string;
  check_number: string | null;
  paid_at: string | null;
};

const cardStyle: React.CSSProperties = { background: "#fff", borderRadius: 16, padding: 16, boxShadow: "0 3px 12px rgba(22,48,43,0.06)" };
const inputStyle: React.CSSProperties = {
  border: "1.5px solid var(--portal-line, rgba(22,48,43,0.12))",
  borderRadius: 8,
  padding: "7px 10px",
  fontSize: 13,
  background: "#fff",
  outline: "none",
};

export default function ZakatFinanceClient() {
  const [applications, setApplications] = useState<Application[]>([]);
  const [checkNumbers, setCheckNumbers] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);

  async function load() {
    const res = await fetch("/api/admin/zakat-finance-applications");
    const data = await res.json();
    setApplications(data.applications ?? []);
  }
  useEffect(() => {
    load();
  }, []);

  async function markPaid(id: string) {
    const checkNumber = checkNumbers[id]?.trim();
    if (!checkNumber) return;
    setSaving(id);
    try {
      await fetch(`/api/admin/zakat-finance-applications/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ check_number: checkNumber }),
      });
      await load();
    } finally {
      setSaving(null);
    }
  }

  const pending = applications.filter((a) => a.status === "approved");
  const paid = applications.filter((a) => a.status === "paid");

  return (
    <div style={{ display: "grid", gap: 24 }}>
      <div>
        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 10 }}>Awaiting Check ({pending.length})</div>
        <div style={{ display: "grid", gap: 10 }}>
          {pending.map((a) => (
            <div key={a.id} style={cardStyle}>
              <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{a.payee_name || a.applicant_name}</div>
                  <div style={{ fontSize: 12, color: "rgba(22,48,43,0.5)" }}>
                    {a.category} · ${(a.amount_approved ?? a.amount_requested).toLocaleString()}
                    {a.payee_address ? ` · ${a.payee_address}` : ""}
                  </div>
                  <div style={{ fontSize: 11, color: "rgba(22,48,43,0.4)" }}>Approved {new Date(a.decided_at).toLocaleDateString()}</div>
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <input
                    placeholder="Check #"
                    value={checkNumbers[a.id] ?? ""}
                    onChange={(e) => setCheckNumbers((prev) => ({ ...prev, [a.id]: e.target.value }))}
                    style={{ ...inputStyle, width: 100 }}
                  />
                  <button
                    onClick={() => markPaid(a.id)}
                    disabled={saving === a.id || !checkNumbers[a.id]?.trim()}
                    style={{
                      border: "1.5px solid #1F6F54",
                      background: "rgba(31,111,84,0.1)",
                      color: "#1F6F54",
                      borderRadius: 999,
                      padding: "7px 14px",
                      fontSize: 12,
                      fontWeight: 600,
                    }}
                  >
                    Mark Paid
                  </button>
                </div>
              </div>
            </div>
          ))}
          {pending.length === 0 && <div style={{ fontSize: 13, color: "rgba(22,48,43,0.5)" }}>Nothing waiting on a check right now.</div>}
        </div>
      </div>

      <div>
        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 10 }}>Paid ({paid.length})</div>
        <div style={{ display: "grid", gap: 8 }}>
          {paid.map((a) => (
            <div key={a.id} style={{ ...cardStyle, opacity: 0.7 }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <div style={{ fontSize: 13 }}>
                  {a.payee_name || a.applicant_name} — ${(a.amount_approved ?? a.amount_requested).toLocaleString()}
                </div>
                <div style={{ fontSize: 12, color: "rgba(22,48,43,0.5)" }}>Check #{a.check_number}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
