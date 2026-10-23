"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api, Field, inputStyle, Notice, PillButton, selectStyle } from "@/components/grantManagement/ui";

// Add a card by its last 4 - for cards seen only in CSV uploads, or
// before PEX is connected. Synced cards show up on their own.
export default function PexAddCard({ employees }: { employees: { id: string; name: string }[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [last4, setLast4] = useState("");
  const [emp, setEmp] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (!open)
    return (
      <PillButton variant="ghost" onClick={() => setOpen(true)}>
        + Add a card by last 4
      </PillButton>
    );
  async function add() {
    setBusy(true);
    setErr(null);
    const r = await api<{ id: string }>("/api/grant-management/pex/cards", { method: "POST", json: { last4, employee_id: emp || null } });
    setBusy(false);
    if (r.error) return setErr(r.fields?.last4 ?? r.error);
    router.push(`/grant-management/pex/cards/${r.id}`);
  }
  return (
    <div className="flex flex-wrap items-end gap-3 rounded-2xl p-4" style={{ background: "#fff", border: "1px solid var(--portal-line)" }}>
      <div style={{ width: 120 }}>
        <Field label="Last 4">
          <input style={inputStyle} inputMode="numeric" maxLength={4} value={last4} onChange={(e) => setLast4(e.target.value.replace(/\D/g, ""))} />
        </Field>
      </div>
      <div style={{ minWidth: 220 }}>
        <Field label="Card holder">
          <select style={selectStyle} value={emp} onChange={(e) => setEmp(e.target.value)}>
            <option value="">Pick an employee…</option>
            {employees.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <PillButton onClick={add} disabled={busy || last4.length !== 4}>
        {busy ? "Adding…" : "Add card"}
      </PillButton>
      <PillButton variant="ghost" onClick={() => setOpen(false)}>
        Cancel
      </PillButton>
      {err && <Notice tone="error">{err}</Notice>}
    </div>
  );
}
