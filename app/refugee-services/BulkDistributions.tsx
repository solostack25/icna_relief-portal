"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const PROGRAM = "Refugee Services & Community Empowerment";

type Row = {
  id: string;
  office_id: string;
  office_name: string;
  name: string;
  distributed_on: string;
  people_served: number;
  households_served: number | null;
  total_value: number | null;
  items_description: string | null;
  location: string | null;
  salesforce_synced: boolean;
  salesforce_error: string | null;
};

const fmtDate = (d: string) => new Date(d + "T12:00:00").toLocaleDateString();

// Bulk distributions (household items, coat drives, Eid gifts…) that aren't
// tied to individual clients — the old "Bulk" Salesforce export.
export default function BulkDistributions({
  rows,
  officeId,
  offices,
  employeeId,
}: {
  rows: Row[];
  officeId: string | null;
  offices: { id: string; name: string }[];
  employeeId: string;
}) {
  const supabase = createClient();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const blank = {
    office_id: officeId ?? "",
    name: "Bulk Household Items",
    distributed_on: new Date().toLocaleDateString("en-CA"),
    people_served: "",
    households_served: "",
    total_value: "",
    items_description: "",
    location: "",
  };
  const [form, setForm] = useState(blank);
  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!form.office_id) return setError("Choose an office.");
    const people = Number(form.people_served);
    if (!Number.isInteger(people) || people <= 0) return setError("Enter how many people were served.");
    setSaving(true);
    const { error } = await supabase.from("bulk_distributions").insert({
      office_id: form.office_id,
      program: PROGRAM,
      name: form.name.trim() || "Bulk Household Items",
      distributed_on: form.distributed_on,
      people_served: people,
      households_served: form.households_served ? Number(form.households_served) : null,
      total_value: form.total_value ? Number(form.total_value) : null,
      items_description: form.items_description.trim() || null,
      location: form.location.trim() || null,
      created_by: employeeId,
    });
    setSaving(false);
    if (error) return setError(error.message);
    setForm(blank);
    setOpen(false);
    router.refresh();
  }

  const [pushing, setPushing] = useState<string | null>(null);
  const [pushMsg, setPushMsg] = useState<Record<string, string>>({});

  async function pushToSalesforce(id: string) {
    setPushing(id);
    const res = await fetch(`/api/refugee-services/bulk/${id}/salesforce`, { method: "POST" });
    const data = await res.json().catch(() => ({}));
    setPushing(null);
    if (!res.ok) {
      setPushMsg((m) => ({ ...m, [id]: data.error ?? "Push failed" }));
      return;
    }
    setPushMsg((m) => ({ ...m, [id]: "" }));
    router.refresh();
  }

  async function remove(id: string) {
    if (!confirm("Delete this bulk distribution?")) return;
    const { error } = await supabase.from("bulk_distributions").delete().eq("id", id);
    if (error) return alert(error.message);
    router.refresh();
  }

  const inputClass =
    "w-full rounded-lg border border-[var(--color-border)] bg-white px-3 py-2 text-sm outline-none focus:border-[var(--color-accent)]";
  const labelClass = "block text-xs mb-1 text-[var(--color-text-dim)]";

  return (
    <section className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 mb-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-medium">Bulk distributions</h2>
        <button onClick={() => setOpen((v) => !v)} className="text-sm text-[var(--color-accent)] font-medium">
          {open ? "Cancel" : "+ Record distribution"}
        </button>
      </div>

      {open && (
        <form onSubmit={save} className="mb-5 space-y-3 rounded-lg border border-[var(--color-border)] p-4">
          {!officeId && (
            <div>
              <label className={labelClass}>Office *</label>
              <select value={form.office_id} onChange={(e) => set("office_id", e.target.value)} className={inputClass}>
                <option value="">Select…</option>
                {offices.map((o) => (
                  <option key={o.id} value={o.id}>{o.name}</option>
                ))}
              </select>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>Distribution name *</label>
              <input value={form.name} onChange={(e) => set("name", e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Date *</label>
              <input type="date" required value={form.distributed_on} onChange={(e) => set("distributed_on", e.target.value)} className={inputClass} />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className={labelClass}>People served *</label>
              <input type="number" min={1} required value={form.people_served} onChange={(e) => set("people_served", e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Households</label>
              <input type="number" min={0} value={form.households_served} onChange={(e) => set("households_served", e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Total value ($)</label>
              <input type="number" min={0} step="0.01" value={form.total_value} onChange={(e) => set("total_value", e.target.value)} className={inputClass} />
            </div>
          </div>
          <div>
            <label className={labelClass}>What was given</label>
            <input value={form.items_description} onChange={(e) => set("items_description", e.target.value)} placeholder="e.g. 40 kitchen kits, 25 blankets" className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Location</label>
            <input value={form.location} onChange={(e) => set("location", e.target.value)} className={inputClass} />
          </div>
          {error && <p className="text-sm text-[#B55139]">{error}</p>}
          <button type="submit" disabled={saving} className="w-full rounded-lg bg-[var(--color-accent)] text-white font-medium py-2 text-sm disabled:opacity-50">
            {saving ? "Saving..." : "Save distribution"}
          </button>
        </form>
      )}

      {rows.length === 0 ? (
        <p className="text-sm text-[var(--color-text-dim)]">No bulk distributions recorded yet.</p>
      ) : (
        <div className="divide-y divide-[var(--color-border)]">
          {rows.map((r) => (
            <div key={r.id} className="flex items-start justify-between gap-3 py-3 text-sm">
              <div className="min-w-0">
                <div className="font-medium">{r.name}</div>
                <div className="text-xs text-[var(--color-text-dim)]">
                  {!officeId && r.office_name ? `${r.office_name} · ` : ""}
                  {r.people_served} people
                  {r.households_served ? ` · ${r.households_served} households` : ""}
                  {r.total_value ? ` · $${Number(r.total_value).toLocaleString()}` : ""}
                  {r.items_description ? ` · ${r.items_description}` : ""}
                </div>
              </div>
              <div className="shrink-0 flex flex-col items-end gap-1">
                <div className="text-xs text-[var(--color-text-dim)]">{fmtDate(r.distributed_on)}</div>
                {r.salesforce_synced ? (
                  <span className="text-[11px] font-medium text-green-700">✓ In Salesforce</span>
                ) : (
                  <button
                    onClick={() => pushToSalesforce(r.id)}
                    disabled={pushing === r.id}
                    className="rounded-full border border-[var(--color-border)] px-2.5 py-1 text-[11px] font-medium disabled:opacity-50"
                  >
                    {pushing === r.id ? "Pushing…" : "Push to Salesforce"}
                  </button>
                )}
                {(pushMsg[r.id] || r.salesforce_error) && (
                  <span className="max-w-[12rem] text-[11px] text-[#B55139] text-right">{pushMsg[r.id] || r.salesforce_error}</span>
                )}
                {!r.salesforce_synced && (
                  <button onClick={() => remove(r.id)} className="text-[11px] text-[#B55139] underline">delete</button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
