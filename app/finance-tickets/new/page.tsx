"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const inputStyle: React.CSSProperties = {
  border: "1.5px solid var(--portal-line, rgba(22,48,43,0.12))",
  borderRadius: 10,
  padding: "9px 12px",
  fontSize: 14,
  background: "#fff",
  outline: "none",
  width: "100%",
};
const labelStyle: React.CSSProperties = { fontSize: 13, fontWeight: 600, marginBottom: 6 };

// Generic intake for now - type-specific sub-forms (credit card
// transactions, honorarium payee/service detail, mileage trips,
// utility, vendor, PEX new/recharge) plus grant/office allocation
// splitting are a later phase. This form covers every category with
// a title, amount, and free-text detail so the approval engine is
// usable end-to-end today rather than only reachable via API.
const CATEGORIES = [
  { value: "credit_card_reimbursement", label: "Credit Card Reimbursement" },
  { value: "honorarium", label: "Honorarium" },
  { value: "mileage_reimbursement", label: "Mileage Reimbursement" },
  { value: "pex_new_card_request", label: "PEX New Card Request" },
  { value: "pex_recharge_request", label: "PEX Recharge Request" },
  { value: "utility_payment", label: "Utility Payment" },
  { value: "vendor_payment", label: "Vendor Payment" },
];

export default function NewFinanceTicketPage() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState(CATEGORIES[0].value);
  const [total, setTotal] = useState("");
  const [notes, setNotes] = useState("");
  const [grantEligible, setGrantEligible] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function submit() {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/finance-tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          category,
          total: Number(total),
          grant_eligible: grantEligible,
          detail: { notes },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Something went wrong");
      setDone(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <div className="max-w-xl mx-auto p-6">
        <div style={{ background: "#fff", borderRadius: 24, padding: 24, boxShadow: "0 3px 12px rgba(22,48,43,0.06)" }}>
          <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>Ticket submitted</div>
          <p style={{ fontSize: 14, color: "rgba(22,48,43,0.6)", marginBottom: 16 }}>
            It's been routed for approval automatically based on the amount and your reporting chain.
          </p>
          <button onClick={() => router.push("/finance-tickets")} style={{ fontSize: 13, fontWeight: 600, color: "#8A5FB5" }}>
            View my tickets →
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-xl mx-auto p-6">
      <h1 style={{ fontFamily: "'Fraunces', serif", fontStyle: "italic", fontWeight: 500, fontSize: 28, margin: "0 0 8px" }}>
        New Finance Ticket
      </h1>
      <p className="text-sm mb-6" style={{ color: "rgba(22,48,43,0.55)" }}>
        Submits for approval automatically — routed by amount through your reporting chain.
      </p>

      <div style={{ background: "#fff", borderRadius: 24, padding: 24, display: "grid", gap: 14, boxShadow: "0 3px 12px rgba(22,48,43,0.06)" }}>
        <div>
          <div style={labelStyle}>Category</div>
          <select value={category} onChange={(e) => setCategory(e.target.value)} style={inputStyle}>
            {CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <div style={labelStyle}>Title</div>
          <input value={title} onChange={(e) => setTitle(e.target.value)} style={inputStyle} />
        </div>
        <div>
          <div style={labelStyle}>Total Amount</div>
          <input type="number" value={total} onChange={(e) => setTotal(e.target.value)} style={inputStyle} />
        </div>
        <div>
          <div style={labelStyle}>Details / Notes</div>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} style={inputStyle} rows={4} />
        </div>
        <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13 }}>
          <input type="checkbox" checked={grantEligible} onChange={(e) => setGrantEligible(e.target.checked)} />
          Grant eligible
        </label>

        {error && <div style={{ color: "#B5566B", fontSize: 13 }}>{error}</div>}

        <button
          onClick={submit}
          disabled={submitting || !title || !total}
          style={{
            border: "1.5px solid #8A5FB5",
            background: "rgba(138,95,181,0.1)",
            color: "#8A5FB5",
            borderRadius: 999,
            padding: "10px 20px",
            fontSize: 14,
            fontWeight: 600,
            cursor: "pointer",
            opacity: submitting ? 0.6 : 1,
          }}
        >
          {submitting ? "Submitting…" : "Submit for Approval"}
        </button>
      </div>
    </div>
  );
}
