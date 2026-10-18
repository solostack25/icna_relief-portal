"use client";

import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { FLOWS, type Editor, type Flow, type ListKey, type SettingType, type Step } from "@/lib/workflows";

type ListMode = "employees" | "people" | "limits" | "recipients" | "readonly" | "delegates";
type ListRow = { id: string; primary: string; secondary?: string | null; active?: boolean; limit?: number | null; csuite?: boolean; emails?: string[] };
type Data = {
  counts: Record<string, number>;
  settings: Record<string, { value: string; default: string; updated_at: string | null }>;
  lists: Record<ListKey, { mode: ListMode; rows: ListRow[] }>;
};
type Act = (body: Record<string, unknown>, okText: string) => Promise<boolean>;

const C = {
  ink: "#16302B",
  ink2: "rgba(22,48,43,0.62)",
  ink3: "rgba(22,48,43,0.45)",
  line: "rgba(22,48,43,0.12)",
  hair: "rgba(22,48,43,0.07)",
  accent: "#1F6F54",
  good: "#2F7D4F",
  bad: "#9B3B4F",
};
const card: React.CSSProperties = { background: "#fff", borderRadius: 18, boxShadow: "0 3px 12px rgba(22,48,43,0.06)" };
const input: React.CSSProperties = { border: `1px solid ${C.line}`, borderRadius: 10, padding: "6px 10px", fontSize: 13, background: "#fff", color: C.ink, minWidth: 0 };
const btn = (primary = false): React.CSSProperties =>
  primary
    ? { background: C.accent, color: "#fff", borderRadius: 999, padding: "6px 14px", fontSize: 12, fontWeight: 600 }
    : { border: `1.5px solid ${C.line}`, color: C.ink2, borderRadius: 999, padding: "5px 12px", fontSize: 12, fontWeight: 600, background: "#fff" };

const fmtSetting = (v: string, type: SettingType) =>
  type === "money" ? `$${Number(v).toLocaleString()}` : type === "hours" ? `${v} hours` : type === "longtext" ? (v.length > 80 ? v.slice(0, 80) + "…" : v) : v;

// ─── Editors ────────────────────────────────────────────────────────────────
function SettingEditor({ ed, data, act }: { ed: Extract<Editor, { kind: "setting" }>; data: Data; act: Act }) {
  const s = data.settings[ed.key] ?? { value: "", default: "", updated_at: null };
  const current = s.value || s.default;
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(current);
  useEffect(() => setVal(s.value || s.default), [s.value, s.default]);

  async function save(v: string) {
    if (await act({ action: "set_setting", key: ed.key, value: v }, v ? `${ed.label}: saved.` : `${ed.label}: back to default.`)) setEditing(false);
  }

  return (
    <div className="py-2.5" style={{ borderBottom: `1px solid ${C.hair}` }}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="text-[13px] font-semibold" style={{ color: C.ink }}>{ed.label}</div>
          {ed.help && <div className="text-[11px]" style={{ color: C.ink3 }}>{ed.help}</div>}
          {!editing && (
            <div className="text-[13px] mt-0.5 break-words" style={{ color: current ? C.ink2 : C.ink3 }}>
              {current ? fmtSetting(current, ed.type) : "Not set"}
              {!s.value && s.default ? <span className="text-[11px] ml-2" style={{ color: C.ink3 }}>(default)</span> : null}
              {s.value && s.default && s.value !== s.default ? <span className="text-[11px] ml-2" style={{ color: C.ink3 }}>(default {fmtSetting(s.default, ed.type)})</span> : null}
            </div>
          )}
        </div>
        {!editing && (
          <button onClick={() => setEditing(true)} style={btn()}>
            Edit
          </button>
        )}
      </div>
      {editing && (
        <form
          className="mt-2 flex flex-wrap items-start gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            save(val.trim());
          }}
        >
          {ed.type === "longtext" ? (
            <textarea value={val} onChange={(e) => setVal(e.target.value)} rows={6} style={{ ...input, width: "100%" }} />
          ) : (
            <div className="flex items-center gap-1 flex-1 min-w-[200px]">
              {ed.type === "money" && <span style={{ color: C.ink3 }}>$</span>}
              <input
                value={val}
                onChange={(e) => setVal(e.target.value)}
                type={ed.type === "money" || ed.type === "hours" ? "number" : ed.type === "email" ? "email" : "text"}
                min={ed.type === "money" || ed.type === "hours" ? 1 : undefined}
                placeholder={ed.type === "emails" ? "name@icnarelief.org, other@icnarelief.org" : undefined}
                style={{ ...input, flex: 1 }}
                autoFocus
              />
              {ed.type === "hours" && <span className="text-xs" style={{ color: C.ink3 }}>hours</span>}
            </div>
          )}
          <button type="submit" style={btn(true)}>Save</button>
          <button type="button" onClick={() => setEditing(false)} style={btn()}>Cancel</button>
          {s.value && s.default && (
            <button type="button" onClick={() => save("")} className="text-xs font-semibold px-1" style={{ color: C.ink3 }}>
              Reset to default
            </button>
          )}
        </form>
      )}
    </div>
  );
}

function EmployeePicker({ onPick, placeholder }: { onPick: (e: { id: string; name: string }) => void; placeholder?: string }) {
  const [q, setQ] = useState("");
  const [res, setRes] = useState<{ id: string; name: string; email: string; title: string | null }[]>([]);
  useEffect(() => {
    if (q.trim().length < 2) return setRes([]);
    const t = setTimeout(async () => {
      const r = await fetch(`/api/admin/workflows?search=${encodeURIComponent(q.trim())}`);
      const j = await r.json().catch(() => ({}));
      setRes(j.employees ?? []);
    }, 250);
    return () => clearTimeout(t);
  }, [q]);
  return (
    <div className="relative flex-1 min-w-[200px]">
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={placeholder ?? "Add someone — search by name or email"} style={{ ...input, width: "100%" }} />
      {res.length > 0 && (
        <div className="absolute z-20 left-0 right-0 mt-1 rounded-xl overflow-hidden" style={{ background: "#fff", border: `1px solid ${C.line}`, boxShadow: "0 8px 24px rgba(22,48,43,0.14)" }}>
          {res.map((e) => (
            <button
              key={e.id}
              type="button"
              onClick={() => {
                onPick({ id: e.id, name: e.name });
                setQ("");
                setRes([]);
              }}
              className="block w-full text-left px-3 py-2 hover:bg-[rgba(31,111,84,0.06)]"
            >
              <div className="text-[13px] font-medium" style={{ color: C.ink }}>{e.name}</div>
              <div className="text-[11px]" style={{ color: C.ink3 }}>{[e.title, e.email].filter(Boolean).join(" · ")}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function LimitRow({ r, act }: { r: ListRow; act: Act }) {
  const [limit, setLimit] = useState(r.limit == null ? "" : String(r.limit));
  useEffect(() => setLimit(r.limit == null ? "" : String(r.limit)), [r.limit]);
  const dirty = limit !== (r.limit == null ? "" : String(r.limit));
  return (
    <div className="flex flex-wrap items-center gap-2 py-1.5" style={{ borderBottom: `1px solid ${C.hair}` }}>
      <div className="flex-1 min-w-[160px]">
        <div className="text-[13px] font-medium" style={{ color: C.ink }}>{r.primary}</div>
        <div className="text-[11px]" style={{ color: C.ink3 }}>{r.secondary}</div>
      </div>
      <label className="flex items-center gap-1 text-[11px]" style={{ color: C.ink2 }}>
        <input type="checkbox" checked={!!r.csuite} onChange={(e) => act({ action: "set_limit", id: r.id, limit: r.limit, csuite: e.target.checked }, `${r.primary}: C-suite ${e.target.checked ? "on" : "off"}.`)} />
        C-suite
      </label>
      <div className="flex items-center gap-1">
        <span className="text-xs" style={{ color: C.ink3 }}>$</span>
        <input type="number" min={0} value={limit} onChange={(e) => setLimit(e.target.value)} placeholder="No limit" style={{ ...input, width: 110 }} aria-label={`Approval limit for ${r.primary}`} />
        {dirty && (
          <button onClick={() => act({ action: "set_limit", id: r.id, limit: limit === "" ? null : Number(limit) }, `${r.primary}: limit saved.`)} style={btn(true)}>
            Save
          </button>
        )}
      </div>
      <button onClick={() => confirm(`Remove ${r.primary}'s approval limit?`) && act({ action: "list_remove", list: "finance_limits", id: r.id }, `${r.primary} removed.`)} className="text-xs font-semibold" style={{ color: C.bad }}>
        Remove
      </button>
    </div>
  );
}

function RecipientRow({ r, act }: { r: ListRow; act: Act }) {
  const original = (r.emails ?? []).join(", ");
  const [val, setVal] = useState(original);
  useEffect(() => setVal(original), [original]);
  return (
    <div className="py-2" style={{ borderBottom: `1px solid ${C.hair}` }}>
      <div className="text-[12px] font-semibold capitalize mb-1" style={{ color: C.ink }}>{r.primary.replace(/_/g, " ")}</div>
      <div className="flex flex-wrap gap-2">
        <input value={val} onChange={(e) => setVal(e.target.value)} placeholder="No one — add emails separated by commas" style={{ ...input, flex: 1, minWidth: 220 }} />
        {val !== original && (
          <button onClick={() => act({ action: "set_recipients", department: r.id, emails: val }, `${r.primary} recipients saved.`)} style={btn(true)}>
            Save
          </button>
        )}
      </div>
    </div>
  );
}

function ListEditor({ ed, data, act }: { ed: Extract<Editor, { kind: "list" }>; data: Data; act: Act }) {
  const l = data.lists[ed.list] ?? { mode: "readonly", rows: [] };
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("");
  const [pending, setPending] = useState<{ id: string; name: string } | null>(null);
  const [newLimit, setNewLimit] = useState("");

  return (
    <div className="py-2.5" style={{ borderBottom: `1px solid ${C.hair}` }}>
      <div className="flex items-baseline justify-between gap-2 mb-1">
        <div className="text-[13px] font-semibold" style={{ color: C.ink }}>{ed.label}</div>
        <span className="text-[11px]" style={{ color: C.ink3 }}>
          {l.mode === "people" ? `${l.rows.filter((r) => r.active).length} active` : `${l.rows.length}`}
        </span>
      </div>
      {ed.help && <div className="text-[11px] mb-1" style={{ color: C.ink3 }}>{ed.help}</div>}

      {l.mode === "limits" ? (
        l.rows.map((r) => <LimitRow key={r.id} r={r} act={act} />)
      ) : l.mode === "recipients" ? (
        l.rows.map((r) => <RecipientRow key={r.id} r={r} act={act} />)
      ) : l.rows.length === 0 ? (
        <div className="text-[12px] py-1" style={{ color: l.mode === "people" || l.mode === "employees" ? C.bad : C.ink3 }}>
          {l.mode === "people" || l.mode === "employees" ? "⚠ No one yet — this step has nobody to act on it." : "None."}
        </div>
      ) : (
        <div>
          {l.rows.map((r) => (
            <div key={r.id} className="flex flex-wrap items-center gap-2 py-1.5" style={{ borderBottom: `1px solid ${C.hair}`, opacity: r.active === false ? 0.5 : 1 }}>
              <div className="flex-1 min-w-[160px]">
                <div className="text-[13px] font-medium" style={{ color: C.ink }}>{r.primary}</div>
                {r.secondary && <div className="text-[11px]" style={{ color: C.ink3 }}>{r.secondary}</div>}
              </div>
              {l.mode === "people" && (
                <button onClick={() => act({ action: "list_toggle", list: ed.list, id: r.id, active: !r.active }, `${r.primary} ${r.active ? "paused" : "active"}.`)} style={btn()}>
                  {r.active ? "Pause" : "Activate"}
                </button>
              )}
              {(l.mode === "people" || l.mode === "employees") && (
                <button onClick={() => confirm(`Remove ${r.primary} from ${ed.label}?`) && act({ action: "list_remove", list: ed.list, id: r.id }, `${r.primary} removed.`)} className="text-xs font-semibold" style={{ color: C.bad }}>
                  Remove
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {l.mode === "people" && (
        <form
          className="flex flex-wrap gap-2 mt-2"
          onSubmit={async (e) => {
            e.preventDefault();
            if (await act({ action: "list_add", list: ed.list, full_name: name, email, role_label: role }, `${name} added.`)) {
              setName("");
              setEmail("");
              setRole("");
            }
          }}
        >
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Full name" style={{ ...input, flex: 1, minWidth: 140 }} />
          <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder="Email" style={{ ...input, flex: 1, minWidth: 180 }} />
          {ed.list === "speaker_leadership" && <input value={role} onChange={(e) => setRole(e.target.value)} placeholder="Role (optional)" style={{ ...input, width: 140 }} />}
          <button type="submit" disabled={!name.trim() || !email.trim()} style={btn(true)} className="disabled:opacity-40">
            Add
          </button>
        </form>
      )}
      {l.mode === "employees" && (
        <div className="flex mt-2">
          <EmployeePicker onPick={(e) => act({ action: "list_add", list: ed.list, employee_id: e.id }, `${e.name} added.`)} />
        </div>
      )}
      {l.mode === "limits" && (
        <div className="flex flex-wrap gap-2 mt-2 items-center">
          {pending ? (
            <>
              <span className="text-[13px] font-medium" style={{ color: C.ink }}>{pending.name}</span>
              <span className="text-xs" style={{ color: C.ink3 }}>can approve up to $</span>
              <input type="number" min={0} value={newLimit} onChange={(e) => setNewLimit(e.target.value)} style={{ ...input, width: 110 }} autoFocus />
              <button
                disabled={newLimit === ""}
                onClick={async () => {
                  if (await act({ action: "list_add", list: "finance_limits", employee_id: pending.id, limit: Number(newLimit) }, `${pending.name} can now approve up to $${Number(newLimit).toLocaleString()}.`)) {
                    setPending(null);
                    setNewLimit("");
                  }
                }}
                style={btn(true)}
                className="disabled:opacity-40"
              >
                Save
              </button>
              <button onClick={() => setPending(null)} style={btn()}>Cancel</button>
            </>
          ) : (
            <EmployeePicker onPick={setPending} placeholder="Give someone an approval limit — search by name" />
          )}
        </div>
      )}
      {l.mode === "delegates" && (
        <Link href="/admin/finance-tickets/approvals" className="inline-block text-xs font-semibold mt-2" style={{ color: C.accent }}>
          Manage coverage →
        </Link>
      )}
      {l.mode === "readonly" && (
        <div className="text-[11px] mt-1" style={{ color: C.ink3 }}>
          Set by each person&apos;s portal role (Admin → Employees / AD group mappings).
        </div>
      )}
    </div>
  );
}

function EditorView({ ed, data, act }: { ed: Editor; data: Data; act: Act }) {
  if (ed.kind === "setting") return <SettingEditor ed={ed} data={data} act={act} />;
  if (ed.kind === "list") return <ListEditor ed={ed} data={data} act={act} />;
  return (
    <div className="py-2.5" style={{ borderBottom: `1px solid ${C.hair}` }}>
      <Link href={ed.href} className="text-[13px] font-semibold" style={{ color: C.accent }}>
        {ed.label} →
      </Link>
      {ed.help && <div className="text-[11px]" style={{ color: C.ink3 }}>{ed.help}</div>}
    </div>
  );
}

// ─── Flow diagram ───────────────────────────────────────────────────────────
function StepNode({ step, count, onClick, editable }: { step: Step; count?: number; onClick: () => void; editable: boolean }) {
  return (
    <button
      onClick={onClick}
      className="text-left rounded-2xl p-3 w-[190px] shrink-0 transition-shadow hover:shadow-md"
      style={{ background: step.branch ? "#FBFAF7" : "#fff", border: step.branch ? `1.5px dashed ${C.line}` : `1.5px solid ${C.line}`, cursor: editable ? "pointer" : "default" }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="text-[13px] font-bold leading-tight" style={{ color: C.ink }}>{step.title}</div>
        {count != null && (
          <span className="text-[11px] font-bold tabular-nums rounded-full px-2 py-0.5 shrink-0" style={{ background: count ? "rgba(31,111,84,0.12)" : "#F4F3EE", color: count ? C.accent : C.ink3 }} title="Items at this step now">
            {count}
          </span>
        )}
      </div>
      <div className="text-[11px] mt-1 leading-snug" style={{ color: C.ink2 }}>{step.actor}</div>
      {step.notify && <div className="text-[11px] mt-1 leading-snug" style={{ color: C.ink3 }}>✉ {step.notify}</div>}
      {step.branch && <div className="text-[10px] mt-1 uppercase tracking-wide font-semibold" style={{ color: C.ink3 }}>When needed</div>}
      {editable && <div className="text-[11px] mt-1.5 font-semibold" style={{ color: C.accent }}>Edit who / rules ↓</div>}
    </button>
  );
}

function FlowView({ flow, data, act }: { flow: Flow; data: Data; act: Act }) {
  const refs = useRef<Record<string, HTMLDivElement | null>>({});
  const countLabel = (k?: string) => (k && k in data.counts ? data.counts[k] : undefined);
  const stepsWithEditors = flow.steps.filter((s) => s.editors?.length);

  return (
    <div className="space-y-4">
      <div style={{ ...card, padding: "18px 20px" }}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-lg font-bold" style={{ color: C.ink }}>{flow.name}</h2>
            <p className="text-[13px] mt-0.5 max-w-3xl" style={{ color: C.ink2 }}>{flow.summary}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {flow.pages.map((p) => (
              <Link key={p.href} href={p.href} style={btn()}>
                {p.label} →
              </Link>
            ))}
          </div>
        </div>
        <div className="mt-4 pb-2">
          <div className="flex flex-wrap items-stretch gap-2">
            {flow.steps.map((s, i) => (
              <Fragment key={s.key}>
                {i > 0 && (
                  <div className="flex items-center shrink-0" aria-hidden>
                    <span style={{ color: C.ink3, fontSize: 18 }}>→</span>
                  </div>
                )}
                <StepNode step={s} count={countLabel(s.count)} editable={!!s.editors?.length} onClick={() => refs.current[s.key]?.scrollIntoView({ behavior: "smooth", block: "start" })} />
              </Fragment>
            ))}
          </div>
        </div>
        <p className="text-[11px] mt-1" style={{ color: C.ink3 }}>Numbers are items at that step right now (finished steps: last 30 days). Dashed steps only happen when needed.</p>
      </div>

      {stepsWithEditors.map((s) => (
        <div key={s.key} ref={(el) => { refs.current[s.key] = el; }} style={{ ...card, padding: "14px 20px", scrollMarginTop: 16 }}>
          <div className="text-[11px] font-bold uppercase tracking-wide" style={{ color: C.ink3 }}>Step · {s.title}</div>
          {s.editors!.map((ed, i) => (
            <EditorView key={i} ed={ed} data={data} act={act} />
          ))}
        </div>
      ))}

      {flow.editors?.length ? (
        <div style={{ ...card, padding: "14px 20px" }}>
          <div className="text-[11px] font-bold uppercase tracking-wide" style={{ color: C.ink3 }}>Whole flow</div>
          {flow.editors.map((ed, i) => (
            <EditorView key={i} ed={ed} data={data} act={act} />
          ))}
        </div>
      ) : null}

      {flow.fixed?.length ? (
        <div className="rounded-2xl px-5 py-3" style={{ background: "rgba(22,48,43,0.04)" }}>
          <div className="text-[11px] font-bold uppercase tracking-wide mb-1" style={{ color: C.ink3 }}>Built in (not editable here)</div>
          <ul className="text-[12px] list-disc pl-4 space-y-0.5" style={{ color: C.ink2 }}>
            {flow.fixed.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

// ─── Page ───────────────────────────────────────────────────────────────────
export default function WorkflowsClient() {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sel, setSel] = useState<string>(FLOWS[0].key);
  const [toast, setToast] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    const r = await fetch("/api/admin/workflows");
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return setError(j.error ?? "Couldn't load workflows");
    setError(null);
    setData(j);
  }, []);
  useEffect(() => {
    load();
    try {
      const h = window.location.hash.slice(1);
      if (h && FLOWS.some((f) => f.key === h)) setSel(h);
    } catch {}
  }, [load]);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  const act: Act = async (body, okText) => {
    const r = await fetch("/api/admin/workflows", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    setToast(r.ok ? { ok: true, text: okText } : { ok: false, text: j.error ?? "Couldn't save" });
    if (r.ok) await load();
    return r.ok;
  };

  const waiting = (f: Flow) =>
    data
      ? f.steps.slice(0, -1).reduce((s, st) => s + (st.count && !st.count.endsWith("_30d") ? data.counts[st.count] ?? 0 : 0), 0)
      : 0;
  const groups = ["Tickets", "Approvals", "Programs", "Operations"] as const;
  const flow = FLOWS.find((f) => f.key === sel)!;

  return (
    <div>
      <div className="mb-4">
        <h1 className="text-xl font-bold" style={{ color: C.ink }}>Workflows</h1>
        <p className="text-xs mt-1 max-w-3xl" style={{ color: C.ink2 }}>
          Every ticketing, approval and request flow in the portal in one place: what happens at each step, who acts, what&apos;s waiting right now — and who approves, the
          dollar limits and the emails, editable here.
        </p>
      </div>

      {error && <div style={{ ...card, padding: 16, color: C.bad }} className="text-sm mb-4">⚠ {error}</div>}

      <div className="flex flex-col lg:flex-row gap-4 items-start">
        <nav style={{ ...card, padding: 10 }} className="w-full lg:w-64 shrink-0 lg:sticky lg:top-4" aria-label="Flows">
          {groups.map((g) => (
            <div key={g} className="mb-2">
              <div className="text-[10px] font-bold uppercase tracking-wide px-2 py-1" style={{ color: C.ink3 }}>{g}</div>
              {FLOWS.filter((f) => f.group === g).map((f) => {
                const n = waiting(f);
                return (
                  <button
                    key={f.key}
                    onClick={() => {
                      setSel(f.key);
                      try {
                        history.replaceState(null, "", `#${f.key}`);
                      } catch {}
                    }}
                    className="w-full flex items-center justify-between gap-2 text-left rounded-xl px-2.5 py-2"
                    style={sel === f.key ? { background: "rgba(31,111,84,0.1)", color: C.accent } : { color: C.ink }}
                    aria-current={sel === f.key ? "page" : undefined}
                  >
                    <span className="text-[13px] font-semibold">{f.name}</span>
                    {data && n > 0 && <span className="text-[11px] font-bold tabular-nums" style={{ color: sel === f.key ? C.accent : C.ink3 }}>{n}</span>}
                  </button>
                );
              })}
            </div>
          ))}
        </nav>

        <div className="flex-1 min-w-0 w-full">
          {!data ? (
            <div style={{ ...card, padding: 40 }} className="text-center text-sm"><span style={{ color: C.ink3 }}>Loading…</span></div>
          ) : (
            <FlowView key={flow.key} flow={flow} data={data} act={act} />
          )}
        </div>
      </div>

      {toast && (
        <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-50 rounded-full px-4 py-2 text-sm font-medium shadow-lg" style={{ background: toast.ok ? C.ink : C.bad, color: "#fff" }} role="status">
          {toast.ok ? "✓ " : "⚠ "}
          {toast.text}
        </div>
      )}
    </div>
  );
}
