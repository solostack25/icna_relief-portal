"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { TARGET_METRICS, targetKey, type Actuals, type Target, type TargetMetric } from "@/lib/insightsTargets";

type Office = { id: string; name: string; region: string; state: string };
type Agreement = {
  id: string;
  year: number;
  office_id: string;
  metric: TargetMetric;
  amount: number;
  previous_amount: number | null;
  kind: "new" | "modified";
  status: "pending" | "signed" | "superseded";
  recipient_name: string | null;
  recipient_email: string | null;
  created_at: string;
  created_by_name: string | null;
  email_status: "sent" | "failed" | "no_recipient" | null;
  email_error: string | null;
  emailed_at: string | null;
  signed_name: string | null;
  signed_at: string | null;
};
type Data = { year: number; targets: Target[]; actuals: Record<string, Actuals>; lastYearCount: number; agreements: Agreement[] };
type Metric = (typeof TARGET_METRICS)[number];

const REGIONS = ["DMV", "MIDWEST 1", "MIDWEST 2", "NORTHEAST", "SOUTH CENTRAL", "SOUTHEAST", "WEST"];
const C = { ink: "#16302B", ink2: "rgba(22,48,43,0.62)", ink3: "rgba(22,48,43,0.45)", line: "rgba(22,48,43,0.12)", hair: "rgba(22,48,43,0.07)", accent: "#1F6F54", good: "#2F7D4F", warn: "#9A6412", bad: "#9B3B4F", cream: "#FBF7EF" };
const card: React.CSSProperties = { background: "#fff", borderRadius: 18, boxShadow: "0 3px 12px rgba(22,48,43,0.06)" };
const fmt = (n: number, unit: "money" | "count") => (unit === "money" ? `$${Math.round(n).toLocaleString("en-US")}` : Math.round(n).toLocaleString("en-US"));
const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "");
const linkBtn = "text-[10.5px] font-semibold underline-offset-2 hover:underline";

// Status line under an office goal: who agreed, or who still needs to.
function AgreementStatus({
  value,
  history,
  metric,
  onRequest,
  onResend,
  onHistory,
}: {
  value: number | null;
  history: Agreement[];
  metric: Metric;
  onRequest: () => Promise<void>;
  onResend: (id: string) => Promise<void>;
  onHistory: () => void;
}) {
  const [busy, setBusy] = useState(false);
  if (value == null) return null;
  const current = history.find((a) => a.status !== "superseded" && Number(a.amount) === Number(value));
  const run = async (f: () => Promise<void>) => {
    setBusy(true);
    await f();
    setBusy(false);
  };
  let line: React.ReactNode;
  if (!current) {
    line = (
      <>
        <span style={{ color: C.warn }}>No agreement on file</span> ·{" "}
        <button disabled={busy} onClick={() => run(onRequest)} className={linkBtn} style={{ color: C.accent }}>
          {busy ? "Sending…" : "Send for signature"}
        </button>
      </>
    );
  } else if (current.status === "signed") {
    line = (
      <a href={`/api/goal-agreements/${current.id}/pdf`} target="_blank" rel="noreferrer" style={{ color: C.good }} className="hover:underline" title="Open the signed agreement">
        ✓ Agreed · {current.signed_name} · {day(current.signed_at)}
      </a>
    );
  } else {
    const problem = current.email_status === "no_recipient" ? "No area manager in the portal" : current.email_status === "failed" ? "Email failed" : null;
    line = (
      <>
        <span style={{ color: problem ? C.bad : C.warn }} title={current.email_error ?? undefined}>
          {problem ?? `Awaiting signature${current.recipient_name ? ` · ${current.recipient_name}` : ""}`}
        </span>{" "}
        ·{" "}
        <button disabled={busy} onClick={() => run(() => onResend(current.id))} className={linkBtn} style={{ color: C.accent }}>
          {busy ? "Sending…" : "Resend"}
        </button>
      </>
    );
  }
  return (
    <div className="text-[10.5px] mt-1 leading-snug" aria-label={`${metric.label} agreement`}>
      {line}
      {history.length > 0 && (
        <>
          {" "}
          ·{" "}
          <button onClick={onHistory} className={linkBtn} style={{ color: C.ink2 }}>
            History ({history.length})
          </button>
        </>
      )}
    </div>
  );
}

function Cell({
  value,
  actual,
  metric,
  isOffice,
  onSave,
  agreement,
}: {
  value: number | null;
  actual: number;
  metric: Metric;
  isOffice: boolean;
  onSave: (v: string) => Promise<boolean>;
  agreement?: React.ReactNode;
}) {
  const saved = value == null ? "" : String(value);
  const [v, setV] = useState(saved);
  const [editing, setEditing] = useState(value == null);
  const [state, setState] = useState<"idle" | "saving" | "error">("idle");
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    setV(value == null ? "" : String(value));
    setEditing(value == null);
  }, [value]);
  const dirty = v.trim() !== saved;
  const pct = value ? (actual / value) * 100 : null;
  const over = metric.key === "budget" && pct != null && pct > 100;
  const locked = value != null && !editing;

  async function commit() {
    if (!dirty) {
      if (value != null) setEditing(false);
      return;
    }
    if (value != null && v.trim() === "" && !confirm(`Clear this ${metric.label.toLowerCase()}?`)) return;
    setState("saving");
    const ok = await onSave(v.trim());
    setState(ok ? "idle" : "error");
  }
  function cancel() {
    setV(saved);
    setState("idle");
    setEditing(false);
  }

  return (
    <td className="px-2 py-1.5 align-top" style={{ borderBottom: `1px solid ${C.hair}` }}>
      {locked ? (
        <div className="flex items-center gap-2 min-w-[150px]">
          <span className="text-[13px] font-semibold tabular-nums flex-1" style={{ color: C.ink }}>
            {fmt(value!, metric.unit)}
          </span>
          <span aria-hidden className="text-[11px]" style={{ color: C.ink3 }} title="Saved - locked">🔒</span>
          <button
            onClick={() => {
              setEditing(true);
              setTimeout(() => inputRef.current?.focus(), 0);
            }}
            className="text-[11px] font-semibold rounded-full px-2.5 py-0.5"
            style={{ border: `1.5px solid ${C.line}`, color: C.accent }}
            aria-label={`Edit ${metric.label}`}
          >
            Edit
          </button>
        </div>
      ) : (
        <div className="min-w-[150px]">
          <div className="flex items-center gap-1">
            {metric.unit === "money" && <span className="text-xs" style={{ color: C.ink3 }}>$</span>}
            <input
              ref={inputRef}
              value={v}
              onChange={(e) => setV(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") commit();
                if (e.key === "Escape" && value != null) cancel();
              }}
              inputMode="numeric"
              placeholder="—"
              className="w-full min-w-[80px] text-[13px] tabular-nums rounded-lg px-2 py-1"
              style={{ border: `1px solid ${state === "error" ? C.bad : dirty ? C.accent : C.line}`, background: "#fff", color: C.ink }}
              aria-label={metric.label}
            />
            <button
              onClick={commit}
              disabled={state === "saving" || (!dirty && value == null)}
              className="text-[11px] font-semibold rounded-full px-2.5 py-1 text-white disabled:opacity-40"
              style={{ background: C.accent }}
            >
              {state === "saving" ? "…" : "Save"}
            </button>
            {value != null && (
              <button onClick={cancel} className="text-[12px] px-1" style={{ color: C.ink3 }} aria-label="Cancel">
                ×
              </button>
            )}
          </div>
          {isOffice && dirty && v.trim() !== "" && (
            <div className="text-[10px] mt-0.5" style={{ color: C.warn }}>
              {value == null ? "Saving emails the area manager an agreement to sign" : "Saving emails a new agreement - the old one stops counting"}
            </div>
          )}
        </div>
      )}
      <div className="text-[10.5px] mt-0.5 tabular-nums" style={{ color: over ? C.bad : C.ink3 }}>
        {fmt(actual, metric.unit)} {metric.actualLabel}
        {pct != null ? ` · ${pct.toFixed(0)}%${over ? " over" : ""}` : ""}
      </div>
      {agreement}
    </td>
  );
}

function HistoryModal({ title, items, metric, onClose }: { title: string; items: Agreement[]; metric: Metric; onClose: () => void }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(22,48,43,0.35)" }} onClick={onClose}>
      <div style={{ ...card, background: C.cream }} className="w-full max-w-lg max-h-[80vh] overflow-y-auto p-5" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={title}>
        <div className="flex items-start justify-between gap-3 mb-3">
          <div>
            <div className="text-[11px] font-bold tracking-wider uppercase" style={{ color: C.accent }}>Agreement history</div>
            <h2 className="text-lg font-bold" style={{ color: C.ink }}>{title}</h2>
          </div>
          <button onClick={onClose} className="text-lg px-2" style={{ color: C.ink3 }} aria-label="Close">×</button>
        </div>
        <ol className="space-y-2">
          {items.map((a) => (
            <li key={a.id} style={{ ...card, padding: 12, opacity: a.status === "superseded" ? 0.7 : 1 }}>
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-bold tabular-nums" style={{ color: C.ink }}>
                  {fmt(Number(a.amount), metric.unit)}
                  {a.kind === "modified" && a.previous_amount != null && (
                    <span className="font-normal text-xs" style={{ color: C.ink3 }}> (was {fmt(Number(a.previous_amount), metric.unit)})</span>
                  )}
                </span>
                <span
                  className="text-[10.5px] font-bold rounded-full px-2 py-0.5"
                  style={{
                    background: a.status === "signed" ? "rgba(47,125,79,0.12)" : a.status === "pending" ? "rgba(154,100,18,0.12)" : "rgba(22,48,43,0.07)",
                    color: a.status === "signed" ? C.good : a.status === "pending" ? C.warn : C.ink3,
                  }}
                >
                  {a.status === "signed" ? "Signed" : a.status === "pending" ? "Awaiting signature" : "Replaced"}
                </span>
              </div>
              <div className="text-[11.5px] mt-1 space-y-0.5" style={{ color: C.ink2 }}>
                <div>
                  {a.kind === "modified" ? "Goal changed" : "Goal set"} {day(a.created_at)}
                  {a.created_by_name ? ` by ${a.created_by_name}` : ""}
                </div>
                <div>
                  {a.email_status === "sent"
                    ? `Sent to ${a.recipient_name ?? a.recipient_email}`
                    : a.email_status === "no_recipient"
                      ? "Not sent - no area manager in the portal"
                      : a.email_status === "failed"
                        ? `Email failed${a.email_error ? `: ${a.email_error}` : ""}`
                        : "Not sent"}
                </div>
                {a.status === "signed" && (
                  <div style={{ color: C.good }}>
                    Signed by {a.signed_name} on {day(a.signed_at)}
                  </div>
                )}
              </div>
              <a href={`/api/goal-agreements/${a.id}/pdf`} target="_blank" rel="noreferrer" className="inline-block mt-1.5 text-[11px] font-semibold hover:underline" style={{ color: C.accent }}>
                {a.status === "signed" ? "Signed agreement (PDF)" : "Agreement (PDF)"}
              </a>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

export default function GoalsClient({ offices }: { offices: Office[] }) {
  const [year, setYear] = useState(new Date().getFullYear());
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [msg, setMsg] = useState<string | null>(null);
  const [historyFor, setHistoryFor] = useState<{ office: Office; metric: Metric } | null>(null);

  const load = useCallback(async () => {
    const r = await fetch(`/api/admin/goals?year=${year}`);
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return setError(j.error ?? "Couldn't load");
    setError(null);
    setData(j);
  }, [year]);
  useEffect(() => {
    setData(null);
    load();
  }, [load]);

  const target = (scope: string, key: string, metric: TargetMetric) =>
    data?.targets.find((t) => t.scope === scope && (scope === "org" ? true : t.scope_key === key) && t.metric === metric)?.amount ?? null;
  const actual = (scope: string, key: string, metric: TargetMetric) => Number(data?.actuals[targetKey(scope, key)]?.[metric] ?? 0);
  const historyOf = (officeId: string, metric: TargetMetric) => (data?.agreements ?? []).filter((a) => a.office_id === officeId && a.metric === metric);

  async function post(body: Record<string, unknown>) {
    const r = await fetch("/api/admin/goals", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ year, ...body }) });
    const j = await r.json().catch(() => ({}));
    return { ok: r.ok, j };
  }

  async function save(scope: string, key: string, metric: TargetMetric, amount: string, label: string) {
    const { ok, j } = await post({ action: "set", scope, scope_key: key, metric, amount });
    if (!ok) {
      setMsg(j.error ?? "Couldn't save");
      return false;
    }
    const a = j.agreement as { email_status: string | null } | undefined;
    setMsg(
      a
        ? a.email_status === "sent"
          ? `Saved ${label}. The area manager was emailed an agreement to sign.`
          : a.email_status === "no_recipient"
            ? `Saved ${label}, but this office has no area manager in the portal, so no agreement went out. Assign one, then use Resend.`
            : `Saved ${label}, but the agreement email didn't go out. Use Resend.`
        : j.changed === false
          ? "No change - the amount is the same."
          : `Saved ${label}.`
    );
    await load();
    return true;
  }

  async function copy() {
    if (!confirm(`Copy ${year - 1}'s goals into empty ${year} cells? Each office with copied goals will be emailed an agreement to sign.`)) return;
    const { ok, j } = await post({ action: "copy" });
    setMsg(ok ? `Copied ${j.copied} goal${j.copied === 1 ? "" : "s"} from ${year - 1}. Agreements sent to ${j.officesEmailed} office${j.officesEmailed === 1 ? "" : "s"}.` : j.error ?? "Couldn't copy");
    load();
  }

  async function request(officeId: string, metric: TargetMetric) {
    const { ok, j } = await post({ action: "request", office_id: officeId, metric });
    setMsg(ok ? (j.agreement?.email_status === "sent" ? "Agreement sent to the area manager." : "Agreement created, but it couldn't be emailed - check the area manager.") : j.error ?? "Couldn't send");
    await load();
  }
  async function resend(id: string) {
    const { j } = await post({ action: "resend", id });
    setMsg(j.ok ? "Agreement re-sent." : j.error ?? "Couldn't resend");
    await load();
  }

  const row = (scope: "org" | "region" | "office", key: string, label: React.ReactNode, sub?: string, indent = 0, office?: Office) => (
    <tr key={`${scope}:${key}`}>
      <td className="px-2 py-1.5 align-top" style={{ borderBottom: `1px solid ${C.hair}`, paddingLeft: 8 + indent }}>
        <div className="text-[13px] font-semibold" style={{ color: C.ink }}>{label}</div>
        {sub && <div className="text-[10.5px]" style={{ color: C.ink3 }}>{sub}</div>}
      </td>
      {TARGET_METRICS.map((m) => {
        const value = target(scope, key, m.key);
        const name = office ? `${office.name} ${m.label.toLowerCase()}` : m.label.toLowerCase();
        return (
          <Cell
            key={m.key}
            metric={m}
            value={value}
            isOffice={scope === "office"}
            actual={actual(scope, key, m.key)}
            onSave={(v) => save(scope, key, m.key, v, name)}
            agreement={
              office ? (
                <AgreementStatus
                  value={value}
                  metric={m}
                  history={historyOf(office.id, m.key)}
                  onRequest={() => request(office.id, m.key)}
                  onResend={resend}
                  onHistory={() => setHistoryFor({ office, metric: m })}
                />
              ) : undefined
            }
          />
        );
      })}
    </tr>
  );

  const pending = (data?.agreements ?? []).filter((a) => a.status === "pending").length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold" style={{ color: C.ink }}>Goals &amp; Budgets</h1>
          <p className="text-xs mt-1 max-w-2xl" style={{ color: C.ink2 }}>
            Set each year&apos;s goals and budget for the organization, each region and each office. Save each goal on its own; saved goals lock until you press Edit.
            Saving or changing an office goal emails that office&apos;s area manager an agreement to sign, and the signed record shows under the goal.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setYear(year - 1)} className="text-sm px-2" style={{ color: C.ink2 }} aria-label="Previous year">‹</button>
          <span className="text-lg font-bold tabular-nums" style={{ color: C.ink }}>{year}</span>
          <button onClick={() => setYear(year + 1)} className="text-sm px-2" style={{ color: C.ink2 }} aria-label="Next year">›</button>
          {data && data.lastYearCount > 0 && (
            <button onClick={copy} className="text-xs font-semibold rounded-full px-3 py-1.5 ml-2" style={{ border: `1.5px solid ${C.line}`, color: C.ink2 }}>
              Copy {year - 1} into empty cells
            </button>
          )}
        </div>
      </div>

      {msg && (
        <div className="text-xs flex items-start justify-between gap-3 rounded-xl px-3 py-2" style={{ background: "rgba(31,111,84,0.07)", color: C.ink }} role="status">
          <span>{msg}</span>
          <button onClick={() => setMsg(null)} style={{ color: C.ink3 }} aria-label="Dismiss">×</button>
        </div>
      )}
      {error && <div style={{ ...card, padding: 16, color: C.bad }} className="text-sm">⚠ {error}</div>}
      {data && pending > 0 && (
        <p className="text-[11.5px]" style={{ color: C.warn }}>
          {pending} office goal agreement{pending === 1 ? " is" : "s are"} waiting for an area manager&apos;s signature.
        </p>
      )}

      <div style={{ ...card, padding: "6px 10px" }} className="overflow-x-auto">
        {!data ? (
          <p className="text-sm text-center py-12" style={{ color: C.ink3 }}>Loading…</p>
        ) : (
          <table className="w-full" style={{ minWidth: 980 }}>
            <thead>
              <tr>
                <th className="px-2 py-2 text-left text-[11px] font-semibold" style={{ color: C.ink2, borderBottom: `1px solid ${C.line}` }}>Scope</th>
                {TARGET_METRICS.map((m) => (
                  <th key={m.key} className="px-2 py-2 text-left text-[11px] font-semibold" style={{ color: C.ink2, borderBottom: `1px solid ${C.line}` }} title={m.help}>
                    {m.label}
                    <div className="font-normal text-[10px]" style={{ color: C.ink3 }}>{m.help}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {row("org", "", "ICNA Relief (organization)")}
              {REGIONS.map((r) => {
                const regionOffices = offices.filter((o) => o.region === r);
                const isOpen = open.has(r);
                const waiting = (data.agreements ?? []).filter((a) => a.status === "pending" && regionOffices.some((o) => o.id === a.office_id)).length;
                return [
                  row(
                    "region",
                    r,
                    <button
                      onClick={() => {
                        const s = new Set(open);
                        s.has(r) ? s.delete(r) : s.add(r);
                        setOpen(s);
                      }}
                      className="flex items-center gap-1 text-left"
                      aria-expanded={isOpen}
                    >
                      <span className="text-[10px]" style={{ color: C.ink3 }}>{isOpen ? "▼" : "▶"}</span> {r}
                    </button>,
                    `${regionOffices.length} offices${waiting ? ` · ${waiting} awaiting signature` : ""}`
                  ),
                  ...(isOpen ? regionOffices.map((o) => row("office", o.id, o.name, o.state, 22, o)) : []),
                ];
              })}
            </tbody>
          </table>
        )}
      </div>
      <p className="text-[11px]" style={{ color: C.ink3 }}>
        Progress uses the same numbers as Insights. Budget spending counts finance tickets marked paid this year, by billing office. Office goals don&apos;t have to add up to the region&apos;s.
        Agreements go to the office&apos;s area manager in the portal; a changed goal replaces the earlier agreement and needs a new signature.
      </p>

      {historyFor && (
        <HistoryModal
          title={`${historyFor.office.name} · ${historyFor.metric.label} · ${year}`}
          items={historyOf(historyFor.office.id, historyFor.metric.key)}
          metric={historyFor.metric}
          onClose={() => setHistoryFor(null)}
        />
      )}
    </div>
  );
}
