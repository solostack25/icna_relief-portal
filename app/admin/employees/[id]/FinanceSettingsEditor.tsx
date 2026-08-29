"use client";

import { useState } from "react";

export default function FinanceSettingsEditor({
  employeeId,
  currentLimit,
  currentIsCsuite,
}: {
  employeeId: string;
  currentLimit: number | null;
  currentIsCsuite: boolean;
}) {
  const [limit, setLimit] = useState(currentLimit != null ? String(currentLimit) : "");
  const [isCsuite, setIsCsuite] = useState(currentIsCsuite);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setSaveMsg(null);
    const res = await fetch("/api/admin/employees/finance-settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ employeeId, monetary_limit: limit, is_csuite: isCsuite }),
    });
    setSaving(false);
    setSaveMsg(res.ok ? "Saved." : "Failed to save.");
  }

  return (
    <div className="rounded-2xl p-5" style={{ background: "#F4F3EE" }}>
      <h3 className="text-sm font-bold mb-1">Finance Approval Settings</h3>
      <p className="text-xs mb-4" style={{ color: "rgba(22,48,43,0.5)" }}>
        Used by Finance Tickets to route approvals: this is the dollar amount this person can approve on their own
        before it needs to climb to their manager. C-suite requestors get a different approval path entirely (see
        Connectors for the CEO routing email).
      </p>
      <div className="flex items-center gap-3 mb-3">
        <label className="text-sm" style={{ width: 140 }}>
          Approval Limit ($)
        </label>
        <input
          type="number"
          value={limit}
          onChange={(e) => setLimit(e.target.value)}
          placeholder="No limit set"
          className="text-sm flex-1"
          style={{ border: "1.5px solid var(--portal-line, rgba(22,48,43,0.12))", borderRadius: 10, padding: "8px 12px", background: "#fff", outline: "none" }}
        />
      </div>
      <label className="flex items-center gap-2 text-sm mb-4">
        <input type="checkbox" checked={isCsuite} onChange={(e) => setIsCsuite(e.target.checked)} />
        C-Suite Member (gets the special-cased approval path when submitting a ticket)
      </label>
      <button
        onClick={save}
        disabled={saving}
        className="text-sm rounded-full text-white font-bold px-5 py-2 disabled:opacity-50 cursor-pointer hover:scale-105 active:scale-95 transition-transform duration-150"
        style={{ background: "var(--portal-emerald)", boxShadow: "0 3px 10px rgba(31,111,84,0.3)" }}
      >
        {saving ? "Saving…" : "Save"}
      </button>
      {saveMsg && <span className="text-xs ml-3" style={{ color: "rgba(22,48,43,0.5)" }}>{saveMsg}</span>}
    </div>
  );
}
