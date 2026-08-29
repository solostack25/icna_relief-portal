"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CATEGORY_LABELS, SINGLE_RECORD_CATEGORIES, isFieldVisible } from "@/lib/financeTicketForms";
import FinanceTicketFieldInput from "@/components/FinanceTicketFieldInput";
import { CreditCardBatchEditor, MileageBatchEditor, type GrantAllocation } from "@/components/FinanceBatchEditors";

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
const cardStyle: React.CSSProperties = { background: "#fff", borderRadius: 24, padding: 24, boxShadow: "0 3px 12px rgba(22,48,43,0.06)" };
const pillButton = (active: boolean): React.CSSProperties => ({
  border: active ? "1.5px solid #8A5FB5" : "1.5px solid rgba(22,48,43,0.12)",
  background: active ? "rgba(138,95,181,0.1)" : "#fff",
  color: active ? "#8A5FB5" : "rgba(22,48,43,0.75)",
  borderRadius: 999,
  padding: "6px 14px",
  fontSize: 13,
  cursor: "pointer",
});

type Office = { id: string; field_office: string };
type Grant = { id: string; title: string; funder_name: string | null };
type PexCard = { id: string; last4: string | null };

// ---------- main component ----------

export default function NewFinanceTicketClient({ offices }: { offices: Office[] }) {
  const router = useRouter();
  const [category, setCategory] = useState<keyof typeof CATEGORY_LABELS>("honorarium");
  const [title, setTitle] = useState("");
  const [grantEligible, setGrantEligible] = useState(false);
  const [grants, setGrants] = useState<Grant[]>([]);
  const [pexCards, setPexCards] = useState<PexCard[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    fetch("/api/finance-tickets/grants")
      .then((r) => r.json())
      .then((d) => setGrants(d.grants ?? []))
      .catch(() => {});
    fetch("/api/finance-tickets/pex-cards")
      .then((r) => r.json())
      .then((d) => setPexCards(d.cards ?? []))
      .catch(() => {});
  }, []);

  // ----- single-record category state -----
  const [detail, setDetail] = useState<Record<string, unknown>>({});
  const [manualTotal, setManualTotal] = useState("");

  // ----- credit card state -----
  const [ccStatement, setCcStatement] = useState<Record<string, unknown>>({});
  const [ccTransactions, setCcTransactions] = useState<Record<string, unknown>[]>([{}]);
  const [ccAllocations, setCcAllocations] = useState<GrantAllocation[][]>([[]]);
  const [ccOfficeIds, setCcOfficeIds] = useState<string[][]>([[]]);

  // ----- mileage state -----
  const [mileageBatch, setMileageBatch] = useState<Record<string, unknown>>({});
  const [mileageTrips, setMileageTrips] = useState<Record<string, unknown>[]>([{}]);
  const [mileageAllocations, setMileageAllocations] = useState<GrantAllocation[][]>([[]]);
  const [mileageOfficeIds, setMileageOfficeIds] = useState<string[][]>([[]]);

  function resetForCategory(c: keyof typeof CATEGORY_LABELS) {
    setCategory(c);
    setDetail({});
    setManualTotal("");
    setCcStatement({});
    setCcTransactions([{}]);
    setCcAllocations([[]]);
    setCcOfficeIds([[]]);
    setMileageBatch({});
    setMileageTrips([{}]);
    setMileageAllocations([[]]);
    setMileageOfficeIds([[]]);
    setError(null);
  }

  async function submit() {
    setSubmitting(true);
    setError(null);
    try {
      let payload: Record<string, unknown>;
      if (category === "credit_card_reimbursement") {
        payload = {
          title,
          category,
          grant_eligible: grantEligible,
          statement: ccStatement,
          transactions: ccTransactions.map((t, i) => ({ ...t, grant_allocations: ccAllocations[i], office_ids: ccOfficeIds[i] })),
        };
      } else if (category === "mileage_reimbursement") {
        payload = {
          title,
          category,
          grant_eligible: grantEligible,
          batch: mileageBatch,
          trips: mileageTrips.map((t, i) => ({ ...t, grant_allocations: mileageAllocations[i], office_ids: mileageOfficeIds[i] })),
        };
      } else {
        payload = {
          title,
          category,
          grant_eligible: grantEligible,
          detail,
          total: manualTotal ? Number(manualTotal) : undefined,
        };
      }

      const res = await fetch("/api/finance-tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
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
      <div style={cardStyle}>
        <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>Ticket submitted</div>
        <p style={{ fontSize: 14, color: "rgba(22,48,43,0.6)", marginBottom: 16 }}>
          It's been routed for approval automatically based on the amount and your reporting chain.
        </p>
        <button onClick={() => router.push("/finance-tickets")} style={{ fontSize: 13, fontWeight: 600, color: "#8A5FB5" }}>
          View my tickets →
        </button>
      </div>
    );
  }

  const singleConfig = SINGLE_RECORD_CATEGORIES[category];

  return (
    <div style={{ ...cardStyle, display: "grid", gap: 16 }}>
      <div>
        <div style={labelStyle}>Category</div>
        <select value={category} onChange={(e) => resetForCategory(e.target.value as keyof typeof CATEGORY_LABELS)} style={inputStyle}>
          {Object.entries(CATEGORY_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>
      <div>
        <div style={labelStyle}>Title</div>
        <input value={title} onChange={(e) => setTitle(e.target.value)} style={inputStyle} />
      </div>
      <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13 }}>
        <input type="checkbox" checked={grantEligible} onChange={(e) => setGrantEligible(e.target.checked)} />
        Grant eligible
      </label>

      {singleConfig && (
        <div style={{ display: "grid", gap: 12 }}>
          {singleConfig.fields
            .filter((f) => isFieldVisible(f, { ...detail, grant_eligible: grantEligible }))
            .map((f) => (
              <FinanceTicketFieldInput key={f.key} field={f} value={detail[f.key]} onChange={(v) => setDetail((d) => ({ ...d, [f.key]: v }))} offices={offices} pexCards={pexCards} grants={grants} />
            ))}
          {!singleConfig.totalField && (
            <div>
              <div style={labelStyle}>Total Amount</div>
              <input type="number" value={manualTotal} onChange={(e) => setManualTotal(e.target.value)} style={inputStyle} />
            </div>
          )}
        </div>
      )}

      {category === "credit_card_reimbursement" && (
        <CreditCardBatchEditor
          statement={ccStatement}
          setStatement={setCcStatement}
          transactions={ccTransactions}
          setTransactions={setCcTransactions}
          allocations={ccAllocations}
          setAllocations={setCcAllocations}
          officeIdsPerRow={ccOfficeIds}
          setOfficeIdsPerRow={setCcOfficeIds}
          offices={offices}
          grants={grants}
          grantEligible={grantEligible}
        />
      )}

      {category === "mileage_reimbursement" && (
        <MileageBatchEditor
          batch={mileageBatch}
          setBatch={setMileageBatch}
          trips={mileageTrips}
          setTrips={setMileageTrips}
          allocations={mileageAllocations}
          setAllocations={setMileageAllocations}
          officeIdsPerRow={mileageOfficeIds}
          setOfficeIdsPerRow={setMileageOfficeIds}
          offices={offices}
          grants={grants}
          grantEligible={grantEligible}
        />
      )}


      {error && <div style={{ color: "#B5566B", fontSize: 13 }}>{error}</div>}

      <button
        onClick={submit}
        disabled={submitting || !title}
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
  );
}
