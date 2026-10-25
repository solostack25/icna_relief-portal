"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import * as XLSX from "xlsx";
import { fmtDate, money } from "@/lib/grantManagement/shared";
import { Card, Eyebrow, Notice, PillButton, api, dim, emerald, faint, gold, ink, rose, selectStyle, td, tdNum, th, thNum } from "@/components/grantManagement/ui";

type Kind = "expenses" | "pex";
type Checked = { row: number; errors: string[]; warnings: string[]; display: Record<string, string> };
type Batch = { id: string; kind: string; file_name: string | null; row_count: number; total: number; status: string; created_at: string; by: string };
type Ref = { code: string; grant: string; category: string; subcategory: string; start: string; end: string };

export default function ImportClient({ initialKind, expenseTemplate, pexTemplate, reference, batches }: { initialKind: Kind; expenseTemplate: string[]; pexTemplate: string[]; reference: Ref[]; batches: Batch[] }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [kind, setKind] = useState<Kind>(initialKind);
  const [file, setFile] = useState<{ name: string; rows: Record<string, unknown>[] } | null>(null);
  const [checked, setChecked] = useState<{ rows: Checked[]; errorCount: number; total: number } | null>(null);
  const [status, setStatus] = useState<"approved" | "submitted">("approved");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "ok" | "error" | "warn"; text: string } | null>(null);

  function reset(k?: Kind) {
    if (k) setKind(k);
    setFile(null);
    setChecked(null);
    setMsg(null);
    if (input.current) input.current.value = "";
  }

  function downloadTemplate() {
    const book = XLSX.utils.book_new();
    if (kind === "expenses") {
      const example = reference[0];
      const sample = example
        ? [
            [example.code, example.category, example.subcategory, example.start, 1250, "Payroll", "Payroll – biweekly", "Salaries 10/1–10/15", "Payroll", "PR-2026-20"],
            [example.code, example.category, example.subcategory, example.start, 95.63, "Fringe", "", "FICA on PR-2026-20", "Payroll", "PR-2026-20"],
          ]
        : [];
      XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([expenseTemplate, ...sample]), "Expenses");
      const ref = XLSX.utils.aoa_to_sheet([["Grant Code", "Grant", "Category", "Subcategory", "Period start", "Period end"], ...reference.map((r) => [r.code, r.grant, r.category, r.subcategory, r.start, r.end])]);
      ref["!cols"] = [{ wch: 18 }, { wch: 36 }, { wch: 28 }, { wch: 28 }, { wch: 12 }, { wch: 12 }];
      XLSX.utils.book_append_sheet(book, ref, "Valid codes & categories");
      const types = XLSX.utils.aoa_to_sheet([["Type"], ["Payroll"], ["Fringe"], ["Allocation"], ["Indirect"], ["Purchase"], ["Other"]]);
      XLSX.utils.book_append_sheet(book, types, "Types");
    } else {
      XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([pexTemplate]), "PEX");
    }
    XLSX.writeFile(book, kind === "expenses" ? "grant-expense-upload-template.xlsx" : "pex-upload-template.xlsx");
  }

  async function pick(f: File | undefined) {
    if (!f) return;
    setMsg(null);
    setChecked(null);
    const buf = await f.arrayBuffer();
    const wb = XLSX.read(buf, { type: "array", cellDates: false, raw: false });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "", raw: false });
    if (!rows.length) return setMsg({ tone: "error", text: "That file has no rows under the header." });
    setFile({ name: f.name, rows });
    await check(rows, f.name);
  }

  async function check(rows: Record<string, unknown>[], name: string) {
    setBusy(true);
    const r = await api<{ rows: Checked[]; errorCount: number; total: number }>("/api/grant-management/import", { method: "POST", json: { kind, rows, file_name: name } });
    setBusy(false);
    if (r.error) return setMsg({ tone: "error", text: r.error });
    setChecked(r);
  }

  async function commit() {
    if (!file || !checked) return;
    const good = checked.rows.length - checked.errorCount;
    if (!confirm(kind === "expenses" ? `Save ${checked.rows.length} expenses totalling ${money(checked.total, true)} as ${status}?` : `Add ${good} PEX transactions to the coding queue?`)) return;
    setBusy(true);
    const r = await api<{ rows: number; total: number; skipped?: number; notGrant?: number }>("/api/grant-management/import", { method: "POST", json: { kind, rows: file.rows, file_name: file.name, commit: true, status } });
    setBusy(false);
    if (r.error) return setMsg({ tone: "error", text: r.error });
    reset();
    setMsg({ tone: "ok", text: `Saved ${r.rows} ${kind === "pex" ? "PEX transactions" : "expenses"} (${money(r.total, true)})${r.skipped ? `, skipped ${r.skipped} already imported` : ""}.${r.notGrant ? ` ${r.notGrant} of them aren't on a card assigned to a grant for that date, so they stay out of Grant Management. They're still in the PEX app.` : ""}` });
    router.refresh();
  }

  async function undo(b: Batch) {
    if (!confirm(`Remove the upload "${b.file_name ?? "file"}"? ${b.kind === "pex" ? "Transactions not yet coded will be removed." : `Its ${b.row_count} expenses will be deleted.`}`)) return;
    const r = await api<{ removed: number }>(`/api/grant-management/import/${b.id}`, { method: "DELETE" });
    if (r.error) return setMsg({ tone: "error", text: r.error });
    setMsg({ tone: "ok", text: `Removed ${r.removed} rows.` });
    router.refresh();
  }

  const pexBlocking = kind === "pex" && checked ? checked.rows.filter((c) => c.errors.length && !c.errors.every((e) => e === "Already imported.")).length : 0;
  const canCommit = checked && (kind === "expenses" ? checked.errorCount === 0 : pexBlocking === 0 && checked.rows.length > checked.errorCount);
  const cols = kind === "expenses" ? ["grant", "category", "date", "type", "vendor", "description", "amount"] : ["id", "date", "holder", "merchant", "amount"];

  return (
    <div className="grid gap-4">
      <div className="flex gap-2">
        {(["expenses", "pex"] as Kind[]).map((k) => (
          <button key={k} type="button" onClick={() => reset(k)} className="text-sm rounded-full px-4 py-2 font-semibold" style={kind === k ? { background: ink, color: "#fff" } : { background: "#fff", border: "1px solid var(--portal-line)", color: dim }}>
            {k === "expenses" ? "Expenses (payroll, fringe, allocations…)" : "PEX transactions"}
          </button>
        ))}
      </div>

      <Card>
        <Eyebrow>1 · Get the file ready</Eyebrow>
        <p className="text-sm mb-3" style={{ color: dim }}>
          {kind === "expenses"
            ? "One row per entry. Grant Code and Category must match the grant's budget exactly (the template's second sheet lists every valid combination). Dates must fall inside the grant period. Payroll, fringe, allocations and indirect costs don't need receipts."
            : "Export transactions from the PEX dashboard (CSV or Excel). Each one lands in the PEX queue for the card holder to attach the receipt and code to a grant. Transactions already imported are skipped automatically."}
        </p>
        <div className="flex flex-wrap gap-2 items-center">
          <PillButton variant="ghost" onClick={downloadTemplate}>
            Download template
          </PillButton>
          <span className="text-xs" style={{ color: faint }}>
            Columns: {(kind === "expenses" ? expenseTemplate : pexTemplate).join(", ")}
          </span>
        </div>
      </Card>

      <Card>
        <Eyebrow>2 · Upload and check</Eyebrow>
        <div className="flex flex-wrap items-center gap-3">
          <PillButton onClick={() => input.current?.click()} disabled={busy}>
            {file ? "Choose a different file" : "Choose CSV or Excel file"}
          </PillButton>
          {file && (
            <span className="text-sm" style={{ color: ink }}>
              {file.name} · {file.rows.length} rows
            </span>
          )}
          {busy && <span className="text-sm" style={{ color: dim }}>Checking…</span>}
          <input ref={input} type="file" accept=".csv,.xlsx,.xls" hidden onChange={(e) => pick(e.target.files?.[0])} />
        </div>

        {checked && (
          <div className="mt-4">
            <div className="flex flex-wrap gap-4 text-sm mb-3">
              <span style={{ color: emerald }}>
                <b>{checked.rows.length - checked.errorCount}</b> ready
              </span>
              <span style={{ color: checked.errorCount ? rose : faint }}>
                <b>{checked.errorCount}</b> with errors
              </span>
              <span style={{ color: gold }}>
                <b>{checked.rows.filter((r) => r.warnings.length).length}</b> warnings
              </span>
              <span style={{ color: ink }}>
                Total <b>{money(checked.total, true)}</b>
              </span>
            </div>
            <div className="overflow-auto rounded-xl" style={{ maxHeight: 420, border: "1px solid var(--portal-line)" }}>
              <table className="w-full" style={{ borderCollapse: "separate", borderSpacing: 0 }}>
                <thead>
                  <tr>
                    <th style={th}>Row</th>
                    {cols.map((c) => (
                      <th key={c} style={c === "amount" ? thNum : th}>
                        {c}
                      </th>
                    ))}
                    <th style={th}>Check</th>
                  </tr>
                </thead>
                <tbody>
                  {[...checked.rows].sort((a, b) => b.errors.length - a.errors.length || b.warnings.length - a.warnings.length).map((r) => (
                    <tr key={r.row} style={{ background: r.errors.length ? "#FDF1F3" : r.warnings.length ? "#FFF9EC" : undefined }}>
                      <td style={td}>{r.row}</td>
                      {cols.map((c) => (
                        <td key={c} style={c === "amount" ? tdNum : td}>
                          {c === "amount" && r.display[c] ? money(Number(r.display[c]), true) : c === "date" && r.display[c] ? fmtDate(r.display[c]) : r.display[c]}
                        </td>
                      ))}
                      <td style={{ ...td, fontSize: 12 }}>
                        {r.errors.map((e) => (
                          <div key={e} style={{ color: rose }}>
                            {e}
                          </div>
                        ))}
                        {r.warnings.map((w) => (
                          <div key={w} style={{ color: gold }}>
                            {w}
                          </div>
                        ))}
                        {!r.errors.length && !r.warnings.length && <span style={{ color: emerald }}>✓</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </Card>

      {checked && (
        <Card>
          <Eyebrow>3 · Save</Eyebrow>
          {kind === "expenses" && (
            <div className="flex flex-wrap items-center gap-3 mb-3">
              <span className="text-sm" style={{ color: ink }}>
                Save these as
              </span>
              <select value={status} onChange={(e) => setStatus(e.target.value as "approved" | "submitted")} style={{ ...selectStyle, width: "auto" }}>
                <option value="approved">Approved (count as spent now)</option>
                <option value="submitted">Submitted (send through approvals)</option>
              </select>
            </div>
          )}
          {!canCommit && (
            <div className="mb-3">
              <Notice tone="warn">{kind === "expenses" ? "Fix the rows with errors in your file and upload it again. Nothing is saved until every row passes." : "Fix the rows with errors and upload again."}</Notice>
            </div>
          )}
          <PillButton disabled={!canCommit || busy} onClick={commit}>
            {busy ? "Saving…" : "Save upload"}
          </PillButton>
        </Card>
      )}

      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}

      <Card>
        <Eyebrow>Recent uploads</Eyebrow>
        {!batches.length && (
          <div className="text-sm" style={{ color: faint }}>
            No uploads yet.
          </div>
        )}
        {batches.map((b) => (
          <div key={b.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm" style={{ borderBottom: "1px dashed var(--portal-line)" }}>
            <div>
              <b style={{ color: ink }}>{b.file_name ?? "Upload"}</b>{" "}
              <span style={{ color: dim }}>
                · {b.kind === "pex" ? "PEX" : "Expenses"} · {b.row_count} rows · {money(b.total, true)} · {b.by} · {fmtDate(b.created_at)}
              </span>
            </div>
            {b.status === "removed" ? (
              <span className="text-xs" style={{ color: faint }}>
                Removed
              </span>
            ) : (
              <button type="button" onClick={() => undo(b)} className="text-xs font-semibold" style={{ color: rose }}>
                Undo upload
              </button>
            )}
          </div>
        ))}
      </Card>
    </div>
  );
}
