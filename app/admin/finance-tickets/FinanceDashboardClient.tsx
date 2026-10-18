"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { CATEGORY_LABELS } from "@/lib/financeTicketForms";
import { financeTicketStatusLabel } from "@/lib/financeTicketStatus";

type Sum = { count: number; amount: number };
type Row = {
  id: string;
  ticket_number: string;
  title: string;
  category: string;
  total: number;
  status: string;
  priority: string;
  stage: string;
  grant_eligible: boolean;
  office: string | null;
  requestor: string | null;
  technician_id: string | null;
  technician: string | null;
  submitted_at: string | null;
  approved_at: string | null;
  processed_at: string | null;
  waiting_on: { name: string; title: string | null; covering: boolean; level: number; since: string; days: number } | null;
  stage_days: number;
};
type Group = { label: string; count: number; amount: number };
type Data = {
  range: string;
  kpis: {
    awaiting_approval: Sum;
    ready: Sum;
    processing: Sum;
    attention: Sum;
    overdue_approvals: number;
    processed_this_month: Sum;
    processed_last_month: Sum;
    avg_days_to_approve: number | null;
    avg_days_to_process: number | null;
  };
  aging: (Group & { label: string })[];
  approvers: { name: string; title: string | null; count: number; amount: number; oldest: number }[];
  workload: { name: string; count: number; amount: number }[];
  monthly: { month: string; requested: number; processed: number }[];
  by_category: Group[];
  by_office: Group[];
  by_grant: Group[];
  tickets: Row[];
  recently_processed: Row[];
  me: string;
};
type MyApproval = {
  finance_ticket_id: string;
  approval_level: number;
  is_final_approval: boolean;
  acting_as_delegate_for_email: string | null;
  chain_person_name: string;
  created_at: string;
  ticket: { id: string; ticket_number: string; title: string; category: string; total: number; submitted_at: string | null; grant_eligible: boolean; requestor: { first_name: string; last_name: string } | null };
};

// Two validated data colors (≥3:1 on white, CVD-separable); text stays ink.
const C = {
  a: "#7B52AB", // requested / single-series
  b: "#13805A", // processed
  ink: "#16302B",
  ink2: "rgba(22,48,43,0.62)",
  ink3: "rgba(22,48,43,0.45)",
  grid: "rgba(22,48,43,0.08)",
  border: "rgba(22,48,43,0.12)",
  warn: "#9A6412",
  bad: "#9B3B4F",
  good: "#2F7D4F",
};
const card: React.CSSProperties = { background: "#fff", borderRadius: 18, boxShadow: "0 3px 12px rgba(22,48,43,0.06)", padding: "16px 18px" };
const pill = (active = false): React.CSSProperties => ({
  border: active ? "1.5px solid #8A5FB5" : "1.5px solid rgba(22,48,43,0.12)",
  background: active ? "rgba(138,95,181,0.1)" : "#fff",
  color: active ? "#8A5FB5" : "rgba(22,48,43,0.75)",
  borderRadius: 999,
  padding: "5px 12px",
  fontSize: 12,
  fontWeight: 600,
  cursor: "pointer",
});
const money = (n: number, compact = false) =>
  compact ? `$${new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(n)}` : `$${Math.round(n).toLocaleString("en-US")}`;
const monthLabel = (m: string) => new Date(Number(m.slice(0, 4)), Number(m.slice(5, 7)) - 1, 1).toLocaleString("en-US", { month: "short", year: "2-digit" });
const cat = (c: string) => CATEGORY_LABELS[c] ?? c;
const RANGES = [
  { key: "month", label: "This month" },
  { key: "90d", label: "90 days" },
  { key: "ytd", label: "This year" },
  { key: "12m", label: "12 months" },
];

function Tip({ active, payload, label, labelFmt }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: "#fff", border: `1px solid ${C.border}`, borderRadius: 10, padding: "8px 10px", boxShadow: "0 4px 14px rgba(22,48,43,0.12)", fontSize: 12 }}>
      <div style={{ color: C.ink2, marginBottom: 4 }}>{labelFmt ? labelFmt(label) : label}</div>
      {payload.map((p: any) => (
        <div key={p.dataKey} className="flex items-center gap-2" style={{ color: C.ink }}>
          <span style={{ width: 10, height: 10, borderRadius: 2, background: p.color, display: "inline-block" }} />
          <span style={{ color: C.ink2 }}>{p.name}</span>
          <span className="tabular-nums font-semibold ml-auto pl-3">{money(p.value)}</span>
          {p.payload?.count != null && p.dataKey === "amount" && <span style={{ color: C.ink3 }}>· {p.payload.count}</span>}
        </div>
      ))}
    </div>
  );
}

function Panel({ title, sub, right, children, table }: { title: string; sub?: string; right?: React.ReactNode; children: React.ReactNode; table?: React.ReactNode }) {
  const [view, setView] = useState<"chart" | "table">("chart");
  return (
    <div style={card}>
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0">
          <h3 className="text-sm font-bold" style={{ color: C.ink }}>{title}</h3>
          {sub && <p className="text-[11px] mt-0.5" style={{ color: C.ink3 }}>{sub}</p>}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {right}
          {table &&
            (["chart", "table"] as const).map((v) => (
              <button key={v} onClick={() => setView(v)} className="text-[11px] font-semibold rounded-full px-2.5 py-1" style={view === v ? { background: "rgba(123,82,171,0.1)", color: C.a } : { color: C.ink3 }} aria-pressed={view === v}>
                {v === "chart" ? "Chart" : "Table"}
              </button>
            ))}
        </div>
      </div>
      {view === "chart" || !table ? children : <div className="max-h-[300px] overflow-auto">{table}</div>}
    </div>
  );
}

function MiniTable({ head, rows }: { head: string[]; rows: (string | number)[][] }) {
  return (
    <table className="w-full text-xs">
      <thead>
        <tr>
          {head.map((h, i) => (
            <th key={h} className={`py-1.5 font-semibold ${i ? "text-right" : "text-left"}`} style={{ color: C.ink2, borderBottom: `1px solid ${C.border}` }}>{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i}>
            {r.map((c, j) => (
              <td key={j} className={`py-1 ${j ? "text-right tabular-nums" : ""}`} style={{ color: C.ink, borderBottom: `1px solid ${C.grid}` }}>{c}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function HBars({ rows, height }: { rows: Group[]; height?: number }) {
  if (!rows.length) return <p className="text-xs py-8 text-center" style={{ color: C.ink3 }}>Nothing in this period.</p>;
  return (
    <ResponsiveContainer width="100%" height={height ?? Math.max(120, rows.length * 30 + 28)}>
      <BarChart data={rows} layout="vertical" margin={{ top: 0, right: 12, bottom: 0, left: 0 }}>
        <CartesianGrid horizontal={false} stroke={C.grid} />
        <XAxis type="number" tickFormatter={(v) => money(v, true)} tick={{ fontSize: 11, fill: C.ink3 }} axisLine={false} tickLine={false} />
        <YAxis type="category" dataKey="label" width={140} tick={{ fontSize: 11, fill: C.ink2 }} axisLine={false} tickLine={false} interval={0} />
        <Tooltip cursor={{ fill: "rgba(123,82,171,0.06)" }} content={<Tip />} />
        <Bar dataKey="amount" name="Amount" fill={C.a} barSize={16} radius={[0, 4, 4, 0]} isAnimationActive={false} />
      </BarChart>
    </ResponsiveContainer>
  );
}

// ─── Approvals waiting on the signed-in person ──────────────────────────────
function MyApprovals({ onDecided }: { onDecided: () => void }) {
  const [items, setItems] = useState<MyApproval[] | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    const r = await fetch("/api/finance-tickets/my-approvals");
    const j = await r.json().catch(() => ({}));
    setItems(r.ok ? j.approvals : []);
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  async function decide(ids: string[], decision: "approve" | "reject" | "fix") {
    setMsg(null);
    let ok = 0;
    const errors: string[] = [];
    for (const id of ids) {
      setBusy(id);
      const r = await fetch("/api/finance-tickets/my-approvals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticket_id: id, decision, notes: notes[id] }),
      });
      const j = await r.json().catch(() => ({}));
      if (r.ok) ok++;
      else errors.push(j.error ?? "Failed");
    }
    setBusy(null);
    setSelected(new Set());
    const verb = decision === "approve" ? "Approved" : decision === "fix" ? "Sent back" : "Denied";
    setMsg(errors.length ? { ok: false, text: `${ok ? `${verb} ${ok}. ` : ""}${errors[0]}` } : { ok: true, text: `${verb} ${ok} ticket${ok === 1 ? "" : "s"}.` });
    await load();
    onDecided();
  }

  if (!items || items.length === 0) return null;
  const total = items.reduce((s, i) => s + Number(i.ticket.total ?? 0), 0);

  return (
    <div style={{ ...card, border: "1.5px solid rgba(123,82,171,0.35)" }}>
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <div>
          <h2 className="text-sm font-bold" style={{ color: C.ink }}>
            Waiting on your approval · {items.length} ticket{items.length === 1 ? "" : "s"} · {money(total)}
          </h2>
          <p className="text-[11px] mt-0.5" style={{ color: C.ink3 }}>Approving here is the same as the emailed link: it moves to the next approver or, at the final level, to Finance for payment.</p>
        </div>
        {selected.size > 1 && (
          <button onClick={() => decide([...selected], "approve")} disabled={!!busy} className="text-xs font-semibold rounded-full px-3 py-1.5" style={{ background: C.b, color: "#fff" }}>
            Approve {selected.size} selected
          </button>
        )}
      </div>
      {msg && <p className="text-xs mb-2" style={{ color: msg.ok ? C.good : C.bad }}>{msg.ok ? "✓ " : "⚠ "}{msg.text}</p>}
      <div className="grid gap-2">
        {items.map((a) => {
          const t = a.ticket;
          const id = t.id;
          const waited = Math.floor((Date.now() - new Date(a.created_at).getTime()) / 86400000);
          return (
            <div key={id} className="rounded-xl px-3 py-2.5" style={{ border: `1px solid ${C.border}`, opacity: busy === id ? 0.5 : 1 }}>
              <div className="flex flex-wrap items-start gap-3">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={selected.has(id)}
                  onChange={() => {
                    const s = new Set(selected);
                    s.has(id) ? s.delete(id) : s.add(id);
                    setSelected(s);
                  }}
                  aria-label={`Select ${t.ticket_number}`}
                />
                <div className="flex-1 min-w-[220px]">
                  <Link href={`/finance-tickets/${id}`} target="_blank" className="text-sm font-semibold" style={{ color: C.ink }}>
                    {t.title}
                  </Link>
                  <div className="text-[11px]" style={{ color: C.ink3 }}>
                    {t.ticket_number} · {cat(t.category)} · {t.requestor ? `${t.requestor.first_name} ${t.requestor.last_name}` : "—"} · level {a.approval_level}
                    {a.is_final_approval ? " (final)" : ""}
                    {a.acting_as_delegate_for_email ? ` · covering for ${a.chain_person_name}` : ""} · waiting {waited}d
                  </div>
                </div>
                <div className="text-sm font-bold tabular-nums" style={{ color: C.ink }}>{money(Number(t.total ?? 0))}</div>
              </div>
              <div className="flex flex-wrap items-center gap-2 mt-2 pl-7">
                <input
                  value={notes[id] ?? ""}
                  onChange={(e) => setNotes({ ...notes, [id]: e.target.value })}
                  placeholder="Note (required to send back or deny)"
                  className="flex-1 min-w-[180px] text-xs rounded-full px-3 py-1.5"
                  style={{ border: `1px solid ${C.border}` }}
                />
                <button disabled={!!busy} onClick={() => decide([id], "approve")} className="text-xs font-semibold rounded-full px-3 py-1.5" style={{ background: C.b, color: "#fff" }}>
                  Approve
                </button>
                <button disabled={!!busy} onClick={() => decide([id], "fix")} className="text-xs font-semibold rounded-full px-3 py-1.5" style={{ border: `1.5px solid ${C.border}`, color: C.ink2 }}>
                  Send back
                </button>
                <button disabled={!!busy} onClick={() => decide([id], "reject")} className="text-xs font-semibold rounded-full px-3 py-1.5" style={{ border: "1.5px solid rgba(155,59,79,0.35)", color: C.bad }}>
                  Deny
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Action lists ───────────────────────────────────────────────────────────
function TicketList({ rows, empty, action }: { rows: Row[]; empty: string; action: (r: Row) => React.ReactNode }) {
  if (!rows.length) return <p className="text-xs py-6 text-center" style={{ color: C.ink3 }}>{empty}</p>;
  return (
    <div className="grid">
      {rows.map((r) => (
        <div key={r.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2" style={{ borderBottom: `1px solid ${C.grid}` }}>
          <div className="flex-1 min-w-[200px]">
            <Link href={`/finance-tickets/${r.id}`} className="text-[13px] font-semibold" style={{ color: C.ink }}>
              {r.title}
            </Link>
            <div className="text-[11px]" style={{ color: C.ink3 }}>
              {r.ticket_number} · {cat(r.category)} · {r.requestor ?? "—"}
              {r.office ? ` · ${r.office}` : ""}
              {r.waiting_on ? ` · ${r.waiting_on.name}${r.waiting_on.covering ? " (covering)" : ""}` : ""}
              {r.technician && r.stage === "processing" ? ` · ${r.technician}` : ""}
            </div>
          </div>
          <span
            className="text-[11px] font-semibold tabular-nums"
            style={{ color: r.stage_days >= 7 ? C.bad : r.stage_days >= 3 ? C.warn : C.ink3 }}
            title="Days in this stage"
          >
            {r.stage_days >= 3 ? "⚠ " : ""}
            {r.stage_days}d
          </span>
          <span className="text-[13px] font-bold tabular-nums w-24 text-right" style={{ color: C.ink }}>{money(r.total)}</span>
          <div className="flex gap-1">{action(r)}</div>
        </div>
      ))}
    </div>
  );
}

export default function FinanceDashboardClient() {
  const [range, setRange] = useState("12m");
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<{ ok: boolean; text: string } | null>(null);
  const [tab, setTab] = useState<"approval" | "ready" | "processing" | "attention">("approval");

  const load = useCallback(async () => {
    setLoading(true);
    const r = await fetch(`/api/admin/finance-tickets/dashboard?range=${range}`);
    const j = await r.json().catch(() => ({}));
    setLoading(false);
    if (!r.ok) return setError(j.error ?? "Couldn't load the dashboard");
    setError(null);
    setData(j);
  }, [range]);
  useEffect(() => {
    load();
  }, [load]);
  // Charts mount after the data arrives; nudge them to re-measure once the
  // layout has settled so none render at a stale width.
  useEffect(() => {
    if (!data) return;
    const id = setTimeout(() => window.dispatchEvent(new Event("resize")), 60);
    return () => clearTimeout(id);
  }, [data]);

  async function act(id: string, url: string, body: Record<string, unknown> | null, ok: string) {
    setBusy(id);
    setToast(null);
    const r = await fetch(url, { method: body ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
    const j = await r.json().catch(() => ({}));
    setBusy(null);
    setToast(r.ok ? { ok: true, text: ok.replace("{to}", j.to ?? "the approver") } : { ok: false, text: j.error ?? "Something went wrong" });
    if (r.ok) load();
  }

  if (error) return <div style={{ ...card, color: C.bad }} className="text-sm">⚠ {error}</div>;
  if (!data) return <div style={card} className="text-sm text-center py-14"><span style={{ color: C.ink3 }}>Loading…</span></div>;

  const k = data.kpis;
  const pm = k.processed_last_month.amount;
  const pmDelta = pm ? ((k.processed_this_month.amount - pm) / pm) * 100 : null;
  const lists = {
    approval: [...data.tickets.filter((r) => r.stage === "approval")].sort((a, b) => b.stage_days - a.stage_days),
    ready: data.tickets.filter((r) => r.stage === "ready").sort((a, b) => b.stage_days - a.stage_days),
    processing: data.tickets.filter((r) => r.stage === "processing").sort((a, b) => b.stage_days - a.stage_days),
    attention: data.tickets.filter((r) => r.stage === "fixing" || r.stage === "on_hold").sort((a, b) => b.stage_days - a.stage_days),
  };
  const tiles: { key: keyof typeof lists; label: string; sum: Sum; note: string }[] = [
    { key: "approval", label: "Awaiting approval", sum: k.awaiting_approval, note: k.overdue_approvals ? `${k.overdue_approvals} waiting 3+ days` : "none overdue" },
    { key: "ready", label: "Approved — ready to pay", sum: k.ready, note: "not yet picked up" },
    { key: "processing", label: "Being processed", sum: k.processing, note: `${data.workload.length} on the team` },
    { key: "attention", label: "Needs attention", sum: k.attention, note: "sent back or on hold" },
  ];

  return (
    <div className="space-y-4" style={{ opacity: loading ? 0.6 : 1, transition: "opacity 150ms" }}>
      <MyApprovals onDecided={load} />

      {toast && <p className="text-xs" style={{ color: toast.ok ? C.good : C.bad }}>{toast.ok ? "✓ " : "⚠ "}{toast.text}</p>}

      {/* Pipeline tiles — click to open that list below */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {tiles.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            style={{ ...card, padding: "14px 16px", outline: tab === t.key ? "2px solid #8A5FB5" : "none", outlineOffset: -2 }}
            className="text-left"
            aria-pressed={tab === t.key}
          >
            <div className="text-[11px] font-semibold" style={{ color: C.ink2 }}>{t.label}</div>
            <div className="text-2xl font-bold mt-1" style={{ color: C.ink }}>{t.sum.count}</div>
            <div className="text-xs font-semibold tabular-nums" style={{ color: C.ink2 }}>{money(t.sum.amount)}</div>
            <div className="text-[11px] mt-0.5" style={{ color: t.key === "approval" && k.overdue_approvals ? C.warn : C.ink3 }}>{t.note}</div>
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div style={{ ...card, padding: "14px 16px" }}>
          <div className="text-[11px] font-semibold" style={{ color: C.ink2 }}>Paid this month</div>
          <div className="text-xl font-bold mt-1" style={{ color: C.ink }}>{money(k.processed_this_month.amount)}</div>
          <div className="text-[11px]" style={{ color: C.ink3 }}>
            {k.processed_this_month.count} tickets
            {pmDelta != null ? ` · ${pmDelta >= 0 ? "▲" : "▼"} ${Math.abs(pmDelta).toFixed(0)}% vs last month` : ""}
          </div>
        </div>
        <div style={{ ...card, padding: "14px 16px" }}>
          <div className="text-[11px] font-semibold" style={{ color: C.ink2 }}>Average time to approve</div>
          <div className="text-xl font-bold mt-1" style={{ color: C.ink }}>{k.avg_days_to_approve != null ? `${k.avg_days_to_approve} days` : "—"}</div>
          <div className="text-[11px]" style={{ color: C.ink3 }}>submitted → final approval, last 90 days</div>
        </div>
        <div style={{ ...card, padding: "14px 16px" }}>
          <div className="text-[11px] font-semibold" style={{ color: C.ink2 }}>Average time to pay</div>
          <div className="text-xl font-bold mt-1" style={{ color: C.ink }}>{k.avg_days_to_process != null ? `${k.avg_days_to_process} days` : "—"}</div>
          <div className="text-[11px]" style={{ color: C.ink3 }}>final approval → processed, last 90 days</div>
        </div>
      </div>

      {/* Work list for the selected stage */}
      <div style={card}>
        <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
          <div className="flex flex-wrap gap-1">
            {tiles.map((t) => (
              <button key={t.key} onClick={() => setTab(t.key)} style={pill(tab === t.key)}>
                {t.label} <span style={{ opacity: 0.6 }}>{lists[t.key].length}</span>
              </button>
            ))}
          </div>
          <Link href="/admin/finance-tickets/queue" className="text-xs font-semibold" style={{ color: "#8A5FB5" }}>
            All tickets →
          </Link>
        </div>
        <p className="text-[11px] mb-2" style={{ color: C.ink3 }}>Oldest first · days in the current stage are flagged at 3 and 7.</p>
        {tab === "approval" && (
          <TicketList
            rows={lists.approval}
            empty="Nothing is waiting on an approver."
            action={(r) => (
              <button disabled={busy === r.id} onClick={() => act(r.id, `/api/admin/finance-tickets/${r.id}/remind`, null, "Reminder sent to {to}.")} style={pill()}>
                Remind
              </button>
            )}
          />
        )}
        {tab === "ready" && (
          <TicketList
            rows={lists.ready}
            empty="No approved tickets waiting to be paid."
            action={(r) => (
              <>
                <button disabled={busy === r.id} onClick={() => act(r.id, `/api/admin/finance-tickets/${r.id}`, { assign_to_me: true }, "Assigned to you.")} style={pill()}>
                  Assign to me
                </button>
                <button
                  disabled={busy === r.id}
                  onClick={() => confirm(`Mark ${r.ticket_number} (${money(r.total)}) as paid?`) && act(r.id, `/api/admin/finance-tickets/${r.id}`, { assign_to_me: true, status: "processed" }, "Marked as paid.")}
                  style={{ ...pill(), borderColor: "rgba(19,128,90,0.4)", color: C.b }}
                >
                  Mark paid
                </button>
              </>
            )}
          />
        )}
        {tab === "processing" && (
          <TicketList
            rows={lists.processing}
            empty="Nothing being processed right now."
            action={(r) => (
              <button
                disabled={busy === r.id}
                onClick={() => confirm(`Mark ${r.ticket_number} (${money(r.total)}) as paid?`) && act(r.id, `/api/admin/finance-tickets/${r.id}`, { status: "processed" }, "Marked as paid.")}
                style={{ ...pill(), borderColor: "rgba(19,128,90,0.4)", color: C.b }}
              >
                Mark paid
              </button>
            )}
          />
        )}
        {tab === "attention" && (
          <TicketList
            rows={lists.attention}
            empty="Nothing sent back or on hold."
            action={(r) => (
              <span className="text-[11px] font-semibold" style={{ color: C.ink2 }}>
                {r.stage === "fixing" ? "With requestor" : r.status === "pending" ? "Routing failed" : financeTicketStatusLabel(r.status)}
              </span>
            )}
          />
        )}
      </div>

      {/* Bottlenecks */}
      <div className="grid lg:grid-cols-2 gap-4">
        <Panel
          title="Approvals by age"
          sub="How long tickets have been waiting on their current approver"
          table={<MiniTable head={["Waiting", "Tickets", "Amount"]} rows={data.aging.map((a) => [a.label, a.count, money(a.amount)])} />}
        >
          {data.aging.some((a) => a.count) ? (
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={data.aging} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                <CartesianGrid vertical={false} stroke={C.grid} />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: C.ink3 }} axisLine={{ stroke: C.border }} tickLine={false} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: C.ink3 }} axisLine={false} tickLine={false} width={28} />
                <Tooltip
                  cursor={{ fill: "rgba(123,82,171,0.06)" }}
                  content={({ active, payload, label }: any) =>
                    active && payload?.length ? (
                      <div style={{ background: "#fff", border: `1px solid ${C.border}`, borderRadius: 10, padding: "8px 10px", fontSize: 12, color: C.ink }}>
                        <div style={{ color: C.ink2 }}>{label}</div>
                        <b>{payload[0].payload.count}</b> tickets · {money(payload[0].payload.amount)}
                      </div>
                    ) : null
                  }
                />
                <Bar dataKey="count" name="Tickets" fill={C.a} barSize={24} radius={[4, 4, 0, 0]} isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-xs py-10 text-center" style={{ color: C.ink3 }}>Nothing waiting on approval.</p>
          )}
        </Panel>
        <Panel title="Who tickets are waiting on" sub="Current approvers, longest wait first">
          {data.approvers.length ? (
            <MiniTable
              head={["Approver", "Tickets", "Amount", "Oldest"]}
              rows={data.approvers.map((a) => [`${a.name}${a.title ? ` · ${a.title}` : ""}`, a.count, money(a.amount), `${a.oldest}d${a.oldest >= 3 ? " ⚠" : ""}`])}
            />
          ) : (
            <p className="text-xs py-10 text-center" style={{ color: C.ink3 }}>No one has approvals pending.</p>
          )}
          {data.workload.length > 0 && (
            <>
              <h4 className="text-xs font-bold mt-4 mb-1" style={{ color: C.ink }}>Finance team workload</h4>
              <MiniTable head={["Processing", "Tickets", "Amount"]} rows={data.workload.map((w) => [w.name, w.count, money(w.amount)])} />
            </>
          )}
        </Panel>
      </div>

      {/* Spend */}
      <div className="flex flex-wrap items-center gap-2 pt-2">
        <h2 className="text-sm font-bold mr-2" style={{ color: C.ink }}>Spend</h2>
        {RANGES.map((r) => (
          <button key={r.key} onClick={() => setRange(r.key)} style={pill(range === r.key)}>
            {r.label}
          </button>
        ))}
      </div>

      <Panel
        title="Requested vs paid by month"
        sub="Requested = submitted (excluding denied / duplicates); paid = marked processed"
        table={<MiniTable head={["Month", "Requested", "Paid"]} rows={data.monthly.map((m) => [monthLabel(m.month), money(m.requested), money(m.processed)])} />}
      >
        {data.monthly.some((m) => m.requested || m.processed) ? (
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={data.monthly} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} barGap={2}>
              <CartesianGrid vertical={false} stroke={C.grid} />
              <XAxis dataKey="month" tickFormatter={monthLabel} tick={{ fontSize: 11, fill: C.ink3 }} axisLine={{ stroke: C.border }} tickLine={false} />
              <YAxis tickFormatter={(v) => money(v, true)} tick={{ fontSize: 11, fill: C.ink3 }} axisLine={false} tickLine={false} width={56} />
              <Tooltip cursor={{ fill: "rgba(123,82,171,0.06)" }} content={<Tip labelFmt={monthLabel} />} />
              <Legend wrapperStyle={{ fontSize: 11, color: C.ink2 }} iconType="square" />
              <Bar dataKey="requested" name="Requested" fill={C.a} maxBarSize={20} radius={[4, 4, 0, 0]} isAnimationActive={false} />
              <Bar dataKey="processed" name="Paid" fill={C.b} maxBarSize={20} radius={[4, 4, 0, 0]} isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <p className="text-xs py-10 text-center" style={{ color: C.ink3 }}>No tickets in this period.</p>
        )}
      </Panel>

      <div className="grid lg:grid-cols-3 gap-4">
        <Panel title="By category" table={<MiniTable head={["Category", "Tickets", "Amount"]} rows={data.by_category.map((g) => [cat(g.label), g.count, money(g.amount)])} />}>
          <HBars rows={data.by_category.map((g) => ({ ...g, label: cat(g.label) }))} />
        </Panel>
        <Panel title="By billing office" sub={data.by_office.length > 10 ? "Top 10" : undefined} table={<MiniTable head={["Office", "Tickets", "Amount"]} rows={data.by_office.map((g) => [g.label, g.count, money(g.amount)])} />}>
          <HBars rows={data.by_office.slice(0, 10)} />
        </Panel>
        <Panel title="Charged to grants" sub="Grant allocations on tickets in this period" table={<MiniTable head={["Grant", "Lines", "Amount"]} rows={data.by_grant.map((g) => [g.label, g.count, money(g.amount)])} />}>
          <HBars rows={data.by_grant.slice(0, 10)} />
        </Panel>
      </div>

      {data.recently_processed.length > 0 && (
        <Panel title="Recently paid">
          <MiniTable
            head={["Ticket", "Requestor", "Paid", "Amount"]}
            rows={data.recently_processed.map((r) => [`${r.ticket_number} · ${r.title}`, r.requestor ?? "—", r.processed_at ? new Date(r.processed_at).toLocaleDateString() : "—", money(r.total)])}
          />
        </Panel>
      )}
    </div>
  );
}
