"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PROGRAMS } from "@/lib/grantManagement/shared";
import BudgetEditor, { type EditLine, type LibraryCategory } from "./BudgetEditor";
import { Card, Eyebrow, Field, Notice, PillButton, api, dim, inputStyle, selectStyle } from "./ui";

type Office = { id: string; field_office: string; region: string; state: string | null };
export type GrantFormValues = {
  name: string;
  funder: string;
  code: string;
  program: string;
  office_id: string;
  award_amount: string;
  start_date: string;
  end_date: string;
  funder_fiscal_year: string;
  approval_required: boolean;
  doc_required_over: string;
  notes: string;
};

const blank: GrantFormValues = {
  name: "",
  funder: "",
  code: "",
  program: "",
  office_id: "",
  award_amount: "",
  start_date: "",
  end_date: "",
  funder_fiscal_year: "",
  approval_required: true,
  doc_required_over: "0",
  notes: "",
};

function plusYear(start: string) {
  const d = new Date(`${start}T12:00:00`);
  d.setFullYear(d.getFullYear() + 1);
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}

export default function GrantForm({ offices, library, grantId, initial }: { offices: Office[]; library?: LibraryCategory[]; grantId?: string; initial?: Partial<GrantFormValues> }) {
  const router = useRouter();
  const [v, setV] = useState<GrantFormValues>({ ...blank, ...initial });
  const [lines, setLines] = useState<EditLine[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof GrantFormValues>(k: K, val: GrantFormValues[K]) => setV((x) => ({ ...x, [k]: val }));
  const isNew = !grantId;

  function presetPeriod(month: number) {
    const now = new Date();
    // the period that's running now
    const y = now.getMonth() + 1 >= month ? now.getFullYear() : now.getFullYear() - 1;
    const start = `${y}-${String(month).padStart(2, "0")}-01`;
    setV((x) => ({ ...x, start_date: start, end_date: plusYear(start), funder_fiscal_year: x.funder_fiscal_year || (month === 1 ? `FY${y}` : `FY${y}-${String(y + 1).slice(2)}`) }));
  }

  async function save() {
    setBusy(true);
    setMsg(null);
    const payload = {
      ...v,
      award_amount: Number(v.award_amount),
      doc_required_over: Number(v.doc_required_over || 0),
      ...(isNew && lines.length ? { lines: lines.map((l) => ({ category: l.category, subcategory: l.subcategory, amount: Number(l.amount) || 0 })) } : {}),
    };
    const r = isNew
      ? await api<{ id: string; warning?: string }>("/api/grant-management/grants", { method: "POST", json: payload })
      : await api(`/api/grant-management/grants/${grantId}`, { method: "PATCH", json: payload });
    setBusy(false);
    if (r.error) {
      setErrors(r.fields ?? {});
      setMsg(r.error);
      return;
    }
    const id = isNew ? (r as { id: string }).id : grantId;
    router.push(`/grant-management/grants/${id}${isNew ? "?created=1" : ""}`);
    router.refresh();
  }

  return (
    <div className="grid gap-5">
      <Card>
        <Eyebrow>Grant profile</Eyebrow>
        <div className="grid sm:grid-cols-2 gap-4 mt-2">
          <Field label="Grant name" required error={errors.name}>
            <input value={v.name} onChange={(e) => set("name", e.target.value)} style={inputStyle} placeholder="e.g. Emergency Food & Shelter Program" />
          </Field>
          <Field label="Funder" required error={errors.funder}>
            <input value={v.funder} onChange={(e) => set("funder", e.target.value)} style={inputStyle} placeholder="e.g. FEMA / United Way" />
          </Field>
          <Field label="Grant / project code" required error={errors.code} hint="Must be unique. Used on bulk uploads.">
            <input value={v.code} onChange={(e) => set("code", e.target.value.toUpperCase())} style={{ ...inputStyle, fontFamily: "'IBM Plex Mono', monospace" }} placeholder="EFSP-GA-2026" />
          </Field>
          <Field label="Program" required error={errors.program}>
            <select value={v.program} onChange={(e) => set("program", e.target.value)} style={selectStyle}>
              <option value="">Pick…</option>
              {PROGRAMS.map((p) => (
                <option key={p}>{p}</option>
              ))}
            </select>
          </Field>
          <Field label="Field office" required error={errors.office_id} hint="Staff assigned to this office will see this grant.">
            <select value={v.office_id} onChange={(e) => set("office_id", e.target.value)} style={selectStyle}>
              <option value="">Pick…</option>
              {offices.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.field_office} · {o.state ?? ""} {o.region ? `(${o.region})` : ""}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Award amount" required error={errors.award_amount}>
            <input inputMode="decimal" value={v.award_amount} onChange={(e) => set("award_amount", e.target.value.replace(/[^0-9.]/g, ""))} style={{ ...inputStyle, fontFamily: "'IBM Plex Mono', monospace" }} placeholder="0.00" />
          </Field>
        </div>
      </Card>

      <Card>
        <Eyebrow>Grant period</Eyebrow>
        <p className="text-xs mb-3" style={{ color: dim }}>
          Spending is tracked against this grant&apos;s own period, not the calendar year. Expenses dated outside it are blocked.
        </p>
        <div className="flex flex-wrap gap-2 mb-3">
          {[
            ["Jan – Dec", 1],
            ["Jul – Jun", 7],
            ["Oct – Sep", 10],
          ].map(([l, m]) => (
            <button key={l} type="button" onClick={() => presetPeriod(m as number)} className="text-xs rounded-full px-3 py-1.5 font-semibold" style={{ border: "1px solid var(--portal-line)", background: "#fff" }}>
              {l}
            </button>
          ))}
        </div>
        <div className="grid sm:grid-cols-3 gap-4">
          <Field label="Start date" required error={errors.start_date}>
            <input type="date" value={v.start_date} onChange={(e) => set("start_date", e.target.value)} style={inputStyle} />
          </Field>
          <Field label="End date" required error={errors.end_date}>
            <input type="date" value={v.end_date} onChange={(e) => set("end_date", e.target.value)} style={inputStyle} />
          </Field>
          <Field label="Funder fiscal year / grant period" hint="As the funder labels it, e.g. FY2026-27, Phase 41">
            <input value={v.funder_fiscal_year} onChange={(e) => set("funder_fiscal_year", e.target.value)} style={inputStyle} />
          </Field>
        </div>
      </Card>

      <Card>
        <Eyebrow>Spending rules</Eyebrow>
        <div className="grid sm:grid-cols-2 gap-4 mt-2">
          <Field label="Expense approval" group>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={v.approval_required} onChange={(e) => set("approval_required", e.target.checked)} />
              Expenses need an approver before they count as spent
            </label>
          </Field>
          <Field label="Receipt required over" error={errors.doc_required_over} hint="Purchases above this need a receipt or invoice attached. 0 = every purchase.">
            <input inputMode="decimal" value={v.doc_required_over} onChange={(e) => set("doc_required_over", e.target.value.replace(/[^0-9.]/g, ""))} style={{ ...inputStyle, fontFamily: "'IBM Plex Mono', monospace" }} />
          </Field>
          <Field label="Notes">
            <textarea value={v.notes} onChange={(e) => set("notes", e.target.value)} style={{ ...inputStyle, minHeight: 70 }} placeholder="Reporting requirements, restrictions, contacts…" />
          </Field>
        </div>
      </Card>

      {isNew && library && (
        <Card>
          <Eyebrow>Approved budget</Eyebrow>
          <p className="text-xs mb-3" style={{ color: dim }}>
            Enter the budget exactly as the funder approved it. You can also do this after saving. It stays a draft until you approve it on the grant page.
          </p>
          <BudgetEditor lines={lines} onChange={setLines} library={library} award={Number(v.award_amount) || 0} />
        </Card>
      )}

      {msg && <Notice tone="error">{msg}</Notice>}
      <div className="flex gap-2">
        <PillButton onClick={save} disabled={busy}>
          {busy ? "Saving…" : isNew ? "Create grant" : "Save changes"}
        </PillButton>
        <PillButton variant="ghost" onClick={() => router.back()}>
          Cancel
        </PillButton>
      </div>
    </div>
  );
}
