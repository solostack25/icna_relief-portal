"use client";

import { useEffect, useRef, useState } from "react";
import { api, Btn, C, Card, inputStyle, MONTH_SHORT, money, Notice, num, SOURCE_LABEL, td, th } from "./ui";

type CleanedPreview = {
  kind: "cleaned";
  fileName: string;
  sheets: { name: string; scope: string; rows: number; skippedEmpty: number; unknownColumns: string[] }[];
  warnings: string[];
  unmatchedOffices: string[];
  periods: { year: number; month: number; office: number; central: number; grant: number; total: number }[];
  rows: number;
  applied?: boolean;
  saved?: number;
};
type QbClass = { qb_class: string; total: number; saved: boolean; target: string; office_name: string | null; department: string | null; subhead: string | null; reason: string | null };
type QbResult = {
  offices: number;
  grants: number;
  central: number;
  mappedTotal: number;
  skippedTotal: number;
  skipped: { qb_class: string; to: string; total: number }[];
  unmatchedOffices: string[];
  allocation: { centralTotal: number; allocated: number; offices: number; note: string | null };
};
type QbPreview = {
  kind: "qb";
  fileName: string;
  sheet: string | null;
  year: number | null;
  month: number | null;
  grandTotal: number | null;
  parsedTotal: number;
  warnings: string[];
  classes: QbClass[];
  applied?: boolean;
  result?: QbResult;
};
type Preview = CleanedPreview | QbPreview;
type Batch = { id: string; source: string; file_name: string | null; period_label: string | null; rows_count: number; status: string; created_at: string; by: string | null };

export const TARGET_LABEL: Record<string, string> = { office: "Office", grant: "Grant", central: "Central", ignore: "Ignored", review: "Needs a decision" };

export default function ImportPanel({ year, month, onApplied }: { year: number; month: number | null; onApplied: (y?: number, m?: number) => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [pYear, setPYear] = useState(year);
  const [pMonth, setPMonth] = useState(month ?? 1);
  const [batches, setBatches] = useState<Batch[]>([]);
  const ref = useRef<HTMLInputElement>(null);

  const loadBatches = () => api<{ batches: Batch[] }>("/api/admin/expenses/batches").then((r) => setBatches(r.batches)).catch(() => {});
  useEffect(() => {
    loadBatches();
  }, []);

  async function send(mode: "preview" | "apply", f = file) {
    if (!f) return;
    setBusy(true);
    setErr(null);
    const fd = new FormData();
    fd.set("file", f);
    fd.set("mode", mode);
    if (preview?.kind === "qb" || mode === "apply") {
      fd.set("year", String(pYear));
      fd.set("month", String(pMonth));
    }
    try {
      const p = await api<Preview>("/api/admin/expenses/import", { method: "POST", body: fd });
      setPreview(p);
      if (mode === "preview" && p.kind === "qb") {
        if (p.year) setPYear(p.year);
        if (p.month) setPMonth(p.month);
      }
      if (p.applied) {
        loadBatches();
        if (p.kind === "qb") onApplied(pYear, pMonth);
        else onApplied(p.periods.at(-1)?.year, p.periods.at(-1)?.month);
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function removeBatch(b: Batch) {
    if (!confirm(`Remove the rows "${b.file_name ?? SOURCE_LABEL[b.source]}" wrote? Rows a later import or edit replaced aren't touched.`)) return;
    await api(`/api/admin/expenses/batches?id=${b.id}`, { method: "DELETE" }).catch((e) => setErr(String(e)));
    loadBatches();
    onApplied();
  }

  return (
    <div style={{ maxWidth: 1000 }}>
      <Card title="Upload a file">
        <p className="text-sm mb-4" style={{ color: C.soft }}>
          Either file works: the <b>raw QuickBooks export</b> (Reports → Company &amp; Financial → Profit &amp; Loss by Class, exported to Excel — the REGION_WISE file), or the{" "}
          <b>cleaned Expenditure workbook</b> / a CSV of one of its sheets (Expense-Total, Central Expenses, Grants Expenses). You&apos;ll see a preview before anything is saved.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <input
            ref={ref}
            type="file"
            accept=".xlsx,.xlsm,.xls,.csv"
            onChange={(e) => {
              const f = e.target.files?.[0] ?? null;
              setFile(f);
              setPreview(null);
              if (f) send("preview", f);
            }}
            className="text-sm"
          />
          {busy && <span className="text-sm" style={{ color: C.soft }}>Reading…</span>}
        </div>
        <p className="text-xs mt-4" style={{ color: C.faint }}>
          Blank templates:{" "}
          <a className="underline" href="/api/admin/expenses/export?scope=office&template=1">Expense-Total</a> ·{" "}
          <a className="underline" href="/api/admin/expenses/export?scope=central&template=1">Central Expenses</a> ·{" "}
          <a className="underline" href="/api/admin/expenses/export?scope=grant&template=1">Grants Expenses</a>
        </p>
      </Card>

      {err && <Notice ok={false}>{err}</Notice>}

      {preview?.kind === "cleaned" && (
        <Card title={`${preview.applied ? "Imported" : "Preview"} · ${preview.fileName}`}>
          {preview.applied && <Notice ok>Saved {preview.saved} rows. Rows already there for the same office/department and month were replaced.</Notice>}
          <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 16 }}>
            <thead>
              <tr>
                <th style={th}>Month</th>
                <th style={{ ...th, textAlign: "right" }}>Offices</th>
                <th style={{ ...th, textAlign: "right" }}>Central rows</th>
                <th style={{ ...th, textAlign: "right" }}>Grant rows</th>
                <th style={{ ...th, textAlign: "right" }}>Expenses</th>
              </tr>
            </thead>
            <tbody>
              {preview.periods.map((p) => (
                <tr key={`${p.year}-${p.month}`}>
                  <td style={td}>{MONTH_SHORT[p.month - 1]} {p.year}</td>
                  <td style={num}>{p.office}</td>
                  <td style={num}>{p.central}</td>
                  <td style={num}>{p.grant}</td>
                  <td style={num}>{money(p.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {preview.unmatchedOffices.length > 0 && (
            <Notice ok="warn">
              Not portal offices (kept under the name in the file): {preview.unmatchedOffices.join(", ")}.
            </Notice>
          )}
          {preview.sheets.some((s) => s.unknownColumns.length) && (
            <Notice ok="warn">
              Columns not recognised (ignored): {preview.sheets.flatMap((s) => s.unknownColumns.map((c) => `${s.name}: ${c}`)).join("; ")}
            </Notice>
          )}
          {preview.warnings.map((w) => (
            <p key={w} className="text-xs mb-1" style={{ color: C.warn }}>{w}</p>
          ))}
          {!preview.applied && (
            <div className="flex gap-3 mt-3">
              <Btn onClick={() => send("apply")} disabled={busy || !preview.rows}>{busy ? "Saving…" : `Import ${preview.rows} rows`}</Btn>
              <Btn kind="ghost" onClick={() => { setPreview(null); setFile(null); if (ref.current) ref.current.value = ""; }}>Cancel</Btn>
            </div>
          )}
        </Card>
      )}

      {preview?.kind === "qb" && (
        <Card title={`${preview.applied ? "Imported" : "Preview"} · ${preview.fileName}${preview.sheet ? ` (sheet "${preview.sheet}")` : ""}`}>
          {preview.applied && preview.result && <QbResultNotice r={preview.result} />}
          <div className="flex flex-wrap items-end gap-3 mb-4">
            <label className="text-xs font-semibold" style={{ color: C.soft }}>
              Month this report covers
              <div className="flex gap-2 mt-1">
                <select value={pMonth} onChange={(e) => setPMonth(Number(e.target.value))} style={inputStyle} disabled={preview.applied}>
                  {MONTH_SHORT.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
                </select>
                <input type="number" value={pYear} onChange={(e) => setPYear(Number(e.target.value))} style={{ ...inputStyle, width: 90 }} disabled={preview.applied} />
              </div>
            </label>
            <div className="text-sm" style={{ color: C.soft }}>
              Expense lines {money(preview.parsedTotal, true)}
              {preview.grandTotal != null && (
                <>
                  {" "}· QuickBooks total {money(preview.grandTotal, true)}{" "}
                  {Math.abs(preview.grandTotal - preview.parsedTotal) < 1 ? <span style={{ color: C.good }}>✓ matches</span> : <span style={{ color: C.bad }}>differs by {money(preview.grandTotal - preview.parsedTotal, true)}</span>}
                </>
              )}
            </div>
          </div>
          <ClassTable classes={preview.classes} />
          {preview.warnings.map((w) => (
            <p key={w} className="text-xs mb-1" style={{ color: C.warn }}>{w}</p>
          ))}
          {!preview.applied && (
            <div className="flex flex-wrap items-center gap-3 mt-4">
              <Btn onClick={() => send("apply")} disabled={busy}>{busy ? "Saving…" : `Import ${MONTH_SHORT[pMonth - 1]} ${pYear}`}</Btn>
              <Btn kind="ghost" onClick={() => { setPreview(null); setFile(null); if (ref.current) ref.current.value = ""; }}>Cancel</Btn>
              <span className="text-xs" style={{ color: C.faint }}>Replaces that month&apos;s QuickBooks amounts; revenue and typed-in rows stay. Change where a class goes on Class mapping.</span>
            </div>
          )}
        </Card>
      )}

      <Card title="Recent imports">
        {batches.length ? (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={th}>When</th>
                <th style={th}>What</th>
                <th style={th}>Period</th>
                <th style={{ ...th, textAlign: "right" }}>Rows</th>
                <th style={th}>By</th>
                <th style={th} />
              </tr>
            </thead>
            <tbody>
              {batches.map((b) => (
                <tr key={b.id} style={{ opacity: b.status === "applied" ? 1 : 0.5 }}>
                  <td style={{ ...td, whiteSpace: "nowrap" }}>{new Date(b.created_at).toLocaleString()}</td>
                  <td style={td}>{b.file_name ?? SOURCE_LABEL[b.source] ?? b.source}</td>
                  <td style={td}>{b.period_label}</td>
                  <td style={num}>{b.rows_count}</td>
                  <td style={{ ...td, color: C.soft }}>{b.by ?? "—"}</td>
                  <td style={{ ...td, textAlign: "right" }}>
                    {b.status === "applied" ? <Btn kind="danger" small onClick={() => removeBatch(b)}>Remove</Btn> : <span className="text-xs" style={{ color: C.faint }}>{b.status}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="text-sm" style={{ color: C.soft }}>No imports yet.</p>
        )}
      </Card>
    </div>
  );
}

export function ClassTable({ classes }: { classes: QbClass[] }) {
  const [all, setAll] = useState(false);
  const review = classes.filter((c) => c.target === "review");
  const list = all ? classes : classes.slice(0, 12);
  return (
    <>
      {review.length > 0 && (
        <Notice ok="warn">
          {review.length} class{review.length === 1 ? "" : "es"} ({money(review.reduce((s, c) => s + c.total, 0))}) need a decision and will be left out until set on Class mapping:{" "}
          {review.map((c) => c.qb_class).join(", ")}.
        </Notice>
      )}
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={th}>QuickBooks class</th>
              <th style={th}>Goes to</th>
              <th style={{ ...th, textAlign: "right" }}>Expenses</th>
            </tr>
          </thead>
          <tbody>
            {list.map((c) => (
              <tr key={c.qb_class}>
                <td style={{ ...td, fontSize: 12 }}>{c.qb_class}</td>
                <td style={{ ...td, color: c.target === "review" ? C.warn : C.ink }}>
                  {TARGET_LABEL[c.target] ?? c.target}
                  {c.target === "central" ? `: ${c.department}${c.subhead && c.subhead !== c.department ? ` / ${c.subhead}` : ""}` : c.office_name ? `: ${c.office_name}` : ""}
                  {!c.saved && <span className="text-xs ml-2" style={{ color: C.faint }}>suggested</span>}
                </td>
                <td style={num}>{money(c.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {classes.length > 12 && (
        <button className="text-xs underline mt-2" style={{ color: C.emerald }} onClick={() => setAll(!all)}>
          {all ? "Show fewer" : `Show all ${classes.length} classes`}
        </button>
      )}
    </>
  );
}

export function QbResultNotice({ r }: { r: QbResult }) {
  return (
    <Notice ok={r.skipped.length ? "warn" : true}>
      Saved {r.offices} offices, {r.central} central lines and {r.grants} grant rows ({money(r.mappedTotal)}).{" "}
      {r.allocation.note ? `${r.allocation.note} — central costs weren't shared to offices.` : `Central costs (${money(r.allocation.centralTotal)}) shared to ${r.allocation.offices} offices by FTE.`}
      {r.skipped.length > 0 && (
        <span className="block mt-1">
          Left out {money(r.skippedTotal)} from {r.skipped.length} class{r.skipped.length === 1 ? "" : "es"} without a decision: {r.skipped.map((s) => s.qb_class).join(", ")}. Set them on Class mapping, then import again.
        </span>
      )}
      {r.unmatchedOffices.length > 0 && <span className="block mt-1">Not portal offices: {r.unmatchedOffices.join(", ")}.</span>}
    </Notice>
  );
}
