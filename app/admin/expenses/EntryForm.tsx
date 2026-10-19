"use client";

import { useMemo, useState } from "react";
import { ACCOUNTS, GROUPS, type AccountGroup } from "@/lib/finance/accounts";
import { DEPARTMENT_ORDER } from "@/lib/finance/layout";
import { api, Btn, C, Card, inputStyle, MONTH_SHORT, money, Notice, SOURCE_LABEL } from "./ui";
import type { Office } from "./ExpensesClient";

export type RowData = {
  id: string;
  year: number;
  month: number;
  scope: "office" | "central" | "grant";
  office_id: string | null;
  office_name: string | null;
  region: string | null;
  state: string | null;
  department: string | null;
  subhead: string | null;
  revenue: number | null;
  central_share: number | null;
  amounts: Record<string, number>;
  expenses_total: number;
  source: string;
  notes: string | null;
  updated_at: string;
};

// "Posted to parent" accounts are rare and only come from QuickBooks;
// hide them from typing unless the row already has a value there.
const PARENT_ONLY = new Set(["6500", "6502", "6503", "6505", "6510", "8000", "8000-7", "9000"]);

export default function EntryForm({
  year,
  month,
  offices,
  rows,
  initial,
  onSaved,
  onDone,
}: {
  year: number;
  month: number;
  offices: Office[];
  rows: RowData[];
  initial: RowData | null;
  onSaved: () => void;
  onDone: () => void;
}) {
  const [scope, setScope] = useState<RowData["scope"]>(initial?.scope ?? "office");
  const [office, setOffice] = useState(initial?.office_name ?? "");
  const [department, setDepartment] = useState(initial?.department ?? "");
  const [subhead, setSubhead] = useState(initial?.subhead ?? "");
  const [revenue, setRevenue] = useState(initial?.revenue != null ? String(initial.revenue) : "");
  const [share, setShare] = useState(initial?.central_share != null ? String(initial.central_share) : "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [amounts, setAmounts] = useState<Record<string, string>>(() =>
    Object.fromEntries(Object.entries(initial?.amounts ?? {}).map(([k, v]) => [k, String(v)]))
  );
  const [open, setOpen] = useState<Record<string, boolean>>(() => {
    const o: Record<string, boolean> = { personnel: true, operational: true };
    for (const k of Object.keys(initial?.amounts ?? {})) {
      const a = ACCOUNTS.find((x) => x.key === k);
      if (a) o[a.group] = true;
    }
    return o;
  });
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  // Typing an office/department that already has a row this month loads it.
  const existing = useMemo(() => {
    const key = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (scope === "central") return rows.find((r) => r.scope === "central" && key(r.department ?? "") === key(department) && key(r.subhead ?? "") === key(subhead || department)) ?? null;
    return rows.find((r) => r.scope === scope && key(r.office_name ?? "") === key(office)) ?? null;
  }, [rows, scope, office, department, subhead]);
  const editingOther = existing && existing.id !== initial?.id;

  const n = (s: string | undefined) => (s && Number.isFinite(Number(s)) ? Number(s) : 0);
  const groupSum = (g: AccountGroup) => ACCOUNTS.filter((a) => a.group === g).reduce((s, a) => s + n(amounts[a.key]), 0);
  const total = ACCOUNTS.reduce((s, a) => s + n(amounts[a.key]), 0);
  const subheads = [...new Set(rows.filter((r) => r.scope === "central" && (!department || r.department === department)).map((r) => r.subhead).filter(Boolean))] as string[];
  const departments = [...new Set([...Object.keys(DEPARTMENT_ORDER), ...rows.filter((r) => r.scope === "central").map((r) => r.department ?? "")])].filter(Boolean).sort((a, b) => (DEPARTMENT_ORDER[a] ?? 99) - (DEPARTMENT_ORDER[b] ?? 99));

  function loadRow(r: RowData) {
    setAmounts(Object.fromEntries(Object.entries(r.amounts ?? {}).map(([k, v]) => [k, String(v)])));
    setRevenue(r.revenue != null ? String(r.revenue) : "");
    setShare(r.central_share != null ? String(r.central_share) : "");
    setNotes(r.notes ?? "");
  }

  async function save() {
    setSaving(true);
    setMsg(null);
    try {
      const res = await api<{ allocation: { allocated: number; offices: number; note: string | null } | null }>("/api/admin/expenses/row", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ year, month, scope, office_name: office, department, subhead, revenue, central_share: share, amounts, notes }),
      });
      const a = res.allocation;
      setMsg({
        ok: true,
        text: `Saved.${a ? (a.note ? ` ${a.note} — central costs weren't shared.` : ` Central costs re-shared to ${a.offices} offices (${money(a.allocated)}).`) : ""}`,
      });
      onSaved();
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : String(e) });
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    const id = existing?.id ?? initial?.id;
    if (!id || !confirm("Delete this row for the month?")) return;
    try {
      await api(`/api/admin/expenses/row?id=${id}`, { method: "DELETE" });
      onSaved();
      onDone();
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : String(e) });
    }
  }

  const row = existing ?? initial;
  return (
    <div style={{ maxWidth: 920 }}>
      <Card
        title={`${row ? "Edit" : "New"} row · ${MONTH_SHORT[month - 1]} ${year}`}
        right={row ? <span className="text-xs" style={{ color: C.faint }}>From {SOURCE_LABEL[row.source] ?? row.source} · updated {new Date(row.updated_at).toLocaleDateString()}</span> : null}
      >
        <div className="flex flex-wrap gap-2 mb-4">
          {(["office", "central", "grant"] as const).map((s) => (
            <button
              key={s}
              onClick={() => setScope(s)}
              className="rounded-full text-xs font-semibold"
              style={{ padding: "6px 14px", background: scope === s ? C.emerald : "transparent", color: scope === s ? "#fff" : C.emerald, border: `1px solid rgba(31,111,84,0.35)` }}
            >
              {s === "office" ? "Field office" : s === "central" ? "Central department" : "Grant"}
            </button>
          ))}
        </div>

        <div className="grid gap-3 mb-2" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}>
          {scope === "central" ? (
            <>
              <label className="text-xs font-semibold" style={{ color: C.soft }}>
                Department
                <input list="exp-depts" value={department} onChange={(e) => setDepartment(e.target.value.toUpperCase())} style={{ ...inputStyle, width: "100%", marginTop: 4 }} />
                <datalist id="exp-depts">{departments.map((d) => <option key={d} value={d} />)}</datalist>
              </label>
              <label className="text-xs font-semibold" style={{ color: C.soft }}>
                Subhead
                <input list="exp-subs" value={subhead} onChange={(e) => setSubhead(e.target.value.toUpperCase())} placeholder="Same as department" style={{ ...inputStyle, width: "100%", marginTop: 4 }} />
                <datalist id="exp-subs">{subheads.map((d) => <option key={d} value={d} />)}</datalist>
              </label>
            </>
          ) : (
            <label className="text-xs font-semibold" style={{ color: C.soft }}>
              Office
              <input list="exp-offices" value={office} onChange={(e) => setOffice(e.target.value)} style={{ ...inputStyle, width: "100%", marginTop: 4 }} />
              <datalist id="exp-offices">{offices.map((o) => <option key={o.id} value={o.name} />)}</datalist>
            </label>
          )}
          {scope !== "central" && (
            <label className="text-xs font-semibold" style={{ color: C.soft }}>
              {scope === "grant" ? "Grant revenue" : "Revenue"}
              <input inputMode="decimal" value={revenue} onChange={(e) => setRevenue(e.target.value)} style={{ ...inputStyle, width: "100%", marginTop: 4 }} />
            </label>
          )}
          {scope === "office" && (
            <label className="text-xs font-semibold" style={{ color: C.soft }}>
              Central departments share
              <input inputMode="decimal" value={share} onChange={(e) => setShare(e.target.value)} style={{ ...inputStyle, width: "100%", marginTop: 4 }} />
              <span className="block font-normal mt-1" style={{ color: C.faint }}>Set automatically from FTE when central costs change.</span>
            </label>
          )}
        </div>

        {editingOther && (
          <Notice ok="warn">
            This {scope === "central" ? "department" : "office"} already has a row this month ({money(existing!.expenses_total)}). Saving replaces it.{" "}
            <button className="underline font-semibold" onClick={() => loadRow(existing!)}>Load its amounts</button>
          </Notice>
        )}
      </Card>

      {GROUPS.map((g) => {
        const list = ACCOUNTS.filter((a) => a.group === g.key && (!PARENT_ONLY.has(a.key) || amounts[a.key]));
        const s = groupSum(g.key);
        return (
          <Card key={g.key} style={{ padding: 0 }}>
            <button onClick={() => setOpen({ ...open, [g.key]: !open[g.key] })} className="w-full flex items-center justify-between px-5 py-4">
              <span className="text-sm font-bold" style={{ color: C.ink }}>
                <span style={{ color: C.faint, display: "inline-block", width: 16 }}>{open[g.key] ? "▾" : "▸"}</span>
                {g.label}
              </span>
              <span className="text-sm font-semibold" style={{ color: s ? C.ink : C.faint, fontVariantNumeric: "tabular-nums" }}>{money(s, true)}</span>
            </button>
            {open[g.key] && (
              <div className="grid gap-x-4 gap-y-2 px-5 pb-5" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))" }}>
                {list.map((a) => (
                  <label key={a.key} className="flex items-center justify-between gap-2 text-sm" style={{ color: C.ink }}>
                    <span style={{ minWidth: 0 }}>
                      <span className="text-xs mr-1" style={{ color: C.faint }}>{a.key.replace("-other", "")}</span>
                      {a.label}
                    </span>
                    <input
                      inputMode="decimal"
                      value={amounts[a.key] ?? ""}
                      onChange={(e) => setAmounts({ ...amounts, [a.key]: e.target.value })}
                      style={{ ...inputStyle, width: 120, textAlign: "right" }}
                    />
                  </label>
                ))}
              </div>
            )}
          </Card>
        );
      })}

      <Card>
        <label className="text-xs font-semibold block mb-4" style={{ color: C.soft }}>
          Notes
          <input value={notes} onChange={(e) => setNotes(e.target.value)} style={{ ...inputStyle, width: "100%", marginTop: 4 }} />
        </label>
        {msg && <Notice ok={msg.ok}>{msg.text}</Notice>}
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-sm font-bold mr-auto" style={{ color: C.ink }}>
            Expenses {money(total, true)}
            {scope === "office" && n(share) ? <span style={{ color: C.soft, fontWeight: 500 }}> · with central share {money(total + n(share), true)}</span> : null}
          </span>
          {(existing || initial) && <Btn kind="danger" onClick={remove}>Delete</Btn>}
          <Btn kind="ghost" onClick={onDone}>Back</Btn>
          <Btn onClick={save} disabled={saving}>{saving ? "Saving…" : "Save"}</Btn>
        </div>
      </Card>
    </div>
  );
}
