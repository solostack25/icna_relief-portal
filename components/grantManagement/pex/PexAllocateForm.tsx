"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import DocUploader, { type Doc } from "@/components/grantManagement/DocUploader";
import { api, Card, dim, emerald, faint, Field, gold, ink, inputStyle, Notice, PillButton, rose, selectStyle } from "@/components/grantManagement/ui";
import { lineLabel, money } from "@/lib/grantManagement/shared";
import type { EntryGrant } from "@/lib/grantManagement/server";

type Row = { grant_id: string; line_id: string; amount: string; description: string };
type PexAttachment = { id: string; size: number | null; created: string | null };

const r2 = (n: number) => Math.round(n * 100) / 100;
const num = (s: string) => (s.trim() === "" ? 0 : Number(s));

export default function PexAllocateForm({
  tx,
  grants,
  suggestion,
  linkedGrantIds,
}: {
  tx: { id: string; amount: number; left: number; nonGrant: number; nonGrantNote: string | null; merchant: string | null; memo: string | null; fromPex: boolean };
  grants: EntryGrant[];
  suggestion: { grantId: string | null; lineId: string | null };
  linkedGrantIds: string[];
}) {
  const router = useRouter();
  const refund = tx.amount < 0;
  const sign = refund ? -1 : 1;
  const firstGrant = suggestion.grantId && grants.some((g) => g.id === suggestion.grantId) ? suggestion.grantId : "";
  const blank = (amount: number, grantId = ""): Row => ({
    grant_id: grantId,
    line_id: grantId === firstGrant && suggestion.lineId ? suggestion.lineId : "",
    amount: amount ? Math.abs(amount).toFixed(2) : "",
    description: "",
  });
  const [rows, setRows] = useState<Row[]>([blank(tx.left, firstGrant)]);
  const [ngOn, setNgOn] = useState(false);
  const [ngAmount, setNgAmount] = useState("");
  const [ngNote, setNgNote] = useState(tx.nonGrantNote ?? "");
  const [docs, setDocs] = useState<Doc[]>([]);
  const [pexDocs, setPexDocs] = useState<PexAttachment[] | null>(null);
  const [usePex, setUsePex] = useState<Set<string>>(new Set());
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<{ tone: "error" | "ok" | "warn"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!tx.fromPex) return;
    api<{ attachments: PexAttachment[] }>(`/api/grant-management/pex/${tx.id}/attachments`).then((r) => {
      const list = r.attachments ?? [];
      setPexDocs(list);
      setUsePex(new Set(list.map((a) => a.id)));
    });
  }, [tx.id, tx.fromPex]);

  // Linked (designated) grants first in the picker.
  const ordered = useMemo(() => [...grants].sort((a, b) => Number(linkedGrantIds.includes(b.id)) - Number(linkedGrantIds.includes(a.id))), [grants, linkedGrantIds]);
  const grantById = useMemo(() => new Map(grants.map((g) => [g.id, g])), [grants]);

  // Amounts are typed as positive numbers; refunds are flipped on save.
  const allocated = r2(rows.reduce((s, r) => s + num(r.amount), 0));
  const ng = ngOn ? num(ngAmount) : 0;
  const unassigned = r2(Math.abs(tx.left) - allocated - ng);

  function set(i: number, patch: Partial<Row>) {
    setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch, ...(patch.grant_id !== undefined && patch.grant_id !== r.grant_id ? { line_id: "" } : {}) } : r)));
  }
  function addRow() {
    setRows((rs) => [...rs, blank(Math.max(0, unassigned))]);
  }
  function splitEvenly() {
    const n = rows.length;
    const total = Math.abs(tx.left) - ng;
    const each = Math.floor((total / n) * 100) / 100;
    setRows((rs) => rs.map((r, i) => ({ ...r, amount: (i === n - 1 ? r2(total - each * (n - 1)) : each).toFixed(2) })));
  }

  async function save(submit: boolean) {
    setBusy(true);
    setErrors({});
    setMsg(null);
    const splits = rows
      .filter((r) => r.grant_id || r.line_id || num(r.amount))
      .map((r) => ({ grant_id: r.grant_id, line_id: r.line_id, amount: r2(num(r.amount) * sign), description: r.description }));
    const body: Record<string, unknown> = {
      splits,
      document_ids: docs.map((d) => d.id),
      pex_attachment_ids: [...usePex],
      submit,
    };
    if (ngOn) {
      body.non_grant_amount = r2((Math.abs(tx.nonGrant) + ng) * sign);
      body.non_grant_note = ngNote;
    }
    const r = await api<{ status: string; warnings: string[]; expenseIds: string[] }>(`/api/grant-management/pex/${tx.id}/allocate`, { method: "POST", json: body });
    setBusy(false);
    if (r.error) {
      setErrors(r.fields ?? {});
      setMsg({ tone: "error", text: r.error });
      return;
    }
    if (r.warnings?.length) setMsg({ tone: "warn", text: r.warnings.join(" ") });
    else setMsg({ tone: "ok", text: r.status === "coded" ? "All coded." : r.status === "partial" ? "Saved. Some of this transaction is still unassigned." : "Saved." });
    setDocs([]);
    router.refresh();
  }

  const docsNeeded = rows.some((r) => {
    const g = grantById.get(r.grant_id);
    return g && Math.abs(num(r.amount)) > g.doc_required_over;
  });
  const haveDocs = docs.length > 0 || usePex.size > 0;

  return (
    <Card>
      <div className="flex flex-wrap items-baseline justify-between gap-2 mb-4">
        <div className="text-sm font-bold" style={{ color: ink }}>
          {rows.length > 1 ? `Split across ${rows.length} grant lines` : "Code to a grant"}
        </div>
        <div className="text-xs" style={{ color: dim }}>
          {money(Math.abs(tx.left), true)} {refund ? "refund " : ""}to assign
        </div>
      </div>

      <div className="space-y-4">
        {rows.map((r, i) => {
          const g = grantById.get(r.grant_id);
          return (
            <div key={i} className="rounded-2xl p-4" style={{ background: "rgba(22,48,43,0.03)", border: "1px solid var(--portal-line)" }}>
              <div className="grid sm:grid-cols-[1.4fr_1.2fr_0.7fr] gap-3">
                <Field label={rows.length > 1 ? `Grant ${i + 1}` : "Grant"} required error={errors[`splits.${i}.grant_id`]}>
                  <select style={selectStyle} value={r.grant_id} onChange={(e) => set(i, { grant_id: e.target.value })}>
                    <option value="">Pick the grant…</option>
                    {ordered.map((x) => (
                      <option key={x.id} value={x.id}>
                        {x.code} · {x.name}
                        {linkedGrantIds.includes(x.id) ? "  (this card's grant)" : ""}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Budget category" required error={errors[`splits.${i}.line_id`]}>
                  <select style={selectStyle} value={r.line_id} disabled={!g} onChange={(e) => set(i, { line_id: e.target.value })}>
                    <option value="">{g ? "Pick the category…" : "Pick a grant first"}</option>
                    {(g?.lines ?? []).map((l) => (
                      <option key={l.id} value={l.id}>
                        {lineLabel(l)}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label={refund ? "Refund amount" : "Amount"} required error={errors[`splits.${i}.amount`]}>
                  <input style={{ ...inputStyle, fontFamily: "'IBM Plex Mono', monospace" }} inputMode="decimal" value={r.amount} onChange={(e) => set(i, { amount: e.target.value.replace(/[^\d.]/g, "") })} />
                </Field>
              </div>
              <div className="mt-3 flex gap-3 items-end">
                <div className="flex-1">
                  <Field label="What was it for?" hint={i === 0 && tx.memo ? `PEX note: ${tx.memo}` : undefined} error={errors[`splits.${i}.description`]}>
                    <input style={inputStyle} value={r.description} placeholder={tx.memo ?? `Purchase at ${tx.merchant ?? "merchant"}`} onChange={(e) => set(i, { description: e.target.value })} />
                  </Field>
                </div>
                {rows.length > 1 && (
                  <button type="button" className="text-xs font-semibold mb-3" style={{ color: rose }} onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))}>
                    Remove
                  </button>
                )}
              </div>
            </div>
          );
        })}

        <div className="flex flex-wrap gap-3 text-sm">
          <button type="button" className="font-semibold" style={{ color: emerald }} onClick={addRow}>
            + Split to another grant
          </button>
          {rows.length > 1 && (
            <button type="button" className="font-semibold" style={{ color: dim }} onClick={splitEvenly}>
              Split evenly
            </button>
          )}
          {!ngOn && (
            <button type="button" className="font-semibold" style={{ color: dim }} onClick={() => setNgOn(true)}>
              + Part of this isn&apos;t a grant expense
            </button>
          )}
        </div>

        {ngOn && (
          <div className="rounded-2xl p-4 grid sm:grid-cols-[0.6fr_1.4fr_auto] gap-3 items-end" style={{ background: `${gold}0f`, border: `1px solid ${gold}40` }}>
            <Field label="Non-grant amount" error={errors.non_grant_amount}>
              <input style={{ ...inputStyle, fontFamily: "'IBM Plex Mono', monospace" }} inputMode="decimal" value={ngAmount} onChange={(e) => setNgAmount(e.target.value.replace(/[^\d.]/g, ""))} />
            </Field>
            <Field label="Why isn't it a grant expense?" required error={errors.non_grant_note}>
              <input style={inputStyle} value={ngNote} placeholder="e.g. Personal item, reimbursed by employee" onChange={(e) => setNgNote(e.target.value)} />
            </Field>
            <button
              type="button"
              className="text-xs font-semibold mb-3"
              style={{ color: dim }}
              onClick={() => {
                setNgOn(false);
                setNgAmount("");
              }}
            >
              Cancel
            </button>
          </div>
        )}

        {/* running balance */}
        <div className="flex flex-wrap justify-between gap-2 text-sm rounded-xl px-4 py-2.5" style={{ background: "#fff", border: "1px solid var(--portal-line)" }}>
          <span style={{ color: dim }}>
            Grants {money(allocated, true)}
            {ngOn ? ` · non-grant ${money(ng, true)}` : ""}
          </span>
          {Math.abs(unassigned) < 0.005 ? (
            <span className="font-semibold" style={{ color: emerald }}>
              Fully assigned ✓
            </span>
          ) : unassigned > 0 ? (
            <span className="font-semibold" style={{ color: gold }}>
              {money(unassigned, true)} still unassigned (you can finish later)
            </span>
          ) : (
            <span className="font-semibold" style={{ color: rose }}>
              Over by {money(-unassigned, true)}
            </span>
          )}
        </div>

        {/* receipts */}
        <div>
          <div className="text-[13px] font-semibold mb-1.5" style={{ color: ink }}>
            Receipt {docsNeeded && <span style={{ color: rose }}>*</span>}
          </div>
          {pexDocs && pexDocs.length > 0 && (
            <div className="mb-3 space-y-1.5">
              {pexDocs.map((a, i) => (
                <label key={a.id} className="flex items-center gap-2 text-sm" style={{ color: ink }}>
                  <input
                    type="checkbox"
                    checked={usePex.has(a.id)}
                    onChange={(e) => {
                      const next = new Set(usePex);
                      if (e.target.checked) next.add(a.id);
                      else next.delete(a.id);
                      setUsePex(next);
                    }}
                  />
                  Use receipt {i + 1} already attached in the PEX app
                  {a.size ? <span style={{ color: faint }}> ({Math.round(a.size / 1024)} KB)</span> : null}
                </label>
              ))}
            </div>
          )}
          <DocUploader docs={docs} onAdded={(d) => setDocs((x) => [...x, d])} onRemove={(id) => setDocs((x) => x.filter((d) => d.id !== id))} prominent={!pexDocs?.length} />
          {rows.length > 1 && (docs.length > 0 || usePex.size > 0) && (
            <p className="text-xs mt-1.5" style={{ color: faint }}>
              The same receipt is attached to each grant&apos;s portion.
            </p>
          )}
        </div>

        {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
        <div className="flex flex-wrap gap-2">
          <PillButton onClick={() => save(true)} disabled={busy || unassigned < -0.005 || (docsNeeded && !haveDocs)}>
            {busy ? "Saving…" : "Submit for approval"}
          </PillButton>
          <PillButton variant="ghost" onClick={() => save(false)} disabled={busy || unassigned < -0.005}>
            Save as draft
          </PillButton>
        </div>
        {docsNeeded && !haveDocs && (
          <p className="text-xs" style={{ color: faint }}>
            Add the receipt to submit. You can save a draft without it.
          </p>
        )}
      </div>
    </Card>
  );
}
