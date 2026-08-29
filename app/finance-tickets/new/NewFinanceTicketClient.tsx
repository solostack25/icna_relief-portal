"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CATEGORY_LABELS, SINGLE_RECORD_CATEGORIES, isFieldVisible } from "@/lib/financeTicketForms";
import FinanceTicketFieldInput from "@/components/FinanceTicketFieldInput";

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

// Grant/office allocation editor for one line item (a credit card
// transaction or mileage trip) - both batch categories reuse this
// rather than duplicating the split-by-grant / split-by-office UI.
function AllocationEditor({
  grants,
  offices,
  grantAllocations,
  setGrantAllocations,
  officeIds,
  setOfficeIds,
}: {
  grants: Grant[];
  offices: Office[];
  grantAllocations: { grant_id: string; allocated_amount?: number }[];
  setGrantAllocations: (v: { grant_id: string; allocated_amount?: number }[]) => void;
  officeIds: string[];
  setOfficeIds: (v: string[]) => void;
}) {
  return (
    <div style={{ display: "grid", gap: 8, marginTop: 8, paddingTop: 8, borderTop: "1px dashed rgba(22,48,43,0.15)" }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: "rgba(22,48,43,0.5)" }}>Grant Allocation (optional)</div>
      {grantAllocations.map((g, i) => (
        <div key={i} style={{ display: "flex", gap: 8 }}>
          <select
            value={g.grant_id}
            onChange={(e) => setGrantAllocations(grantAllocations.map((x, idx) => (idx === i ? { ...x, grant_id: e.target.value } : x)))}
            style={{ ...inputStyle, flex: 1 }}
          >
            <option value="">Select grant…</option>
            {grants.map((gr) => (
              <option key={gr.id} value={gr.id}>
                {gr.title}
              </option>
            ))}
          </select>
          <input
            type="number"
            placeholder="Amount"
            value={g.allocated_amount ?? ""}
            onChange={(e) => setGrantAllocations(grantAllocations.map((x, idx) => (idx === i ? { ...x, allocated_amount: Number(e.target.value) } : x)))}
            style={{ ...inputStyle, width: 110 }}
          />
          <button onClick={() => setGrantAllocations(grantAllocations.filter((_, idx) => idx !== i))} style={{ ...pillButton(false), color: "#B5566B" }}>
            ✕
          </button>
        </div>
      ))}
      <button onClick={() => setGrantAllocations([...grantAllocations, { grant_id: "" }])} style={pillButton(false)}>
        + Split across a grant
      </button>

      <div style={{ fontSize: 12, fontWeight: 600, color: "rgba(22,48,43,0.5)", marginTop: 6 }}>Additional Offices (optional)</div>
      <select
        multiple
        value={officeIds}
        onChange={(e) => setOfficeIds(Array.from(e.target.selectedOptions).map((o) => o.value))}
        style={{ ...inputStyle, height: 70 }}
      >
        {offices.map((o) => (
          <option key={o.id} value={o.id}>
            {o.field_office}
          </option>
        ))}
      </select>
    </div>
  );
}

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
  const [ccAllocations, setCcAllocations] = useState<{ grant_id: string; allocated_amount?: number }[][]>([[]]);
  const [ccOfficeIds, setCcOfficeIds] = useState<string[][]>([[]]);

  // ----- mileage state -----
  const [mileageBatch, setMileageBatch] = useState<Record<string, unknown>>({});
  const [mileageTrips, setMileageTrips] = useState<Record<string, unknown>[]>([{}]);
  const [mileageAllocations, setMileageAllocations] = useState<{ grant_id: string; allocated_amount?: number }[][]>([[]]);
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
        <div style={{ display: "grid", gap: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 700 }}>Statement Details</div>
          <div style={{ display: "flex", gap: 10 }}>
            <input placeholder="Expense Name" value={(ccStatement.expense_name as string) ?? ""} onChange={(e) => setCcStatement((s) => ({ ...s, expense_name: e.target.value }))} style={inputStyle} />
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <input type="date" value={(ccStatement.start_date as string) ?? ""} onChange={(e) => setCcStatement((s) => ({ ...s, start_date: e.target.value }))} style={inputStyle} />
            <input type="date" value={(ccStatement.end_date as string) ?? ""} onChange={(e) => setCcStatement((s) => ({ ...s, end_date: e.target.value }))} style={inputStyle} />
          </div>
          {grantEligible && (
            <select value={(ccStatement.grant_id as string) ?? ""} onChange={(e) => setCcStatement((s) => ({ ...s, grant_id: e.target.value }))} style={inputStyle}>
              <option value="">Default grant for this statement (optional)…</option>
              {grants.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.title}
                </option>
              ))}
            </select>
          )}

          <div style={{ fontSize: 13, fontWeight: 700, marginTop: 8 }}>Transactions</div>
          {ccTransactions.map((t, i) => (
            <div key={i} style={{ border: "1px solid rgba(22,48,43,0.1)", borderRadius: 12, padding: 12 }}>
              <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                <input placeholder="Expense name" value={(t.expense_name as string) ?? ""} onChange={(e) => setCcTransactions((rows) => rows.map((r, idx) => (idx === i ? { ...r, expense_name: e.target.value } : r)))} style={{ ...inputStyle, flex: 1 }} />
                <input type="number" placeholder="Receipt total" value={(t.receipt_total as number) ?? ""} onChange={(e) => setCcTransactions((rows) => rows.map((r, idx) => (idx === i ? { ...r, receipt_total: Number(e.target.value) } : r)))} style={{ ...inputStyle, width: 120 }} />
                <input type="date" value={(t.transaction_date as string) ?? ""} onChange={(e) => setCcTransactions((rows) => rows.map((r, idx) => (idx === i ? { ...r, transaction_date: e.target.value } : r)))} style={{ ...inputStyle, width: 150 }} />
              </div>
              <select value={(t.billing_office_id as string) ?? ""} onChange={(e) => setCcTransactions((rows) => rows.map((r, idx) => (idx === i ? { ...r, billing_office_id: e.target.value } : r)))} style={inputStyle}>
                <option value="">Billing office…</option>
                {offices.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.field_office}
                  </option>
                ))}
              </select>
              {grantEligible && (
                <AllocationEditor
                  grants={grants}
                  offices={offices}
                  grantAllocations={ccAllocations[i] ?? []}
                  setGrantAllocations={(v) => setCcAllocations((rows) => rows.map((r, idx) => (idx === i ? v : r)))}
                  officeIds={ccOfficeIds[i] ?? []}
                  setOfficeIds={(v) => setCcOfficeIds((rows) => rows.map((r, idx) => (idx === i ? v : r)))}
                />
              )}
              {ccTransactions.length > 1 && (
                <button
                  onClick={() => {
                    setCcTransactions((rows) => rows.filter((_, idx) => idx !== i));
                    setCcAllocations((rows) => rows.filter((_, idx) => idx !== i));
                    setCcOfficeIds((rows) => rows.filter((_, idx) => idx !== i));
                  }}
                  style={{ ...pillButton(false), color: "#B5566B", marginTop: 8 }}
                >
                  Remove transaction
                </button>
              )}
            </div>
          ))}
          <button
            onClick={() => {
              setCcTransactions((rows) => [...rows, {}]);
              setCcAllocations((rows) => [...rows, []]);
              setCcOfficeIds((rows) => [...rows, []]);
            }}
            style={pillButton(false)}
          >
            + Add Transaction
          </button>
        </div>
      )}

      {category === "mileage_reimbursement" && (
        <div style={{ display: "grid", gap: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 700 }}>Mileage Details</div>
          <input placeholder="Mileage Title" value={(mileageBatch.mileage_title as string) ?? ""} onChange={(e) => setMileageBatch((s) => ({ ...s, mileage_title: e.target.value }))} style={inputStyle} />
          <div style={{ display: "flex", gap: 10 }}>
            <input type="number" step="0.01" placeholder="Rate per mile" value={(mileageBatch.rate_per_mile as number) ?? ""} onChange={(e) => setMileageBatch((s) => ({ ...s, rate_per_mile: Number(e.target.value) }))} style={inputStyle} />
          </div>
          {grantEligible && (
            <select value={(mileageBatch.grant_id as string) ?? ""} onChange={(e) => setMileageBatch((s) => ({ ...s, grant_id: e.target.value }))} style={inputStyle}>
              <option value="">Default grant for these trips (optional)…</option>
              {grants.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.title}
                </option>
              ))}
            </select>
          )}

          <div style={{ fontSize: 13, fontWeight: 700, marginTop: 8 }}>Trips</div>
          {mileageTrips.map((t, i) => (
            <div key={i} style={{ border: "1px solid rgba(22,48,43,0.1)", borderRadius: 12, padding: 12 }}>
              <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                <input type="date" value={(t.travel_date as string) ?? ""} onChange={(e) => setMileageTrips((rows) => rows.map((r, idx) => (idx === i ? { ...r, travel_date: e.target.value } : r)))} style={{ ...inputStyle, width: 150 }} />
                <input type="number" placeholder="Miles" value={(t.mileage_traveled as number) ?? ""} onChange={(e) => setMileageTrips((rows) => rows.map((r, idx) => (idx === i ? { ...r, mileage_traveled: Number(e.target.value) } : r)))} style={{ ...inputStyle, width: 100 }} />
                <input type="number" placeholder="Reimbursement $" value={(t.mileage_reimbursement as number) ?? ""} onChange={(e) => setMileageTrips((rows) => rows.map((r, idx) => (idx === i ? { ...r, mileage_reimbursement: Number(e.target.value) } : r)))} style={{ ...inputStyle, width: 130 }} />
              </div>
              <input placeholder="Trip purpose" value={(t.trip_purpose as string) ?? ""} onChange={(e) => setMileageTrips((rows) => rows.map((r, idx) => (idx === i ? { ...r, trip_purpose: e.target.value } : r)))} style={{ ...inputStyle, marginBottom: 8 }} />
              <select value={(t.billing_office_id as string) ?? ""} onChange={(e) => setMileageTrips((rows) => rows.map((r, idx) => (idx === i ? { ...r, billing_office_id: e.target.value } : r)))} style={inputStyle}>
                <option value="">Billing office…</option>
                {offices.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.field_office}
                  </option>
                ))}
              </select>
              {grantEligible && (
                <AllocationEditor
                  grants={grants}
                  offices={offices}
                  grantAllocations={mileageAllocations[i] ?? []}
                  setGrantAllocations={(v) => setMileageAllocations((rows) => rows.map((r, idx) => (idx === i ? v : r)))}
                  officeIds={mileageOfficeIds[i] ?? []}
                  setOfficeIds={(v) => setMileageOfficeIds((rows) => rows.map((r, idx) => (idx === i ? v : r)))}
                />
              )}
              {mileageTrips.length > 1 && (
                <button
                  onClick={() => {
                    setMileageTrips((rows) => rows.filter((_, idx) => idx !== i));
                    setMileageAllocations((rows) => rows.filter((_, idx) => idx !== i));
                    setMileageOfficeIds((rows) => rows.filter((_, idx) => idx !== i));
                  }}
                  style={{ ...pillButton(false), color: "#B5566B", marginTop: 8 }}
                >
                  Remove trip
                </button>
              )}
            </div>
          ))}
          <button
            onClick={() => {
              setMileageTrips((rows) => [...rows, {}]);
              setMileageAllocations((rows) => [...rows, []]);
              setMileageOfficeIds((rows) => [...rows, []]);
            }}
            style={pillButton(false)}
          >
            + Add Trip
          </button>
        </div>
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
