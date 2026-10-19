"use client";

import { useEffect, useRef, useState } from "react";
import { CATEGORY_LABELS, SINGLE_RECORD_CATEGORIES, isFieldVisible } from "@/lib/financeTicketForms";
import FinanceTicketFieldInput from "@/components/FinanceTicketFieldInput";
import { CreditCardBatchEditor, MileageBatchEditor, type GrantAllocation } from "@/components/FinanceBatchEditors";
import TicketConfirmationCard from "@/components/TicketConfirmationCard";
import ReceiptCapture, { type CapturedReceipt } from "@/components/finance/ReceiptCapture";

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
  const [category, setCategory] = useState<keyof typeof CATEGORY_LABELS>("honorarium");
  const [title, setTitle] = useState("");
  const [grantEligible, setGrantEligible] = useState(false);
  const [grants, setGrants] = useState<Grant[]>([]);
  const [pexCards, setPexCards] = useState<PexCard[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ id: string; ticket_number: string } | null>(null);

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

  // ----- receipt photos -----
  const [receipts, setReceipts] = useState<CapturedReceipt[]>([]);
  // Refs, because several receipts can finish uploading from one stale
  // callback; state read through a closure would be out of date.
  const catRef = useRef(category);
  catRef.current = category;
  const titleRef = useRef(title);
  titleRef.current = title;
  const receiptLog = useRef<{ vendors: string[]; autoTitle: string | null }>({ vendors: [], autoTitle: null });

  // Fill the form from a receipt the AI just read. The first receipt also
  // picks the category if the form is still untouched.
  function applyReceipt(r: CapturedReceipt) {
    setReceipts((xs) => [...xs, r]);
    const log = receiptLog.current;
    const first = log.vendors.length === 0;
    const ex = r.extracted;
    log.vendors.push(ex?.vendor ?? "receipt");
    if (!ex) return;

    let cat = catRef.current;
    const untouched = first && !titleRef.current.trim() && Object.keys(detail).length === 0 && !ccTransactions.some((t) => Object.keys(t).length);
    if (untouched) {
      cat = ex.kind === "utility" ? "utility_payment" : ex.kind === "vendor_invoice" ? "vendor_payment" : "credit_card_reimbursement";
      if (cat !== catRef.current) resetForCategory(cat);
      catRef.current = cat;
    }

    const label = [ex.vendor, ex.description].filter(Boolean).join(" — ");
    if (!titleRef.current.trim() || titleRef.current === log.autoTitle) {
      const t = log.vendors.length === 1 ? label || "Receipt" : `Receipts: ${Array.from(new Set(log.vendors)).join(", ")}`.slice(0, 120);
      log.autoTitle = t;
      titleRef.current = t;
      setTitle(t);
    }

    if (cat === "credit_card_reimbursement") {
      const row = { expense_name: label || "Receipt", receipt_total: ex.total ?? undefined, transaction_date: ex.date ?? undefined };
      // New rows have no allocation entry yet; the editor and the API
      // both treat a missing one as "none".
      setCcTransactions((rows) => {
        const i = rows.findIndex((t) => !t.expense_name && !t.receipt_total);
        if (i >= 0) return rows.map((t, idx) => (idx === i ? { ...t, ...row } : t));
        return [...rows, row];
      });
      if (ex.date) {
        setCcStatement((st) => ({
          ...st,
          start_date: !st.start_date || ex.date! < (st.start_date as string) ? ex.date : st.start_date,
          end_date: !st.end_date || ex.date! > (st.end_date as string) ? ex.date : st.end_date,
        }));
      }
    } else if (cat === "vendor_payment" || cat === "utility_payment") {
      setDetail((d) => ({
        ...d,
        ...(cat === "vendor_payment" && !d.vendor_name && ex.vendor ? { vendor_name: ex.vendor } : {}),
        ...(ex.total != null ? { total_amount: Math.round((Number(d.total_amount ?? 0) + ex.total) * 100) / 100 } : {}),
        ...(!d.expense_date && ex.date ? { expense_date: ex.date } : {}),
        ...(!d.notes && ex.description ? { notes: ex.description } : {}),
      }));
    }
  }

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

      payload.receipt_paths = receipts.map((r) => r.path);
      const res = await fetch("/api/finance-tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Something went wrong");
      setDone(data.ticket);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <TicketConfirmationCard
        systemLabel="Finance Ticket"
        ticketNumber={done.ticket_number}
        title={title}
        note="It's been routed for approval automatically based on the amount and your reporting chain."
        shortcuts={[
          { label: "View This Ticket", href: `/finance-tickets/${done.id}`, primary: true },
          { label: "Submit Another Ticket", href: "/finance-tickets/new" },
          { label: "View All My Tickets", href: "/finance-tickets" },
        ]}
      />
    );
  }

  const singleConfig = SINGLE_RECORD_CATEGORIES[category];

  return (
    <div style={{ ...cardStyle, display: "grid", gap: 16 }}>
      <ReceiptCapture onReceipt={applyReceipt} />
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
