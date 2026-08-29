"use client";

import { financeFieldInputStyle as inputStyle } from "@/components/FinanceTicketFieldInput";

const pillButton = (active: boolean): React.CSSProperties => ({
  border: active ? "1.5px solid #8A5FB5" : "1.5px solid rgba(22,48,43,0.12)",
  background: active ? "rgba(138,95,181,0.1)" : "#fff",
  color: active ? "#8A5FB5" : "rgba(22,48,43,0.75)",
  borderRadius: 999,
  padding: "6px 14px",
  fontSize: 13,
  cursor: "pointer",
});

export type BatchOffice = { id: string; field_office: string };
export type BatchGrant = { id: string; title: string; funder_name: string | null };
export type GrantAllocation = { grant_id: string; allocated_amount?: number };

// Grant/office allocation editor for one line item (a credit card
// transaction or mileage trip) - shared by both batch categories,
// and by both the intake form and the resubmit-edit form.
export function AllocationEditor({
  grants,
  offices,
  grantAllocations,
  setGrantAllocations,
  officeIds,
  setOfficeIds,
}: {
  grants: BatchGrant[];
  offices: BatchOffice[];
  grantAllocations: GrantAllocation[];
  setGrantAllocations: (v: GrantAllocation[]) => void;
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

type Row = Record<string, unknown>;

export function CreditCardBatchEditor({
  statement,
  setStatement,
  transactions,
  setTransactions,
  allocations,
  setAllocations,
  officeIdsPerRow,
  setOfficeIdsPerRow,
  offices,
  grants,
  grantEligible,
}: {
  statement: Row;
  setStatement: (fn: (s: Row) => Row) => void;
  transactions: Row[];
  setTransactions: (fn: (rows: Row[]) => Row[]) => void;
  allocations: GrantAllocation[][];
  setAllocations: (fn: (rows: GrantAllocation[][]) => GrantAllocation[][]) => void;
  officeIdsPerRow: string[][];
  setOfficeIdsPerRow: (fn: (rows: string[][]) => string[][]) => void;
  offices: BatchOffice[];
  grants: BatchGrant[];
  grantEligible: boolean;
}) {
  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div style={{ fontSize: 13, fontWeight: 700 }}>Statement Details</div>
      <input
        placeholder="Expense Name"
        value={(statement.expense_name as string) ?? ""}
        onChange={(e) => setStatement((s) => ({ ...s, expense_name: e.target.value }))}
        style={inputStyle}
      />
      <div style={{ display: "flex", gap: 10 }}>
        <input type="date" value={(statement.start_date as string) ?? ""} onChange={(e) => setStatement((s) => ({ ...s, start_date: e.target.value }))} style={inputStyle} />
        <input type="date" value={(statement.end_date as string) ?? ""} onChange={(e) => setStatement((s) => ({ ...s, end_date: e.target.value }))} style={inputStyle} />
      </div>
      {grantEligible && (
        <select value={(statement.grant_id as string) ?? ""} onChange={(e) => setStatement((s) => ({ ...s, grant_id: e.target.value }))} style={inputStyle}>
          <option value="">Default grant for this statement (optional)…</option>
          {grants.map((g) => (
            <option key={g.id} value={g.id}>
              {g.title}
            </option>
          ))}
        </select>
      )}

      <div style={{ fontSize: 13, fontWeight: 700, marginTop: 8 }}>Transactions</div>
      {transactions.map((t, i) => (
        <div key={i} style={{ border: "1px solid rgba(22,48,43,0.1)", borderRadius: 12, padding: 12 }}>
          <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
            <input
              placeholder="Expense name"
              value={(t.expense_name as string) ?? ""}
              onChange={(e) => setTransactions((rows) => rows.map((r, idx) => (idx === i ? { ...r, expense_name: e.target.value } : r)))}
              style={{ ...inputStyle, flex: 1 }}
            />
            <input
              type="number"
              placeholder="Receipt total"
              value={(t.receipt_total as number) ?? ""}
              onChange={(e) => setTransactions((rows) => rows.map((r, idx) => (idx === i ? { ...r, receipt_total: Number(e.target.value) } : r)))}
              style={{ ...inputStyle, width: 120 }}
            />
            <input
              type="date"
              value={(t.transaction_date as string) ?? ""}
              onChange={(e) => setTransactions((rows) => rows.map((r, idx) => (idx === i ? { ...r, transaction_date: e.target.value } : r)))}
              style={{ ...inputStyle, width: 150 }}
            />
          </div>
          <select
            value={(t.billing_office_id as string) ?? ""}
            onChange={(e) => setTransactions((rows) => rows.map((r, idx) => (idx === i ? { ...r, billing_office_id: e.target.value } : r)))}
            style={inputStyle}
          >
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
              grantAllocations={allocations[i] ?? []}
              setGrantAllocations={(v) => setAllocations((rows) => rows.map((r, idx) => (idx === i ? v : r)))}
              officeIds={officeIdsPerRow[i] ?? []}
              setOfficeIds={(v) => setOfficeIdsPerRow((rows) => rows.map((r, idx) => (idx === i ? v : r)))}
            />
          )}
          {transactions.length > 1 && (
            <button
              onClick={() => {
                setTransactions((rows) => rows.filter((_, idx) => idx !== i));
                setAllocations((rows) => rows.filter((_, idx) => idx !== i));
                setOfficeIdsPerRow((rows) => rows.filter((_, idx) => idx !== i));
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
          setTransactions((rows) => [...rows, {}]);
          setAllocations((rows) => [...rows, []]);
          setOfficeIdsPerRow((rows) => [...rows, []]);
        }}
        style={pillButton(false)}
      >
        + Add Transaction
      </button>
    </div>
  );
}

export function MileageBatchEditor({
  batch,
  setBatch,
  trips,
  setTrips,
  allocations,
  setAllocations,
  officeIdsPerRow,
  setOfficeIdsPerRow,
  offices,
  grants,
  grantEligible,
}: {
  batch: Row;
  setBatch: (fn: (s: Row) => Row) => void;
  trips: Row[];
  setTrips: (fn: (rows: Row[]) => Row[]) => void;
  allocations: GrantAllocation[][];
  setAllocations: (fn: (rows: GrantAllocation[][]) => GrantAllocation[][]) => void;
  officeIdsPerRow: string[][];
  setOfficeIdsPerRow: (fn: (rows: string[][]) => string[][]) => void;
  offices: BatchOffice[];
  grants: BatchGrant[];
  grantEligible: boolean;
}) {
  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div style={{ fontSize: 13, fontWeight: 700 }}>Mileage Details</div>
      <input placeholder="Mileage Title" value={(batch.mileage_title as string) ?? ""} onChange={(e) => setBatch((s) => ({ ...s, mileage_title: e.target.value }))} style={inputStyle} />
      <input
        type="number"
        step="0.01"
        placeholder="Rate per mile"
        value={(batch.rate_per_mile as number) ?? ""}
        onChange={(e) => setBatch((s) => ({ ...s, rate_per_mile: Number(e.target.value) }))}
        style={inputStyle}
      />
      {grantEligible && (
        <select value={(batch.grant_id as string) ?? ""} onChange={(e) => setBatch((s) => ({ ...s, grant_id: e.target.value }))} style={inputStyle}>
          <option value="">Default grant for these trips (optional)…</option>
          {grants.map((g) => (
            <option key={g.id} value={g.id}>
              {g.title}
            </option>
          ))}
        </select>
      )}

      <div style={{ fontSize: 13, fontWeight: 700, marginTop: 8 }}>Trips</div>
      {trips.map((t, i) => (
        <div key={i} style={{ border: "1px solid rgba(22,48,43,0.1)", borderRadius: 12, padding: 12 }}>
          <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
            <input
              type="date"
              value={(t.travel_date as string) ?? ""}
              onChange={(e) => setTrips((rows) => rows.map((r, idx) => (idx === i ? { ...r, travel_date: e.target.value } : r)))}
              style={{ ...inputStyle, width: 150 }}
            />
            <input
              type="number"
              placeholder="Miles"
              value={(t.mileage_traveled as number) ?? ""}
              onChange={(e) => setTrips((rows) => rows.map((r, idx) => (idx === i ? { ...r, mileage_traveled: Number(e.target.value) } : r)))}
              style={{ ...inputStyle, width: 100 }}
            />
            <input
              type="number"
              placeholder="Reimbursement $"
              value={(t.mileage_reimbursement as number) ?? ""}
              onChange={(e) => setTrips((rows) => rows.map((r, idx) => (idx === i ? { ...r, mileage_reimbursement: Number(e.target.value) } : r)))}
              style={{ ...inputStyle, width: 130 }}
            />
          </div>
          <input
            placeholder="Trip purpose"
            value={(t.trip_purpose as string) ?? ""}
            onChange={(e) => setTrips((rows) => rows.map((r, idx) => (idx === i ? { ...r, trip_purpose: e.target.value } : r)))}
            style={{ ...inputStyle, marginBottom: 8 }}
          />
          <select
            value={(t.billing_office_id as string) ?? ""}
            onChange={(e) => setTrips((rows) => rows.map((r, idx) => (idx === i ? { ...r, billing_office_id: e.target.value } : r)))}
            style={inputStyle}
          >
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
              grantAllocations={allocations[i] ?? []}
              setGrantAllocations={(v) => setAllocations((rows) => rows.map((r, idx) => (idx === i ? v : r)))}
              officeIds={officeIdsPerRow[i] ?? []}
              setOfficeIds={(v) => setOfficeIdsPerRow((rows) => rows.map((r, idx) => (idx === i ? v : r)))}
            />
          )}
          {trips.length > 1 && (
            <button
              onClick={() => {
                setTrips((rows) => rows.filter((_, idx) => idx !== i));
                setAllocations((rows) => rows.filter((_, idx) => idx !== i));
                setOfficeIdsPerRow((rows) => rows.filter((_, idx) => idx !== i));
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
          setTrips((rows) => [...rows, {}]);
          setAllocations((rows) => [...rows, []]);
          setOfficeIdsPerRow((rows) => [...rows, []]);
        }}
        style={pillButton(false)}
      >
        + Add Trip
      </button>
    </div>
  );
}
