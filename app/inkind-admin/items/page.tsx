"use client";

import { useEffect, useMemo, useState } from "react";
import { PROGRAMS } from "@/lib/inkind/programs";

type ItemRow = {
  id: string;
  code: string;
  name: string;
  program: string;
  program_code: string;
  new_price: number | null;
  used_price: number | null;
  manual_price: boolean;
  requires_note: boolean;
  active: boolean;
};

type Draft = {
  name: string;
  program: string;
  manualPrice: boolean;
  noUsedOption: boolean;
  requiresNote: boolean;
  newPrice: string;
  usedPrice: string;
};

function blankDraft(): Draft {
  return {
    name: "",
    program: PROGRAMS[0]?.name ?? "",
    manualPrice: false,
    noUsedOption: false,
    requiresNote: false,
    newPrice: "",
    usedPrice: "",
  };
}

function draftFromItem(item: ItemRow): Draft {
  return {
    name: item.name,
    program: item.program,
    manualPrice: item.manual_price,
    noUsedOption: !item.manual_price && item.used_price == null,
    requiresNote: item.requires_note,
    newPrice: item.new_price != null ? String(item.new_price) : "",
    usedPrice: item.used_price != null ? String(item.used_price) : "",
  };
}

export default function ItemsPage() {
  const [items, setItems] = useState<ItemRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [programFilter, setProgramFilter] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<Draft>(blankDraft());
  const [saving, setSaving] = useState(false);

  const [adding, setAdding] = useState(false);
  const [addDraft, setAddDraft] = useState<Draft>(blankDraft());

  async function loadItems() {
    setLoading(true);
    setError(null);
    const res = await fetch("/api/inkind-admin/items/list");
    const data = await res.json();
    if (data.items) setItems(data.items);
    else setError(data.error ?? "Failed to load items");
    setLoading(false);
  }

  useEffect(() => {
    loadItems();
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((it) => {
      if (!showInactive && !it.active) return false;
      if (programFilter && it.program !== programFilter) return false;
      if (q && !it.name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [items, search, programFilter, showInactive]);

  function startEdit(item: ItemRow) {
    setEditingId(item.id);
    setEditDraft(draftFromItem(item));
  }

  async function saveEdit(id: string) {
    setSaving(true);
    setError(null);
    const program = PROGRAMS.find((p) => p.name === editDraft.program);
    const res = await fetch("/api/inkind-admin/items/update", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id,
        name: editDraft.name,
        program: editDraft.program,
        programCode: program?.code,
        manualPrice: editDraft.manualPrice,
        requiresNote: editDraft.requiresNote,
        newPrice: editDraft.manualPrice ? null : parseFloat(editDraft.newPrice) || 0,
        usedPrice: editDraft.manualPrice || editDraft.noUsedOption ? null : parseFloat(editDraft.usedPrice) || 0,
      }),
    });
    const data = await res.json();
    setSaving(false);
    if (!data.success) {
      setError(data.error ?? "Failed to save");
      return;
    }
    setEditingId(null);
    loadItems();
  }

  async function toggleActive(item: ItemRow) {
    if (item.active && !confirm(`Remove "${item.name}" from the active list? It can be restored later.`)) {
      return;
    }
    setError(null);
    const res = await fetch("/api/inkind-admin/items/update", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: item.id, active: !item.active }),
    });
    const data = await res.json();
    if (!data.success) {
      setError(data.error ?? "Failed to update");
      return;
    }
    loadItems();
  }

  async function submitAdd(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const program = PROGRAMS.find((p) => p.name === addDraft.program);
    const res = await fetch("/api/inkind-admin/items/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: addDraft.name,
        program: addDraft.program,
        programCode: program?.code,
        manualPrice: addDraft.manualPrice,
        requiresNote: addDraft.requiresNote,
        newPrice: addDraft.manualPrice ? null : parseFloat(addDraft.newPrice) || 0,
        usedPrice: addDraft.manualPrice || addDraft.noUsedOption ? null : parseFloat(addDraft.usedPrice) || 0,
      }),
    });
    const data = await res.json();
    setSaving(false);
    if (!data.success) {
      setError(data.error ?? "Failed to add item");
      return;
    }
    setAddDraft(blankDraft());
    setAdding(false);
    loadItems();
  }

  const inactiveCount = items.filter((i) => !i.active).length;

  return (
    <main className="p-6 max-w-5xl">
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-2xl font-bold text-brand-dark">Item Price List</h1>
        <a
          href="/api/inkind-admin/items/barcode-sheet"
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs rounded-lg bg-brand px-3 py-2 font-semibold text-white hover:opacity-90"
        >
          Generate Barcode Sheet
        </a>
      </div>
      <p className="text-gray-500 text-sm mb-6">
        This is the live price list — changes here show up on the scanning screen immediately, no
        redeploy needed. "Remove" hides an item from scanning but keeps it in history; it can be
        restored anytime. "Generate Barcode Sheet" builds a fresh, printable PDF from whatever's
        active right now — it can take a few seconds for the full catalog.
      </p>

      {error && <p className="text-red-600 text-sm mb-4">{error}</p>}

      {/* Add item */}
      {adding ? (
        <form onSubmit={submitAdd} className="rounded-xl border border-gray-200 bg-white p-4 mb-6 space-y-3">
          <h2 className="font-semibold text-gray-700">Add Item</h2>
          <input
            type="text"
            placeholder="Item name (e.g. AQUARIUM)"
            value={addDraft.name}
            onChange={(e) => setAddDraft((d) => ({ ...d, name: e.target.value }))}
            className="w-full rounded-lg border border-gray-300 p-3"
            required
          />
          <select
            value={addDraft.program}
            onChange={(e) => setAddDraft((d) => ({ ...d, program: e.target.value }))}
            className="w-full rounded-lg border border-gray-300 p-3 bg-white"
          >
            {PROGRAMS.map((p) => (
              <option key={p.code} value={p.name}>
                {p.name}
              </option>
            ))}
          </select>
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={addDraft.manualPrice}
              onChange={(e) => setAddDraft((d) => ({ ...d, manualPrice: e.target.checked, noUsedOption: false }))}
            />
            Priced at intake (bulk food items — no fixed new/used price)
          </label>
          {!addDraft.manualPrice && (
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={addDraft.noUsedOption}
                onChange={(e) => setAddDraft((d) => ({ ...d, noUsedOption: e.target.checked }))}
              />
              New only — no used option (e.g. diapers)
            </label>
          )}
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={addDraft.requiresNote}
              onChange={(e) => setAddDraft((d) => ({ ...d, requiresNote: e.target.checked }))}
            />
            Prompt for a description at intake (e.g. "Rice", "Pasta" for bulk dry goods)
          </label>
          {!addDraft.manualPrice && (
            <div className="grid grid-cols-2 gap-3">
              <input
                type="number"
                step="0.01"
                min="0"
                placeholder="New price"
                value={addDraft.newPrice}
                onChange={(e) => setAddDraft((d) => ({ ...d, newPrice: e.target.value }))}
                className="w-full rounded-lg border border-gray-300 p-3"
                required
              />
              {!addDraft.noUsedOption && (
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="Used price"
                  value={addDraft.usedPrice}
                  onChange={(e) => setAddDraft((d) => ({ ...d, usedPrice: e.target.value }))}
                  className="w-full rounded-lg border border-gray-300 p-3"
                  required
                />
              )}
            </div>
          )}
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => setAdding(false)}
              className="rounded-xl bg-gray-100 px-4 py-2 font-semibold text-gray-700"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-xl bg-brand px-6 py-2 font-semibold text-white disabled:opacity-50"
            >
              {saving ? "Adding..." : "Add Item"}
            </button>
          </div>
        </form>
      ) : (
        <button
          onClick={() => setAdding(true)}
          className="mb-6 rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-white"
        >
          + Add Item
        </button>
      )}

      {/* Filters */}
      <div className="mb-4 grid grid-cols-1 sm:grid-cols-[2fr_1fr_auto] gap-3">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search items..."
          className="w-full rounded-lg border border-gray-300 p-3"
        />
        <select
          value={programFilter}
          onChange={(e) => setProgramFilter(e.target.value)}
          className="w-full rounded-lg border border-gray-300 p-3 bg-white"
        >
          <option value="">All programs</option>
          {PROGRAMS.map((p) => (
            <option key={p.code} value={p.name}>
              {p.name}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-2 text-sm text-gray-600 whitespace-nowrap px-2">
          <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />
          Show removed ({inactiveCount})
        </label>
      </div>

      {loading ? (
        <p className="text-gray-400 text-sm">Loading...</p>
      ) : (
        <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 text-left">
              <tr>
                <th className="p-3">Name</th>
                <th className="p-3">Program</th>
                <th className="p-3">New $</th>
                <th className="p-3">Used $</th>
                <th className="p-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map((item) =>
                editingId === item.id ? (
                  <tr key={item.id} className="bg-brand-light/30">
                    <td className="p-2">
                      <input
                        value={editDraft.name}
                        onChange={(e) => setEditDraft((d) => ({ ...d, name: e.target.value }))}
                        className="w-full rounded-lg border border-gray-300 p-2 mb-1"
                      />
                      <label className="flex items-center gap-1 text-[11px] text-gray-500">
                        <input
                          type="checkbox"
                          checked={editDraft.requiresNote}
                          onChange={(e) => setEditDraft((d) => ({ ...d, requiresNote: e.target.checked }))}
                        />
                        Prompt for description
                      </label>
                    </td>
                    <td className="p-2">
                      <select
                        value={editDraft.program}
                        onChange={(e) => setEditDraft((d) => ({ ...d, program: e.target.value }))}
                        className="w-full rounded-lg border border-gray-300 p-2 bg-white"
                      >
                        {PROGRAMS.map((p) => (
                          <option key={p.code} value={p.name}>
                            {p.name}
                          </option>
                        ))}
                      </select>
                    </td>
                    {editDraft.manualPrice ? (
                      <td className="p-2 text-gray-400 text-xs" colSpan={2}>
                        Priced at intake
                      </td>
                    ) : (
                      <>
                        <td className="p-2">
                          <input
                            type="number"
                            step="0.01"
                            value={editDraft.newPrice}
                            onChange={(e) => setEditDraft((d) => ({ ...d, newPrice: e.target.value }))}
                            className="w-20 rounded-lg border border-gray-300 p-2"
                          />
                        </td>
                        <td className="p-2">
                          {editDraft.noUsedOption ? (
                            <span className="text-xs text-gray-400">New only</span>
                          ) : (
                            <input
                              type="number"
                              step="0.01"
                              value={editDraft.usedPrice}
                              onChange={(e) => setEditDraft((d) => ({ ...d, usedPrice: e.target.value }))}
                              className="w-20 rounded-lg border border-gray-300 p-2 mb-1"
                            />
                          )}
                          <label className="flex items-center gap-1 text-[11px] text-gray-500">
                            <input
                              type="checkbox"
                              checked={editDraft.noUsedOption}
                              onChange={(e) => setEditDraft((d) => ({ ...d, noUsedOption: e.target.checked }))}
                            />
                            No used
                          </label>
                        </td>
                      </>
                    )}
                    <td className="p-2 whitespace-nowrap">
                      <button
                        onClick={() => saveEdit(item.id)}
                        disabled={saving}
                        className="text-xs rounded-lg bg-brand px-2 py-1.5 font-medium text-white mr-1"
                      >
                        Save
                      </button>
                      <button
                        onClick={() => setEditingId(null)}
                        className="text-xs rounded-lg bg-gray-100 px-2 py-1.5 font-medium text-gray-700"
                      >
                        Cancel
                      </button>
                    </td>
                  </tr>
                ) : (
                  <tr key={item.id} className={item.active ? "" : "opacity-50"}>
                    <td className="p-3">
                      {item.name}
                      {item.requires_note && (
                        <span className="ml-1.5 text-[10px] rounded-full bg-gray-100 text-gray-500 px-1.5 py-0.5">
                          prompts for note
                        </span>
                      )}
                    </td>
                    <td className="p-3 text-gray-500">{item.program}</td>
                    <td className="p-3">{item.manual_price ? "—" : `$${item.new_price?.toFixed(2)}`}</td>
                    <td className="p-3">
                      {item.manual_price
                        ? "—"
                        : item.used_price != null
                        ? `$${item.used_price.toFixed(2)}`
                        : "New only"}
                    </td>
                    <td className="p-3 whitespace-nowrap text-right">
                      <button
                        onClick={() => startEdit(item)}
                        className="text-xs rounded-lg bg-gray-100 px-2 py-1.5 font-medium text-gray-700 mr-1"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => toggleActive(item)}
                        className={`text-xs rounded-lg px-2 py-1.5 font-medium ${
                          item.active ? "bg-red-50 text-red-600" : "bg-brand-light text-brand-dark"
                        }`}
                      >
                        {item.active ? "Remove" : "Restore"}
                      </button>
                    </td>
                  </tr>
                )
              )}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={5} className="p-6 text-center text-gray-400 text-sm">
                    No items match.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
