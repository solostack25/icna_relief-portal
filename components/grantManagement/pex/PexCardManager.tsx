"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api, Card, dim, emerald, faint, Field, ink, inputStyle, Notice, PillButton, rose, selectStyle } from "@/components/grantManagement/ui";
import { fmtDate, lineLabel } from "@/lib/grantManagement/shared";

export type LinkRow = {
  id: string;
  grant_id: string;
  code: string;
  name: string;
  start_date: string;
  end_date: string | null;
  is_default: boolean;
  default_line_id: string | null;
  grant_start: string;
  grant_end: string;
};
export type GrantOption = { id: string; code: string; name: string; start_date: string; end_date: string; status: string; lines: { id: string; category: string; subcategory: string | null }[] };

const today = () => new Date().toISOString().slice(0, 10);

// Card holder + the grants this card spends on, with dates.
export default function PexCardManager({
  cardId,
  employeeId,
  employees,
  links,
  grants,
  presetGrantId,
}: {
  cardId: string;
  employeeId: string | null;
  employees: { id: string; name: string }[];
  links: LinkRow[];
  grants: GrantOption[];
  presetGrantId?: string;
}) {
  const router = useRouter();
  const [holder, setHolder] = useState(employeeId ?? "");
  const [form, setForm] = useState({ grant_id: presetGrantId ?? "", start_date: today(), end_date: "", is_default: !links.some((l) => l.is_default && (!l.end_date || l.end_date >= today())), default_line_id: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<{ tone: "ok" | "error" | "warn"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const g = grants.find((x) => x.id === form.grant_id);

  async function call(method: "POST" | "PATCH" | "DELETE", json: Record<string, unknown>, okText: string) {
    setBusy(true);
    setErrors({});
    setMsg(null);
    const r = await api<{ resuggested?: number; warning?: string | null }>(`/api/grant-management/pex/cards/${cardId}/grants`, { method, json });
    setBusy(false);
    if (r.error) {
      setErrors(r.fields ?? {});
      return setMsg({ tone: "error", text: r.error });
    }
    setMsg({ tone: r.warning ? "warn" : "ok", text: [okText, r.resuggested ? `${r.resuggested} waiting transaction${r.resuggested === 1 ? "" : "s"} re-checked.` : "", r.warning ?? ""].filter(Boolean).join(" ") });
    router.refresh();
  }

  async function saveHolder() {
    setBusy(true);
    setMsg(null);
    const r = await api(`/api/grant-management/pex/cards/${cardId}`, { method: "PATCH", json: { employee_id: holder || null } });
    setBusy(false);
    setMsg(r.error ? { tone: "error", text: r.error } : { tone: "ok", text: "Card holder saved. Uncoded transactions now go to them." });
    router.refresh();
  }

  const current = links.filter((l) => !l.end_date || l.end_date >= today());
  const past = links.filter((l) => l.end_date && l.end_date < today());

  return (
    <div className="space-y-5">
      <Card>
        <div className="text-sm font-bold mb-3" style={{ color: ink }}>
          Card holder in the portal
        </div>
        <div className="flex flex-wrap gap-3 items-end">
          <div className="flex-1 min-w-[220px]">
            <select style={selectStyle} value={holder} onChange={(e) => setHolder(e.target.value)}>
              <option value="">Not linked</option>
              {employees.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
            </select>
          </div>
          <PillButton variant="ghost" onClick={saveHolder} disabled={busy || holder === (employeeId ?? "")}>
            Save
          </PillButton>
        </div>
        <p className="text-xs mt-2" style={{ color: faint }}>
          The card holder codes this card&apos;s transactions. Synced cards are matched by email automatically.
        </p>
      </Card>

      <Card>
        <div className="text-sm font-bold mb-1" style={{ color: ink }}>
          Grants this card spends on
        </div>
        <p className="text-xs mb-3" style={{ color: dim }}>
          Transactions on the dates below are suggested to the grant, and show up in that grant&apos;s PEX queue. The default grant is pre-filled when coding. Everything else on the card is treated as non-grant spending unless someone codes it.
        </p>
        {!current.length ? (
          <p className="text-sm mb-2" style={{ color: faint }}>
            Not linked to any grant right now.
          </p>
        ) : (
          current.map((l) => <LinkItem key={l.id} l={l} grant={grants.find((x) => x.id === l.grant_id)} busy={busy} call={call} />)
        )}
        {past.length > 0 && (
          <details className="mt-3">
            <summary className="text-xs cursor-pointer" style={{ color: dim }}>
              {past.length} ended link{past.length === 1 ? "" : "s"}
            </summary>
            {past.map((l) => (
              <LinkItem key={l.id} l={l} grant={grants.find((x) => x.id === l.grant_id)} busy={busy} call={call} />
            ))}
          </details>
        )}

        <div className="mt-5 pt-4" style={{ borderTop: "1px dashed var(--portal-line)" }}>
          <div className="text-[13px] font-bold mb-3" style={{ color: ink }}>
            Link to a grant
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            <Field label="Grant" required error={errors.grant_id}>
              <select style={selectStyle} value={form.grant_id} onChange={(e) => setForm({ ...form, grant_id: e.target.value, default_line_id: "" })}>
                <option value="">Pick the grant…</option>
                {grants.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.code} · {x.name}
                    {x.status !== "active" ? ` (${x.status})` : ""}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Usual budget category" hint="Optional. Pre-filled when coding.">
              <select style={selectStyle} value={form.default_line_id} disabled={!g} onChange={(e) => setForm({ ...form, default_line_id: e.target.value })}>
                <option value="">None</option>
                {(g?.lines ?? []).map((l) => (
                  <option key={l.id} value={l.id}>
                    {lineLabel(l)}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="From" required error={errors.start_date} hint={g ? `Grant starts ${fmtDate(g.start_date)}` : undefined}>
              <input type="date" style={inputStyle} value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} />
            </Field>
            <Field label="Until" error={errors.end_date} hint={g ? `Blank = ongoing. Grant ends ${fmtDate(g.end_date)}` : "Blank = ongoing"}>
              <input type="date" style={inputStyle} value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })} />
            </Field>
          </div>
          <label className="flex items-center gap-2 text-sm mt-3" style={{ color: ink }}>
            <input type="checkbox" checked={form.is_default} onChange={(e) => setForm({ ...form, is_default: e.target.checked })} />
            Default grant for this card (pre-filled when coding)
          </label>
          <div className="flex gap-2 mt-3">
            {g && (
              <button type="button" className="text-xs font-semibold" style={{ color: dim }} onClick={() => setForm({ ...form, start_date: g.start_date, end_date: g.end_date })}>
                Use the grant period
              </button>
            )}
          </div>
          <div className="mt-3">
            <PillButton
              disabled={busy || !form.grant_id}
              onClick={() => call("POST", { ...form, end_date: form.end_date || null, default_line_id: form.default_line_id || null }, "Card linked.")}
            >
              {busy ? "Saving…" : "Link card to grant"}
            </PillButton>
          </div>
        </div>
        {msg && (
          <div className="mt-4">
            <Notice tone={msg.tone}>{msg.text}</Notice>
          </div>
        )}
      </Card>
    </div>
  );
}

function LinkItem({ l, grant, busy, call }: { l: LinkRow; grant?: GrantOption; busy: boolean; call: (m: "POST" | "PATCH" | "DELETE", j: Record<string, unknown>, ok: string) => void }) {
  const [ending, setEnding] = useState(false);
  const [end, setEnd] = useState(new Date().toISOString().slice(0, 10));
  const line = grant?.lines.find((x) => x.id === l.default_line_id);
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 py-2.5" style={{ borderBottom: "1px solid rgba(22,48,43,0.06)" }}>
      <div className="min-w-0">
        <div className="text-sm font-semibold" style={{ color: ink }}>
          {l.code} · {l.name}{" "}
          {l.is_default && (
            <span className="text-[10.5px] font-bold rounded-full px-2 py-0.5 ml-1" style={{ color: emerald, background: `${emerald}14` }}>
              Default
            </span>
          )}
        </div>
        <div className="text-xs" style={{ color: dim }}>
          {fmtDate(l.start_date)} → {l.end_date ? fmtDate(l.end_date) : "ongoing"}
          {line ? ` · usually ${lineLabel(line)}` : ""}
        </div>
      </div>
      <div className="flex items-center gap-3 text-xs font-semibold">
        {ending ? (
          <>
            <input type="date" value={end} min={l.start_date} onChange={(e) => setEnd(e.target.value)} style={{ ...inputStyle, width: 150, padding: "4px 8px" }} />
            <button type="button" disabled={busy} style={{ color: emerald }} onClick={() => call("PATCH", { designation_id: l.id, end_date: end }, "Link ended.")}>
              Save
            </button>
            <button type="button" style={{ color: dim }} onClick={() => setEnding(false)}>
              Cancel
            </button>
          </>
        ) : (
          <>
            {!l.is_default && (
              <button type="button" disabled={busy} style={{ color: emerald }} onClick={() => call("PATCH", { designation_id: l.id, is_default: true }, "Now the default.")}>
                Make default
              </button>
            )}
            {!l.end_date && (
              <button type="button" disabled={busy} style={{ color: dim }} onClick={() => setEnding(true)}>
                End
              </button>
            )}
            <button type="button" disabled={busy} style={{ color: rose }} onClick={() => confirm("Remove this link? Use End instead if the card did spend on this grant.") && call("DELETE", { designation_id: l.id }, "Link removed.")}>
              Remove
            </button>
          </>
        )}
      </div>
    </div>
  );
}
