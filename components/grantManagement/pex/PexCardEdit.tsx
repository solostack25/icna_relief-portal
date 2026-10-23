"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api, Card, Field, ink, inputStyle, Notice, PillButton, selectStyle } from "@/components/grantManagement/ui";

// Card holder, office and notes (Finance / PEX admins).
export default function PexCardEdit({
  cardId,
  initial,
  employees,
  offices,
}: {
  cardId: string;
  initial: { employee_id: string | null; office_id: string | null; notes: string | null };
  employees: { id: string; name: string }[];
  offices: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [form, setForm] = useState({ employee_id: initial.employee_id ?? "", office_id: initial.office_id ?? "", notes: initial.notes ?? "" });
  const [msg, setMsg] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const dirty = form.employee_id !== (initial.employee_id ?? "") || form.office_id !== (initial.office_id ?? "") || form.notes !== (initial.notes ?? "");
  async function save() {
    setBusy(true);
    setMsg(null);
    const r = await api(`/api/pex/cards/${cardId}`, { method: "PATCH", json: { employee_id: form.employee_id || null, office_id: form.office_id || null, notes: form.notes } });
    setBusy(false);
    setMsg(r.error ? { tone: "error", text: r.error } : { tone: "ok", text: "Saved." });
    router.refresh();
  }
  return (
    <Card>
      <div className="text-sm font-bold mb-3" style={{ color: ink }}>
        Card details
      </div>
      <div className="space-y-3">
        <Field label="Card holder in the portal" hint="They'll see this card under PEX on their portal home.">
          <select style={selectStyle} value={form.employee_id} onChange={(e) => setForm({ ...form, employee_id: e.target.value })}>
            <option value="">Not linked</option>
            {employees.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Office">
          <select style={selectStyle} value={form.office_id} onChange={(e) => setForm({ ...form, office_id: e.target.value })}>
            <option value="">None</option>
            {offices.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Notes">
          <input style={inputStyle} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="e.g. Pantry purchases only" />
        </Field>
        {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
        <PillButton onClick={save} disabled={!dirty || busy}>
          {busy ? "Saving…" : "Save"}
        </PillButton>
      </div>
    </Card>
  );
}
