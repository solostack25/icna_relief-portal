"use client";

import { useMemo, useState } from "react";
import { money } from "@/lib/grantManagement/shared";
import { dim, emerald, faint, gold, ink, inputStyle, rose, selectStyle } from "./ui";

export type EditLine = { key: string; line_id?: string | null; category: string; subcategory: string | null; amount: string; actual?: number };
export type LibraryCategory = { id: string; name: string; children: { id: string; name: string }[] };

let seq = 0;
export const newKey = () => `l${Date.now()}_${seq++}`;

// Edits a grant's budget lines: categories, optional subcategories,
// amounts. Lines that already have spending can't be removed.
export default function BudgetEditor({
  lines,
  onChange,
  library,
  award,
}: {
  lines: EditLine[];
  onChange: (l: EditLine[]) => void;
  library: LibraryCategory[];
  award: number;
}) {
  const [addCat, setAddCat] = useState("");
  const [customCat, setCustomCat] = useState("");

  const groups = useMemo(() => {
    const order: string[] = [];
    const m = new Map<string, EditLine[]>();
    for (const l of lines) {
      if (!m.has(l.category)) {
        m.set(l.category, []);
        order.push(l.category);
      }
      m.get(l.category)!.push(l);
    }
    return order.map((c) => ({ category: c, lines: m.get(c)! }));
  }, [lines]);

  const total = lines.reduce((s, l) => s + (Number(l.amount) || 0), 0);
  const diff = Math.round((award - total) * 100) / 100;
  const used = new Set(groups.map((g) => g.category.toLowerCase()));

  function addCategory(name: string) {
    const n = name.trim();
    if (!n || used.has(n.toLowerCase())) return;
    const lib = library.find((c) => c.name.toLowerCase() === n.toLowerCase());
    const add: EditLine[] = lib && lib.children.length
      ? lib.children.map((s) => ({ key: newKey(), category: lib.name, subcategory: s.name, amount: "" }))
      : [{ key: newKey(), category: lib?.name ?? n, subcategory: null, amount: "" }];
    onChange([...lines, ...add]);
    setAddCat("");
    setCustomCat("");
  }
  const update = (key: string, patch: Partial<EditLine>) => onChange(lines.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const remove = (key: string) => onChange(lines.filter((l) => l.key !== key));
  function addSub(category: string, name: string) {
    const n = name.trim();
    const group = lines.filter((l) => l.category === category);
    if (!n || group.some((l) => (l.subcategory ?? "").toLowerCase() === n.toLowerCase())) return;
    // A category with one plain line becomes that line's first subcategory.
    if (group.length === 1 && !group[0].subcategory && !group[0].actual) {
      onChange(lines.map((l) => (l.key === group[0].key ? { ...l, subcategory: n } : l)));
      return;
    }
    const idx = lines.map((l) => l.category).lastIndexOf(category);
    const next = [...lines];
    next.splice(idx + 1, 0, { key: newKey(), category, subcategory: n, amount: "" });
    onChange(next);
  }

  return (
    <div>
      {groups.length === 0 && (
        <div className="text-sm rounded-xl px-4 py-6 text-center mb-3" style={{ color: dim, border: "1.5px dashed var(--portal-line)" }}>
          Add the categories from the funder-approved budget.
        </div>
      )}
      <div className="grid gap-3">
        {groups.map((g) => {
          const sub = g.lines.reduce((s, l) => s + (Number(l.amount) || 0), 0);
          const lib = library.find((c) => c.name.toLowerCase() === g.category.toLowerCase());
          const hasSubs = g.lines.some((l) => l.subcategory);
          const missing = (lib?.children ?? []).filter((c) => !g.lines.some((l) => (l.subcategory ?? "").toLowerCase() === c.name.toLowerCase()));
          return (
            <div key={g.category} className="rounded-2xl" style={{ border: "1px solid var(--portal-line)", background: "#fff" }}>
              <div className="flex items-center justify-between gap-2 px-4 py-2.5" style={{ borderBottom: hasSubs ? "1px solid var(--portal-line)" : undefined, background: "#FDFBF6", borderRadius: hasSubs ? "16px 16px 0 0" : 16 }}>
                <div className="font-bold text-sm" style={{ color: ink }}>
                  {g.category}
                </div>
                {hasSubs ? (
                  <div className="text-sm font-semibold" style={{ fontFamily: "'IBM Plex Mono', monospace", color: ink }}>
                    {money(sub, true)}
                  </div>
                ) : (
                  <LineAmount line={g.lines[0]} onAmount={(v) => update(g.lines[0].key, { amount: v })} onRemove={() => remove(g.lines[0].key)} />
                )}
              </div>
              {hasSubs &&
                g.lines.map((l) => (
                  <div key={l.key} className="flex items-center justify-between gap-2 px-4 py-2" style={{ borderBottom: "1px solid rgba(22,48,43,0.05)" }}>
                    <input
                      value={l.subcategory ?? ""}
                      onChange={(e) => update(l.key, { subcategory: e.target.value })}
                      style={{ ...inputStyle, padding: "6px 10px", fontSize: 13, maxWidth: 280 }}
                      aria-label="Subcategory"
                    />
                    <LineAmount line={l} onAmount={(v) => update(l.key, { amount: v })} onRemove={() => remove(l.key)} />
                  </div>
                ))}
              <div className="flex flex-wrap items-center gap-2 px-4 py-2">
                {missing.slice(0, 6).map((m) => (
                  <button key={m.id} type="button" onClick={() => addSub(g.category, m.name)} className="text-xs rounded-full px-2.5 py-1" style={{ color: emerald, border: `1px solid ${emerald}44` }}>
                    + {m.name}
                  </button>
                ))}
                <SubAdder onAdd={(n) => addSub(g.category, n)} />
                {!g.lines.some((l) => l.actual) && (
                  <button type="button" onClick={() => onChange(lines.filter((l) => l.category !== g.category))} className="text-xs ml-auto" style={{ color: rose }}>
                    Remove category
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-2 mt-3">
        <select value={addCat} onChange={(e) => (e.target.value === "__custom" ? setAddCat("__custom") : addCategory(e.target.value))} style={{ ...selectStyle, maxWidth: 260 }}>
          <option value="">+ Add a category…</option>
          {library
            .filter((c) => !used.has(c.name.toLowerCase()))
            .map((c) => (
              <option key={c.id} value={c.name}>
                {c.name}
                {c.children.length ? ` (${c.children.length} subcategories)` : ""}
              </option>
            ))}
          <option value="__custom">Something else…</option>
        </select>
        {addCat === "__custom" && (
          <>
            <input autoFocus placeholder="Category name" value={customCat} onChange={(e) => setCustomCat(e.target.value)} onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addCategory(customCat))} style={{ ...inputStyle, maxWidth: 220 }} />
            <button type="button" onClick={() => addCategory(customCat)} className="text-sm font-semibold" style={{ color: emerald }}>
              Add
            </button>
          </>
        )}
      </div>

      <div className="mt-4 rounded-2xl px-4 py-3 flex flex-wrap justify-between gap-2" style={{ background: "#FDFBF6", border: "1px solid var(--portal-line)" }}>
        <div className="text-sm font-bold" style={{ color: ink }}>
          Budget total <span style={{ fontFamily: "'IBM Plex Mono', monospace" }}>{money(total, true)}</span>
        </div>
        <div className="text-sm" style={{ color: diff === 0 ? emerald : diff < 0 ? rose : gold }}>
          {diff === 0 ? "Matches the award ✓" : diff > 0 ? `${money(diff, true)} of the ${money(award)} award not budgeted yet` : `${money(-diff, true)} over the ${money(award)} award`}
        </div>
      </div>
    </div>
  );
}

function LineAmount({ line, onAmount, onRemove }: { line: EditLine; onAmount: (v: string) => void; onRemove: () => void }) {
  return (
    <div className="flex items-center gap-2">
      {!!line.actual && (
        <span className="text-[11px] hidden sm:inline" style={{ color: faint }}>
          spent {money(line.actual)}
        </span>
      )}
      <div className="relative">
        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-sm" style={{ color: faint }}>
          $
        </span>
        <input
          inputMode="decimal"
          value={line.amount}
          onChange={(e) => onAmount(e.target.value.replace(/[^0-9.]/g, ""))}
          placeholder="0.00"
          style={{ ...inputStyle, padding: "6px 10px 6px 20px", width: 130, textAlign: "right", fontFamily: "'IBM Plex Mono', monospace", fontSize: 13, borderColor: line.actual && Number(line.amount) < line.actual ? rose : undefined }}
          aria-label="Amount"
        />
      </div>
      <button type="button" disabled={!!line.actual} onClick={onRemove} title={line.actual ? "Has spending; set to 0 instead" : "Remove"} className="text-lg leading-none w-6 disabled:opacity-20" style={{ color: rose }}>
        ×
      </button>
    </div>
  );
}

function SubAdder({ onAdd }: { onAdd: (n: string) => void }) {
  const [open, setOpen] = useState(false);
  const [v, setV] = useState("");
  if (!open)
    return (
      <button type="button" onClick={() => setOpen(true)} className="text-xs" style={{ color: dim }}>
        + subcategory
      </button>
    );
  const done = () => {
    onAdd(v);
    setV("");
    setOpen(false);
  };
  return (
    <span className="inline-flex gap-1">
      <input autoFocus value={v} onChange={(e) => setV(e.target.value)} onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), done())} placeholder="Subcategory" style={{ ...inputStyle, padding: "4px 8px", fontSize: 12, width: 150 }} />
      <button type="button" onClick={done} className="text-xs font-semibold" style={{ color: emerald }}>
        Add
      </button>
    </span>
  );
}
