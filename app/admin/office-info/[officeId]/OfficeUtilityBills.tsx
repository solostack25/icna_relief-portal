"use client";

import { useEffect, useState } from "react";
import { SAVED_UTILITY_TEMPLATE_FIELDS, isFieldVisible } from "@/lib/financeTicketForms";
import FinanceTicketFieldInput, { financeFieldInputStyle, type FinanceGrant } from "@/components/FinanceTicketFieldInput";

type SavedUtility = {
  id: string;
  office_id: string;
  vendor_name: string;
  utility_type: string | null;
  other_utility_name: string | null;
  billing_programs: string[] | null;
  grant_eligible: boolean;
  grant_id: string | null;
  poc_is_icna_member: boolean;
  poc_user_id: string | null;
  poc_name: string | null;
  service_location_name: string | null;
  service_address_line1: string | null;
  service_city: string | null;
  service_zip_code: string | null;
  pin_number: string | null;
  notes: string | null;
};

type PayResult = { savedUtilityId: string; ok: boolean; ticketNumber?: string; warning?: string; error?: string };

const UTILITY_TYPE_LABELS: Record<string, string> = {
  electricity: "Electricity",
  water_sewer: "Water & Sewer",
  gas_heating: "Gas & Heating",
  internet_phone: "Internet & Phone",
  security_alarm: "Security & Alarm",
  trash_recycling: "Trash & Recycling",
  other: "Other",
};

const cardStyle: React.CSSProperties = { background: "#fff", borderRadius: 20, boxShadow: "0 3px 12px rgba(22,48,43,0.06)" };
const btnPrimary: React.CSSProperties = {
  border: "1.5px solid var(--portal-emerald)",
  background: "var(--portal-emerald)",
  color: "#fff",
  borderRadius: 10,
  padding: "9px 16px",
  fontSize: 13,
  fontWeight: 700,
  cursor: "pointer",
};
const btnSecondary: React.CSSProperties = {
  border: "1.5px solid var(--portal-line)",
  background: "#fff",
  color: "var(--portal-ink)",
  borderRadius: 10,
  padding: "9px 16px",
  fontSize: 13,
  fontWeight: 600,
  cursor: "pointer",
};

function detailToFormValues(u: SavedUtility): Record<string, unknown> {
  return { ...u, billing_programs: u.billing_programs ?? [] };
}

export default function OfficeUtilityBills({ officeId }: { officeId: string }) {
  const [utilities, setUtilities] = useState<SavedUtility[]>([]);
  const [loading, setLoading] = useState(true);
  const [grants, setGrants] = useState<FinanceGrant[]>([]);
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [payingIds, setPayingIds] = useState<Set<string>>(new Set());
  const [payResults, setPayResults] = useState<PayResult[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Add/edit form
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<Record<string, unknown>>({});
  const [saving, setSaving] = useState(false);

  const load = () =>
    fetch(`/api/office-saved-utilities?officeId=${officeId}`)
      .then((r) => r.json())
      .then((d) => setUtilities(d.utilities ?? []))
      .finally(() => setLoading(false));

  useEffect(() => {
    load();
    fetch("/api/finance-tickets/grants")
      .then((r) => r.json())
      .then((d) => setGrants(d.grants ?? []))
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [officeId]);

  function openAdd() {
    setEditingId(null);
    setForm({ billing_programs: [] });
    setFormOpen(true);
  }

  function openEdit(u: SavedUtility) {
    setEditingId(u.id);
    setForm(detailToFormValues(u));
    setFormOpen(true);
  }

  async function saveForm() {
    if (!(form.vendor_name as string)?.trim()) {
      setError("Vendor name is required");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const url = editingId ? `/api/office-saved-utilities/${editingId}` : "/api/office-saved-utilities";
      const method = editingId ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editingId ? form : { ...form, office_id: officeId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Couldn't save");
      setFormOpen(false);
      setEditingId(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save");
    } finally {
      setSaving(false);
    }
  }

  async function retire(id: string) {
    if (!confirm("Remove this utility from the list? Past tickets for it aren't affected.")) return;
    await fetch(`/api/office-saved-utilities/${id}`, { method: "DELETE" });
    await load();
  }

  async function pay(ids: string[]) {
    const payments = ids
      .map((id) => ({ savedUtilityId: id, amount: Number(amounts[id]) }))
      .filter((p) => p.amount > 0);
    if (payments.length === 0) {
      setError("Enter an amount for at least one bill first");
      return;
    }
    setError(null);
    setPayingIds(new Set(ids));
    try {
      const res = await fetch("/api/office-saved-utilities/pay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ payments }),
      });
      const data = await res.json();
      const results: PayResult[] = data.results ?? [];
      setPayResults(results);
      // Clear the amount field for anything that went through so it
      // can't be double-submitted by an extra click.
      const succeededIds = new Set(results.filter((r) => r.ok).map((r) => r.savedUtilityId));
      setAmounts((a) => {
        const next = { ...a };
        for (const id of succeededIds) delete next[id];
        return next;
      });
    } catch {
      setError("Couldn't submit payments - try again");
    } finally {
      setPayingIds(new Set());
    }
  }

  const payableIds = utilities.map((u) => u.id).filter((id) => Number(amounts[id]) > 0);

  if (loading) {
    return <div style={{ ...cardStyle, padding: 24 }}>Loading utility bills…</div>;
  }

  return (
    <div style={{ ...cardStyle, padding: 24, marginBottom: 24 }}>
      <div className="flex items-center justify-between mb-1">
        <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>Utility Bills</h2>
        <div style={{ display: "flex", gap: 8 }}>
          {utilities.length > 0 && (
            <button
              onClick={() => pay(payableIds)}
              disabled={payableIds.length === 0 || payingIds.size > 0}
              style={{ ...btnPrimary, opacity: payableIds.length === 0 || payingIds.size > 0 ? 0.5 : 1 }}
            >
              {payingIds.size > 0 ? "Submitting…" : `Pay My Bills${payableIds.length ? ` (${payableIds.length})` : ""}`}
            </button>
          )}
          <button onClick={openAdd} style={btnSecondary}>
            + Add Utility
          </button>
        </div>
      </div>
      <p className="text-xs mb-4" style={{ color: "rgba(22,48,43,0.5)" }}>
        Save each utility once with its account info, then enter the amount due and pay - individually or all at once.
        Each payment opens a real Finance Ticket routed for approval, same as submitting one by hand.
      </p>

      {error && (
        <div className="text-xs mb-3" style={{ color: "#B5566B" }}>
          {error}
        </div>
      )}

      {payResults.length > 0 && (
        <div className="mb-4" style={{ display: "grid", gap: 4 }}>
          {payResults.map((r) => {
            const u = utilities.find((x) => x.id === r.savedUtilityId);
            return (
              <div key={r.savedUtilityId} className="text-xs" style={{ color: r.ok ? "var(--portal-emerald)" : "#B5566B" }}>
                {r.ok
                  ? `${u?.vendor_name ?? "Bill"} — submitted as ${r.ticketNumber}${r.warning ? ` (${r.warning})` : ""}`
                  : `${u?.vendor_name ?? "Bill"} — failed: ${r.error}`}
              </div>
            );
          })}
        </div>
      )}

      {utilities.length === 0 ? (
        <p className="text-sm" style={{ color: "rgba(22,48,43,0.5)" }}>
          No utilities saved yet for this office.
        </p>
      ) : (
        <div style={{ display: "grid", gap: 10 }}>
          {utilities.map((u) => (
            <div
              key={u.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                flexWrap: "wrap",
                border: "1px solid var(--portal-line)",
                borderRadius: 12,
                padding: "12px 14px",
              }}
            >
              <div style={{ flex: "1 1 220px", minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 700 }}>{u.vendor_name}</div>
                <div className="text-xs" style={{ color: "rgba(22,48,43,0.5)" }}>
                  {u.utility_type ? UTILITY_TYPE_LABELS[u.utility_type] ?? u.utility_type : "Utility"}
                  {u.service_location_name ? ` · ${u.service_location_name}` : ""}
                  {u.service_address_line1 ? ` · ${u.service_address_line1}` : ""}
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 13, color: "rgba(22,48,43,0.5)" }}>$</span>
                <input
                  type="number"
                  placeholder="Amount due"
                  value={amounts[u.id] ?? ""}
                  onChange={(e) => setAmounts((a) => ({ ...a, [u.id]: e.target.value }))}
                  style={{ ...financeFieldInputStyle, width: 110 }}
                />
                <button
                  onClick={() => pay([u.id])}
                  disabled={!(Number(amounts[u.id]) > 0) || payingIds.has(u.id)}
                  style={{ ...btnPrimary, padding: "8px 12px", opacity: !(Number(amounts[u.id]) > 0) || payingIds.has(u.id) ? 0.5 : 1 }}
                >
                  Pay
                </button>
                <button onClick={() => openEdit(u)} style={{ ...btnSecondary, padding: "8px 12px" }}>
                  Edit
                </button>
                <button onClick={() => retire(u.id)} style={{ ...btnSecondary, padding: "8px 12px", color: "#B5566B" }}>
                  Remove
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {formOpen && (
        <div style={{ marginTop: 18, paddingTop: 18, borderTop: "1px solid var(--portal-line)" }}>
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>{editingId ? "Edit Utility" : "Add Utility"}</div>
          <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
            {SAVED_UTILITY_TEMPLATE_FIELDS.filter((f) => isFieldVisible(f, form)).map((f) => (
              <div key={f.key} style={f.type === "textarea" ? { gridColumn: "1 / -1" } : undefined}>
                <FinanceTicketFieldInput
                  field={f}
                  value={form[f.key]}
                  onChange={(v) => setForm((prev) => ({ ...prev, [f.key]: v }))}
                  offices={[]}
                  pexCards={[]}
                  grants={grants}
                />
              </div>
            ))}
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
            <button onClick={saveForm} disabled={saving} style={{ ...btnPrimary, opacity: saving ? 0.6 : 1 }}>
              {saving ? "Saving…" : "Save Utility"}
            </button>
            <button
              onClick={() => {
                setFormOpen(false);
                setEditingId(null);
              }}
              style={btnSecondary}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
