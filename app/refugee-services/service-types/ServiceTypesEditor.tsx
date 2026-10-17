"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type ServiceType = {
  id: string;
  name: string;
  category: string | null;
  default_value: number | null;
  is_active: boolean;
  sort_order: number;
};

export default function ServiceTypesEditor({ initial }: { initial: ServiceType[] }) {
  const supabase = createClient();
  const router = useRouter();
  const [rows, setRows] = useState(initial);
  const [dirty, setDirty] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [newType, setNewType] = useState({ name: "", category: "", default_value: "" });

  function edit(id: string, patch: Partial<ServiceType>) {
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));
    setDirty((d) => new Set(d).add(id));
    setMessage(null);
  }

  async function saveAll() {
    setSaving(true);
    setMessage(null);
    for (const r of rows.filter((x) => dirty.has(x.id))) {
      const { error } = await supabase
        .from("rsce_service_types")
        .update({
          name: r.name.trim(),
          category: r.category?.trim() || null,
          default_value: r.default_value,
          is_active: r.is_active,
        })
        .eq("id", r.id);
      if (error) {
        setSaving(false);
        return setMessage(`Couldn't save "${r.name}": ${error.message}`);
      }
    }
    setSaving(false);
    setDirty(new Set());
    setMessage("Saved.");
    router.refresh();
  }

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!newType.name.trim()) return;
    const { data, error } = await supabase
      .from("rsce_service_types")
      .insert({
        name: newType.name.trim(),
        category: newType.category.trim() || null,
        default_value: newType.default_value ? Number(newType.default_value) : null,
        sort_order: 500,
      })
      .select("id, name, category, default_value, is_active, sort_order")
      .single();
    if (error) return setMessage(error.message);
    setRows((rs) => [...rs, { ...data, default_value: data.default_value === null ? null : Number(data.default_value) }]);
    setNewType({ name: "", category: "", default_value: "" });
  }

  const cell = "rounded border border-[var(--color-border)] bg-white px-2 py-1.5 text-sm w-full";

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-[var(--color-text-dim)]">
              <th className="pb-2 pr-2">Service</th>
              <th className="pb-2 pr-2 w-36">Category</th>
              <th className="pb-2 pr-2 w-28">Default $</th>
              <th className="pb-2 w-16 text-center">Active</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className={r.is_active ? "" : "opacity-50"}>
                <td className="py-1 pr-2">
                  <input value={r.name} onChange={(e) => edit(r.id, { name: e.target.value })} className={cell} />
                </td>
                <td className="py-1 pr-2">
                  <input value={r.category ?? ""} onChange={(e) => edit(r.id, { category: e.target.value })} className={cell} />
                </td>
                <td className="py-1 pr-2">
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    placeholder="—"
                    value={r.default_value ?? ""}
                    onChange={(e) => edit(r.id, { default_value: e.target.value === "" ? null : Number(e.target.value) })}
                    className={cell}
                  />
                </td>
                <td className="py-1 text-center">
                  <input
                    type="checkbox"
                    checked={r.is_active}
                    onChange={(e) => edit(r.id, { is_active: e.target.checked })}
                    className="h-4 w-4 accent-[var(--color-accent)]"
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="flex items-center gap-3 mt-4">
          <button
            onClick={saveAll}
            disabled={saving || dirty.size === 0}
            className="rounded-lg bg-[var(--color-accent)] text-white text-sm font-medium px-4 py-2 disabled:opacity-40"
          >
            {saving ? "Saving..." : `Save changes${dirty.size ? ` (${dirty.size})` : ""}`}
          </button>
          {message && <span className="text-sm text-[var(--color-text-dim)]">{message}</span>}
        </div>
      </section>

      <form onSubmit={add} className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 grid grid-cols-1 sm:grid-cols-[1fr_9rem_7rem_auto] gap-2 items-end">
        <div>
          <label className="block text-xs mb-1 text-[var(--color-text-dim)]">New service</label>
          <input value={newType.name} onChange={(e) => setNewType({ ...newType, name: e.target.value })} className={cell} />
        </div>
        <div>
          <label className="block text-xs mb-1 text-[var(--color-text-dim)]">Category</label>
          <input value={newType.category} onChange={(e) => setNewType({ ...newType, category: e.target.value })} className={cell} />
        </div>
        <div>
          <label className="block text-xs mb-1 text-[var(--color-text-dim)]">Default $</label>
          <input type="number" min={0} step="0.01" value={newType.default_value} onChange={(e) => setNewType({ ...newType, default_value: e.target.value })} className={cell} />
        </div>
        <button className="rounded-lg border border-[var(--color-accent)] text-[var(--color-accent)] text-sm font-medium px-4 py-1.5">Add</button>
      </form>
    </div>
  );
}
