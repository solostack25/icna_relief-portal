"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { EntryGrant } from "@/lib/grantManagement/server";
import { EXPENSE_KIND_LABELS, NO_RECEIPT_KINDS, PAYMENT_METHOD_LABELS, fmtDate, money, type ExpenseKind } from "@/lib/grantManagement/shared";
import DocUploader, { type Doc } from "./DocUploader";
import { Card, Field, Notice, PillButton, api, dim, faint, gold, inputStyle, selectStyle } from "./ui";

export type ExpenseValues = {
  grant_id: string;
  line_id: string;
  expense_date: string;
  vendor: string;
  amount: string;
  description: string;
  kind: ExpenseKind;
  payment_method: string;
  external_ref: string;
};

type Pex = { id: string; transaction_date: string; amount: number; merchant: string | null; memo: string | null };

export default function ExpenseForm({
  grants,
  initial,
  expenseId,
  docs: initialDocs = [],
  pex,
  status,
  isManager,
  currentLine,
}: {
  grants: EntryGrant[];
  initial?: Partial<ExpenseValues>;
  expenseId?: string;
  docs?: Doc[];
  pex?: Pex;
  status?: string;
  isManager: boolean;
  currentLine?: { id: string; label: string };
}) {
  const router = useRouter();
  const today = new Date().toISOString().slice(0, 10);
  const [v, setV] = useState<ExpenseValues>({
    grant_id: initial?.grant_id ?? (grants.length === 1 ? grants[0].id : ""),
    line_id: initial?.line_id ?? "",
    expense_date: pex?.transaction_date ?? initial?.expense_date ?? today,
    vendor: pex?.merchant ?? initial?.vendor ?? "",
    amount: pex ? String(pex.amount) : initial?.amount ?? "",
    description: initial?.description ?? pex?.memo ?? "",
    kind: initial?.kind ?? "purchase",
    payment_method: pex ? "pex" : initial?.payment_method ?? "",
    external_ref: initial?.external_ref ?? "",
  });
  const [docs, setDocs] = useState<Doc[]>(initialDocs);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<{ tone: "error" | "warn" | "ok"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [changeReason, setChangeReason] = useState("");
  const [advanced, setAdvanced] = useState(!!initial?.kind && initial.kind !== "purchase");
  const set = <K extends keyof ExpenseValues>(k: K, val: ExpenseValues[K]) => {
    setV((x) => ({ ...x, [k]: val }));
    setErrors((e) => ({ ...e, [k]: "" }));
  };

  const grant = grants.find((g) => g.id === v.grant_id);
  const lineGroups = useMemo(() => {
    const m = new Map<string, { id: string; label: string }[]>();
    for (const l of grant?.lines ?? []) m.set(l.category, [...(m.get(l.category) ?? []), { id: l.id, label: l.subcategory ?? l.category }]);
    return [...m.entries()];
  }, [grant]);
  const amount = Number(v.amount) || 0;
  const docNeeded = !NO_RECEIPT_KINDS.includes(v.kind) && Math.abs(amount) > (grant?.doc_required_over ?? 0);
  const outOfPeriod = grant && v.expense_date && (v.expense_date < grant.start_date || v.expense_date > grant.end_date);
  const editingSubmitted = status && !["draft", "returned"].includes(status);

  function onDoc(d: Doc) {
    setDocs((ds) => [...ds, d]);
    const ex = d.extracted;
    if (!ex || pex) return;
    setV((x) => ({
      ...x,
      vendor: x.vendor || ex.vendor || "",
      amount: x.amount || (ex.total != null ? String(ex.total) : ""),
      expense_date: x.expense_date === today && ex.date ? ex.date : x.expense_date,
      description: x.description || ex.description || "",
    }));
  }

  function check(submit: boolean) {
    const e: Record<string, string> = {};
    if (!v.grant_id) e.grant_id = "Pick the grant.";
    if (!v.line_id) e.line_id = "Pick the budget category.";
    if (!v.expense_date) e.expense_date = "Enter the date.";
    else if (outOfPeriod) e.expense_date = `Must be between ${fmtDate(grant!.start_date)} and ${fmtDate(grant!.end_date)}.`;
    if (!amount) e.amount = "Enter the amount.";
    if (!v.description.trim()) e.description = "Say what this was for.";
    if (v.kind === "purchase" && !v.vendor.trim()) e.vendor = "Enter the vendor.";
    if (submit && docNeeded && !docs.length) e.docs = "Attach the receipt or invoice before submitting.";
    setErrors(e);
    return !Object.keys(e).length;
  }

  async function save(submit: boolean) {
    if (!check(submit)) {
      setMsg({ tone: "error", text: "Please fix the highlighted fields." });
      return;
    }
    setBusy(true);
    setMsg(null);
    const payload = { ...v, amount, submit, document_ids: docs.map((d) => d.id), ...(pex ? { pex_transaction_id: pex.id } : {}), ...(changeReason ? { change_reason: changeReason } : {}) };
    const r = expenseId
      ? await api<{ status?: string }>(`/api/grant-management/expenses/${expenseId}`, { method: "PATCH", json: payload })
      : await api<{ id: string; status: string; warning?: string }>("/api/grant-management/expenses", { method: "POST", json: payload });
    setBusy(false);
    if (r.error) {
      setErrors(r.fields ?? {});
      setMsg({ tone: "error", text: r.error });
      return;
    }
    const id = expenseId ?? (r as { id: string }).id;
    const warning = (r as { warning?: string }).warning;
    router.push(`/grant-management/expenses/${id}${warning ? `?warning=${encodeURIComponent(warning)}` : "?saved=1"}`);
    router.refresh();
  }

  if (!grants.length) {
    return <Notice tone="warn">There are no open grants you can enter expenses on. If that&apos;s wrong, ask Grant Management to add you to the grant.</Notice>;
  }

  return (
    <div className="grid gap-4">
      {pex && (
        <Notice>
          Coding PEX transaction: <b>{pex.merchant ?? "—"}</b> · {money(pex.amount, true)} · {fmtDate(pex.transaction_date)}. Date and amount come from PEX.
        </Notice>
      )}
      <DocUploader docs={docs} onAdded={onDoc} onRemove={(id) => setDocs((ds) => ds.filter((d) => d.id !== id))} expenseId={expenseId} prominent={!docs.length} />
      {errors.docs && <div className="text-xs font-semibold -mt-2" style={{ color: "#B5566B" }}>{errors.docs}</div>}

      <Card>
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="Grant" required error={errors.grant_id}>
            <select value={v.grant_id} onChange={(e) => setV((x) => ({ ...x, grant_id: e.target.value, line_id: "" }))} style={selectStyle}>
              <option value="">Pick the grant…</option>
              {grants.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.code} · {g.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Budget category" required error={errors.line_id} hint={grant && !grant.lines.length ? "This grant has no categories you can code to." : undefined}>
            <select value={v.line_id} onChange={(e) => set("line_id", e.target.value)} style={selectStyle} disabled={!grant}>
              <option value="">{grant ? "Pick the category…" : "Pick a grant first"}</option>
              {currentLine && !grant?.lines.some((l) => l.id === currentLine.id) && <option value={currentLine.id}>{currentLine.label} (current)</option>}
              {lineGroups.map(([cat, ls]) =>
                ls.length === 1 && ls[0].label === cat ? (
                  <option key={ls[0].id} value={ls[0].id}>
                    {cat}
                  </option>
                ) : (
                  <optgroup key={cat} label={cat}>
                    {ls.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.label}
                      </option>
                    ))}
                  </optgroup>
                )
              )}
            </select>
          </Field>
          <Field label="Date" required error={errors.expense_date} hint={grant ? `Grant period ${fmtDate(grant.start_date)} – ${fmtDate(grant.end_date)}` : undefined}>
            <input type="date" value={v.expense_date} min={grant?.start_date} max={grant?.end_date} onChange={(e) => set("expense_date", e.target.value)} style={inputStyle} disabled={!!pex} />
          </Field>
          <Field label="Amount" required error={errors.amount} hint="Use a minus sign for a refund or credit.">
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: faint }}>
                $
              </span>
              <input
                inputMode="decimal"
                value={v.amount}
                onChange={(e) => set("amount", e.target.value.replace(/[^0-9.-]/g, ""))}
                style={{ ...inputStyle, paddingLeft: 24, fontFamily: "'IBM Plex Mono', monospace" }}
                placeholder="0.00"
                disabled={!!pex}
              />
            </div>
          </Field>
          <Field label={v.kind === "purchase" ? "Vendor" : "Vendor / payee"} required={v.kind === "purchase"} error={errors.vendor}>
            <input value={v.vendor} onChange={(e) => set("vendor", e.target.value)} style={inputStyle} placeholder="Store, company or person paid" />
          </Field>
          <Field label="Paid by">
            <select value={v.payment_method} onChange={(e) => set("payment_method", e.target.value)} style={selectStyle} disabled={!!pex}>
              <option value="">Pick…</option>
              {Object.entries(PAYMENT_METHOD_LABELS).map(([k, l]) => (
                <option key={k} value={k}>
                  {l}
                </option>
              ))}
            </select>
          </Field>
          <div className="sm:col-span-2">
            <Field label="Business purpose" required error={errors.description} hint="What it was for and how it supports the grant.">
              <textarea value={v.description} onChange={(e) => set("description", e.target.value)} style={{ ...inputStyle, minHeight: 70 }} />
            </Field>
          </div>
        </div>

        <button type="button" onClick={() => setAdvanced(!advanced)} className="text-xs font-semibold mt-3" style={{ color: dim }}>
          {advanced ? "▾" : "▸"} Expense type & reference
        </button>
        {advanced && (
          <div className="grid sm:grid-cols-2 gap-4 mt-3">
            <Field label="Expense type" hint="Payroll, fringe, allocations and indirect costs don't need receipts.">
              <select value={v.kind} onChange={(e) => set("kind", e.target.value as ExpenseKind)} style={selectStyle}>
                {(Object.keys(EXPENSE_KIND_LABELS) as ExpenseKind[])
                  .filter((k) => isManager || k === "purchase" || k === "other" || k === v.kind)
                  .map((k) => (
                    <option key={k} value={k}>
                      {EXPENSE_KIND_LABELS[k]}
                    </option>
                  ))}
              </select>
            </Field>
            <Field label="Reference" hint="Invoice #, check #, PO # or journal reference">
              <input value={v.external_ref} onChange={(e) => set("external_ref", e.target.value)} style={inputStyle} />
            </Field>
          </div>
        )}
      </Card>

      {editingSubmitted && (
        <Field label="Why are you changing this?" required={status === "approved"} error={errors.change_reason}>
          <input value={changeReason} onChange={(e) => setChangeReason(e.target.value)} style={inputStyle} placeholder="Recorded in the audit trail" />
        </Field>
      )}

      <div className="text-xs" style={{ color: docNeeded && !docs.length ? gold : faint }}>
        {docNeeded ? (docs.length ? "Receipt attached ✓" : "A receipt or invoice is required to submit this expense.") : "No receipt is required for this expense."}
      </div>
      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
      <div className="flex flex-wrap gap-2 sticky bottom-3 sm:static">
        {!editingSubmitted && (
          <PillButton onClick={() => save(true)} disabled={busy}>
            {busy ? "Saving…" : "Submit"}
          </PillButton>
        )}
        <PillButton variant={editingSubmitted ? "primary" : "ghost"} onClick={() => save(false)} disabled={busy}>
          {editingSubmitted ? "Save changes" : "Save draft"}
        </PillButton>
      </div>
    </div>
  );
}
