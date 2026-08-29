"use client";

import { useState } from "react";
import TicketConfirmationCard from "@/components/TicketConfirmationCard";

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

// Common categories, offered as suggestions rather than a locked-in
// list - real IRFAS categories weren't available to confirm, so case
// managers can still type any category this doesn't anticipate.
const SUGGESTED_CATEGORIES = ["Rent Assistance", "Utility Assistance", "Medical Assistance", "Food Assistance", "Emergency Assistance", "Other"];

export default function NewIrfasApplicationPage() {
  const [form, setForm] = useState({
    applicant_name: "",
    applicant_phone: "",
    applicant_address: "",
    household_size: "",
    category: "",
    amount_requested: "",
    reason: "",
    payee_name: "",
    payee_address: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ id: string; application_number: string } | null>(null);

  async function submit() {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/irfas/applications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          household_size: form.household_size ? Number(form.household_size) : null,
          amount_requested: Number(form.amount_requested),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Something went wrong");
      setDone(data.application);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <div className="max-w-xl mx-auto p-6">
        <TicketConfirmationCard
          systemLabel="IRFAS Application"
          ticketNumber={done.application_number}
          title={form.applicant_name}
          note="Every configured approver has been emailed a review link. You'll see the status update once they've all decided."
          shortcuts={[
            { label: "View All My Applications", href: "/irfas", primary: true },
            { label: "Submit Another Application", href: "/irfas/new" },
          ]}
        />
      </div>
    );
  }

  return (
    <div className="max-w-xl mx-auto p-6">
      <h1 style={{ fontFamily: "'Fraunces', serif", fontStyle: "italic", fontWeight: 500, fontSize: 28, margin: "0 0 8px" }}>
        New Financial Assistance Application
      </h1>
      <p className="text-sm mb-6" style={{ color: "rgba(22,48,43,0.55)" }}>IRFAS</p>

      <div style={{ background: "#fff", borderRadius: 24, padding: 24, display: "grid", gap: 14, boxShadow: "0 3px 12px rgba(22,48,43,0.06)" }}>
        <div>
          <div style={labelStyle}>Applicant Name</div>
          <input value={form.applicant_name} onChange={(e) => setForm((f) => ({ ...f, applicant_name: e.target.value }))} style={inputStyle} />
        </div>
        <div style={{ display: "flex", gap: 12 }}>
          <div style={{ flex: 1 }}>
            <div style={labelStyle}>Phone</div>
            <input value={form.applicant_phone} onChange={(e) => setForm((f) => ({ ...f, applicant_phone: e.target.value }))} style={inputStyle} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={labelStyle}>Household Size</div>
            <input type="number" value={form.household_size} onChange={(e) => setForm((f) => ({ ...f, household_size: e.target.value }))} style={inputStyle} />
          </div>
        </div>
        <div>
          <div style={labelStyle}>Applicant Address</div>
          <input value={form.applicant_address} onChange={(e) => setForm((f) => ({ ...f, applicant_address: e.target.value }))} style={inputStyle} />
        </div>
        <div style={{ display: "flex", gap: 12 }}>
          <div style={{ flex: 1 }}>
            <div style={labelStyle}>Category</div>
            <input list="categories" value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))} style={inputStyle} />
            <datalist id="categories">
              {SUGGESTED_CATEGORIES.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </div>
          <div style={{ flex: 1 }}>
            <div style={labelStyle}>Amount Requested</div>
            <input type="number" value={form.amount_requested} onChange={(e) => setForm((f) => ({ ...f, amount_requested: e.target.value }))} style={inputStyle} />
          </div>
        </div>
        <div>
          <div style={labelStyle}>Reason / Notes</div>
          <textarea value={form.reason} onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))} style={{ ...inputStyle }} rows={3} />
        </div>

        <div style={{ borderTop: "1px solid rgba(22,48,43,0.08)", paddingTop: 14 }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>Check Payee (if different from applicant)</div>
          <div style={{ display: "flex", gap: 12 }}>
            <div style={{ flex: 1 }}>
              <div style={labelStyle}>Payee Name</div>
              <input value={form.payee_name} onChange={(e) => setForm((f) => ({ ...f, payee_name: e.target.value }))} style={inputStyle} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={labelStyle}>Payee Address</div>
              <input value={form.payee_address} onChange={(e) => setForm((f) => ({ ...f, payee_address: e.target.value }))} style={inputStyle} />
            </div>
          </div>
        </div>

        {error && <div style={{ color: "#B5566B", fontSize: 13 }}>{error}</div>}

        <button
          onClick={submit}
          disabled={submitting || !form.applicant_name || !form.category || !form.amount_requested}
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
