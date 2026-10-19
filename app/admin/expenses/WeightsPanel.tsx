"use client";

import { useEffect, useState } from "react";
import { api, Btn, C, Card, inputStyle, Notice, num, td, th } from "./ui";
import type { Office } from "./ExpensesClient";

type W = { office_name: string; fte: string };

// Central department costs are shared to offices in proportion to FTE:
// office share = central total × office FTE ÷ total FTE.
export default function WeightsPanel({ year, offices, onSaved }: { year: number; offices: Office[]; onSaved: () => void }) {
  const [rows, setRows] = useState<W[] | null>(null);
  const [add, setAdd] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setRows(null);
    api<{ weights: { office_name: string; fte: number }[] }>(`/api/admin/expenses/weights?year=${year}`)
      .then((r) => setRows(r.weights.map((w) => ({ office_name: w.office_name, fte: String(w.fte) }))))
      .catch((e) => setMsg({ ok: false, text: String(e) }));
  }, [year]);

  if (!rows) return <p className="text-sm" style={{ color: C.soft }}>Loading…</p>;
  const total = rows.reduce((s, r) => s + (Number(r.fte) || 0), 0);

  async function save(reshare: boolean) {
    setBusy(true);
    setMsg(null);
    try {
      await api("/api/admin/expenses/weights", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ year, weights: rows }) });
      let text = "Saved.";
      if (reshare) {
        const r = await api<{ results: { month: number }[] }>("/api/admin/expenses/weights", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ year }) });
        text = `Saved, and central costs re-shared for ${r.results.length} month${r.results.length === 1 ? "" : "s"} of ${year}.`;
        onSaved();
      }
      setMsg({ ok: true, text });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(false);
    }
  }

  const missing = offices.filter((o) => !rows.some((r) => r.office_name.toLowerCase() === o.name.toLowerCase()));
  return (
    <div style={{ maxWidth: 720 }}>
      <Card title={`FTE by office · ${year}`} right={<span className="text-sm font-semibold" style={{ color: C.ink }}>{total.toLocaleString()} FTE</span>}>
        <p className="text-sm mb-4" style={{ color: C.soft }}>
          Each office&apos;s share of central department costs is its FTE ÷ total FTE. Offices not listed get no share. Saving doesn&apos;t change months already done unless you re-share.
        </p>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={th}>Office</th>
              <th style={{ ...th, textAlign: "right" }}>FTE</th>
              <th style={{ ...th, textAlign: "right" }}>Share</th>
              <th style={th} />
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.office_name}>
                <td style={td}>{r.office_name}</td>
                <td style={{ ...td, textAlign: "right" }}>
                  <input
                    inputMode="decimal"
                    value={r.fte}
                    onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, fte: e.target.value } : x)))}
                    style={{ ...inputStyle, width: 80, textAlign: "right" }}
                  />
                </td>
                <td style={num}>{total ? `${(((Number(r.fte) || 0) / total) * 100).toFixed(2)}%` : "—"}</td>
                <td style={{ ...td, textAlign: "right" }}>
                  <button className="text-xs underline" style={{ color: C.bad }} onClick={() => setRows(rows.filter((_, j) => j !== i))}>Remove</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="flex flex-wrap items-center gap-2 mt-4">
          <select value={add} onChange={(e) => setAdd(e.target.value)} style={inputStyle}>
            <option value="">Add an office…</option>
            {missing.map((o) => <option key={o.id}>{o.name}</option>)}
          </select>
          <Btn kind="ghost" small disabled={!add} onClick={() => { setRows([...rows, { office_name: add, fte: "1" }].sort((a, b) => a.office_name.localeCompare(b.office_name))); setAdd(""); }}>Add</Btn>
        </div>
      </Card>
      {msg && <Notice ok={msg.ok}>{msg.text}</Notice>}
      <div className="flex flex-wrap gap-3">
        <Btn onClick={() => save(true)} disabled={busy}>{busy ? "Saving…" : `Save and re-share ${year}`}</Btn>
        <Btn kind="ghost" onClick={() => save(false)} disabled={busy}>Save only</Btn>
      </div>
    </div>
  );
}
