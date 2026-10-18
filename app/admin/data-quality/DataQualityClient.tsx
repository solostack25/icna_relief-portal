"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { DQ_CHECKS, type DqCheck } from "@/lib/dataQuality";

type Office = { id: string; name: string; region: string };
type Row = {
  record_id: string;
  label: string;
  detail: string | null;
  office_id: string | null;
  suggested_office_id: string | null;
  occurred_on: string | null;
  link: string | null;
  link2: string | null;
};
type Summary = { counts: Record<string, number>; dismissed: Record<string, number> };

const C = {
  ink: "#16302B",
  ink2: "rgba(22,48,43,0.62)",
  ink3: "rgba(22,48,43,0.45)",
  accent: "#1F6F54",
  border: "rgba(22,48,43,0.12)",
  hair: "rgba(22,48,43,0.07)",
  good: "#2F7D4F",
  warn: "#B7791F",
};
const card: React.CSSProperties = { background: "#fff", borderRadius: 20, boxShadow: "0 3px 12px rgba(22,48,43,0.06)" };
const pill: React.CSSProperties = { border: `1px solid ${C.border}`, borderRadius: 999, padding: "5px 11px", fontSize: 12, background: "#fff", color: C.ink };
const GROUPS: DqCheck["group"][] = ["Offices", "Client records", "Values & finance", "Reporting"];

function OfficeSelect({ offices, value, onChange }: { offices: Office[]; value: string; onChange: (v: string) => void }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} style={{ ...pill, maxWidth: 220 }} aria-label="Office">
      <option value="">Choose office…</option>
      {offices.map((o) => (
        <option key={o.id} value={o.id}>
          {o.name}
        </option>
      ))}
    </select>
  );
}

function CheckPanel({ check, offices, onChanged }: { check: DqCheck; offices: Office[]; onChanged: () => void }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [q, setQ] = useState("");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [office, setOffice] = useState("");
  const [allOffice, setAllOffice] = useState("");
  const [prices, setPrices] = useState<Record<string, string>>({});
  const officeName = new Map(offices.map((o) => [o.id, o.name]));

  const load = useCallback(async () => {
    setLoading(true);
    const qs = new URLSearchParams({ check: check.key, page: String(page) });
    if (query) qs.set("q", query);
    const r = await fetch(`/api/admin/data-quality?${qs}`);
    const j = await r.json().catch(() => ({}));
    setLoading(false);
    if (!r.ok) return setMsg({ ok: false, text: j.error ?? "Failed to load" });
    setRows(j.rows);
    setTotal(j.total);
    setSelected(new Set());
  }, [check.key, page, query]);

  useEffect(() => {
    load();
  }, [load]);

  async function act(body: Record<string, unknown>, done: (j: any) => string) {
    setBusy(true);
    setMsg(null);
    const r = await fetch("/api/admin/data-quality", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ check: check.key, ...body }) });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    setMsg(r.ok ? { ok: true, text: done(j) } : { ok: false, text: j.error ?? "Something went wrong" });
    if (r.ok) {
      await load();
      onChanged();
    }
  }

  const ids = [...selected];
  const allOnPage = rows.length > 0 && rows.every((r) => selected.has(r.record_id));
  const pages = Math.ceil(total / 50);

  return (
    <div className="mt-3 pt-3" style={{ borderTop: `1px solid ${C.hair}` }}>
      <div className="flex flex-wrap items-center gap-2 mb-3">
        {check.autoFix && (
          <button
            disabled={busy || total === 0}
            onClick={() => act({ action: "auto_fix" }, (j) => (j.fixed ? `Fixed ${Number(j.fixed).toLocaleString()} record${j.fixed === 1 ? "" : "s"}.` : "Nothing could be matched automatically — assign the rest by hand."))}
            className="text-xs font-semibold rounded-full px-3 py-1.5 disabled:opacity-40"
            style={{ background: C.accent, color: "#fff" }}
          >
            {busy ? "Working…" : check.autoFix}
          </button>
        )}
        {check.officeFix && (
          <div className="flex items-center gap-1">
            <OfficeSelect offices={offices} value={office} onChange={setOffice} />
            <button
              disabled={busy || !office || ids.length === 0}
              onClick={() => act({ action: "set_office", ids, office_id: office }, () => `Assigned ${ids.length} to ${officeName.get(office)}.`)}
              className="text-xs font-semibold rounded-full px-3 py-1.5 disabled:opacity-40"
              style={{ border: `1.5px solid rgba(31,111,84,0.35)`, color: C.accent }}
            >
              Assign selected ({ids.length})
            </button>
          </div>
        )}
        {check.dismissLabel && (
          <button
            disabled={busy || ids.length === 0}
            onClick={() => act({ action: "dismiss", ids }, () => `Marked ${ids.length} as “${check.dismissLabel}”.`)}
            className="text-xs font-semibold rounded-full px-3 py-1.5 disabled:opacity-40"
            style={{ background: "#F4F3EE", color: C.ink2 }}
          >
            {check.dismissLabel} ({ids.length})
          </button>
        )}
        <form
          className="md:ml-auto"
          onSubmit={(e) => {
            e.preventDefault();
            setPage(0);
            setQuery(q.trim());
          }}
        >
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search…" style={{ ...pill, width: 180 }} aria-label="Search records" />
        </form>
      </div>

      {msg && (
        <p className="text-xs mb-2" style={{ color: msg.ok ? C.good : "#9B3B4F" }}>
          {msg.ok ? "✓ " : "⚠ "}
          {msg.text}
        </p>
      )}

      <div style={{ opacity: loading ? 0.5 : 1 }} className="overflow-x-auto">
        {rows.length === 0 && !loading ? (
          <p className="text-xs py-6 text-center" style={{ color: C.ink3 }}>
            {query ? "No matches." : "Nothing to fix here."}
          </p>
        ) : (
          <table className="w-full text-xs" style={{ minWidth: 640 }}>
            <thead>
              <tr style={{ color: C.ink2 }}>
                {(check.officeFix || check.dismissLabel) && (
                  <th className="w-8 py-1.5 text-left" style={{ borderBottom: `1px solid ${C.border}` }}>
                    <input
                      type="checkbox"
                      checked={allOnPage}
                      onChange={() => setSelected(allOnPage ? new Set() : new Set(rows.map((r) => r.record_id)))}
                      aria-label="Select all on this page"
                    />
                  </th>
                )}
                <th className="py-1.5 text-left font-semibold" style={{ borderBottom: `1px solid ${C.border}` }}>Record</th>
                <th className="py-1.5 text-left font-semibold" style={{ borderBottom: `1px solid ${C.border}` }}>Details</th>
                <th className="py-1.5 text-left font-semibold whitespace-nowrap" style={{ borderBottom: `1px solid ${C.border}` }}>Date</th>
                {check.officeFix && <th className="py-1.5 text-left font-semibold" style={{ borderBottom: `1px solid ${C.border}` }}>Suggested</th>}
                {check.priceFix && <th className="py-1.5 text-left font-semibold" style={{ borderBottom: `1px solid ${C.border}` }}>Price</th>}
                <th className="py-1.5" style={{ borderBottom: `1px solid ${C.border}` }} />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.record_id} className="hover:bg-[rgba(31,111,84,0.04)]">
                  {(check.officeFix || check.dismissLabel) && (
                    <td className="py-1.5" style={{ borderBottom: `1px solid ${C.hair}` }}>
                      <input
                        type="checkbox"
                        checked={selected.has(r.record_id)}
                        onChange={() => {
                          const s = new Set(selected);
                          s.has(r.record_id) ? s.delete(r.record_id) : s.add(r.record_id);
                          setSelected(s);
                        }}
                        aria-label={`Select ${r.label}`}
                      />
                    </td>
                  )}
                  <td className="py-1.5 pr-3 font-medium" style={{ color: C.ink, borderBottom: `1px solid ${C.hair}` }}>{r.label || "—"}</td>
                  <td className="py-1.5 pr-3" style={{ color: C.ink2, borderBottom: `1px solid ${C.hair}` }}>{r.detail}</td>
                  <td className="py-1.5 pr-3 whitespace-nowrap tabular-nums" style={{ color: C.ink3, borderBottom: `1px solid ${C.hair}` }}>{r.occurred_on ?? "—"}</td>
                  {check.officeFix && (
                    <td className="py-1.5 pr-3" style={{ color: C.ink2, borderBottom: `1px solid ${C.hair}` }}>
                      {r.suggested_office_id ? (
                        <button
                          disabled={busy}
                          onClick={() => act({ action: "set_office", ids: [r.record_id], office_id: r.suggested_office_id }, () => `Assigned to ${officeName.get(r.suggested_office_id!)}.`)}
                          className="underline underline-offset-2"
                          style={{ color: C.accent }}
                          title="Assign to this office"
                        >
                          {officeName.get(r.suggested_office_id) ?? "Suggested office"}
                        </button>
                      ) : (
                        "—"
                      )}
                    </td>
                  )}
                  {check.priceFix && (
                    <td className="py-1.5 pr-3" style={{ borderBottom: `1px solid ${C.hair}` }}>
                      <form
                        className="flex items-center gap-1"
                        onSubmit={(e) => {
                          e.preventDefault();
                          act({ action: "set_price", id: r.record_id, unit_price: Number(prices[r.record_id]) }, () => `Price saved for ${r.label}.`);
                        }}
                      >
                        <span style={{ color: C.ink3 }}>$</span>
                        <input
                          type="number"
                          min="0.01"
                          step="0.01"
                          value={prices[r.record_id] ?? ""}
                          onChange={(e) => setPrices({ ...prices, [r.record_id]: e.target.value })}
                          style={{ ...pill, width: 84, padding: "3px 8px" }}
                          aria-label={`Price for ${r.label}`}
                        />
                        <button disabled={busy || !prices[r.record_id]} className="font-semibold disabled:opacity-40" style={{ color: C.accent }}>
                          Save
                        </button>
                      </form>
                    </td>
                  )}
                  <td className="py-1.5 text-right whitespace-nowrap" style={{ borderBottom: `1px solid ${C.hair}` }}>
                    {r.link && (
                      <Link href={r.link} target="_blank" className="font-semibold" style={{ color: C.accent }}>
                        {r.link2 ? "Open #1" : check.openLabel ?? "Open"}
                      </Link>
                    )}
                    {r.link2 && (
                      <Link href={r.link2} target="_blank" className="font-semibold ml-3" style={{ color: C.accent }}>
                        Open #2
                      </Link>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3 mt-3 text-xs" style={{ color: C.ink3 }}>
        {pages > 1 && (
          <div className="flex items-center gap-2">
            <button disabled={page === 0} onClick={() => setPage(page - 1)} className="font-semibold disabled:opacity-30" style={{ color: C.accent }}>
              ← Prev
            </button>
            <span className="tabular-nums">
              Page {page + 1} of {pages.toLocaleString()} · {total.toLocaleString()} records
            </span>
            <button disabled={page + 1 >= pages} onClick={() => setPage(page + 1)} className="font-semibold disabled:opacity-30" style={{ color: C.accent }}>
              Next →
            </button>
          </div>
        )}
        {check.key === "clients_no_office" && total > 0 && (
          <div className="flex items-center gap-1 md:ml-auto">
            <span>Assign all {total.toLocaleString()} remaining to</span>
            <OfficeSelect offices={offices} value={allOffice} onChange={setAllOffice} />
            <button
              disabled={busy || !allOffice}
              onClick={() => {
                if (!confirm(`Assign all ${total.toLocaleString()} clients with no office to ${officeName.get(allOffice)}? Run "Auto-assign from address" first so clients with an address go to the right office.`)) return;
                act({ action: "set_office_all", office_id: allOffice }, (j) => `Assigned ${Number(j.fixed).toLocaleString()} clients to ${officeName.get(allOffice)}.`);
              }}
              className="font-semibold disabled:opacity-40"
              style={{ color: C.accent }}
            >
              Assign all
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default function DataQualityClient({ offices }: { offices: Office[] }) {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [checkedAt, setCheckedAt] = useState<Date | null>(null);

  const refresh = useCallback(async () => {
    const r = await fetch("/api/admin/data-quality");
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return setError(j.error ?? "Failed to load");
    setError(null);
    setSummary(j);
    setCheckedAt(new Date());
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const count = (k: string) => Number(summary?.counts?.[k] ?? 0);
  const openTotal = DQ_CHECKS.reduce((s, c) => s + count(c.key), 0);
  const clean = DQ_CHECKS.filter((c) => count(c.key) === 0).length;

  async function restore(check: string) {
    await fetch("/api/admin/data-quality", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "restore", check }) });
    refresh();
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold" style={{ color: C.ink }}>Data Quality</h1>
          <p className="text-xs mt-1 max-w-2xl" style={{ color: C.ink2 }}>
            Everything the Master Cleaner used to fix after the fact, checked live against portal data. Fix records here and Insights, the Power BI exports
            and Salesforce get the corrected values.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {checkedAt && <span className="text-[11px]" style={{ color: C.ink3 }}>Checked {checkedAt.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</span>}
          <button onClick={refresh} className="text-xs font-semibold rounded-full px-3 py-1.5" style={{ background: "#F4F3EE", color: C.ink2 }}>
            Re-check
          </button>
        </div>
      </div>

      {error && <div style={{ ...card, padding: 16, color: "#9B3B4F" }} className="text-sm">⚠ {error}</div>}

      {summary && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <div style={{ ...card, padding: "14px 16px" }}>
            <div className="text-[11px] font-semibold" style={{ color: C.ink2 }}>Records to review</div>
            <div className="text-2xl font-bold mt-1" style={{ color: C.ink }}>{openTotal.toLocaleString()}</div>
          </div>
          <div style={{ ...card, padding: "14px 16px" }}>
            <div className="text-[11px] font-semibold" style={{ color: C.ink2 }}>Checks passing</div>
            <div className="text-2xl font-bold mt-1" style={{ color: C.ink }}>
              {clean} <span className="text-sm font-normal" style={{ color: C.ink3 }}>of {DQ_CHECKS.length}</span>
            </div>
          </div>
          <div style={{ ...card, padding: "14px 16px" }} className="col-span-2 sm:col-span-1">
            <div className="text-[11px] font-semibold" style={{ color: C.ink2 }}>Dismissed as fine</div>
            <div className="text-2xl font-bold mt-1" style={{ color: C.ink }}>
              {Object.values(summary.dismissed ?? {}).reduce((s, n) => s + Number(n), 0).toLocaleString()}
            </div>
          </div>
        </div>
      )}

      {!summary && !error && <div style={{ ...card, padding: 40 }} className="text-center text-sm"><span style={{ color: C.ink3 }}>Checking…</span></div>}

      {summary &&
        GROUPS.map((g) => (
          <section key={g}>
            <h2 className="text-xs font-bold uppercase tracking-wide mb-2" style={{ color: C.ink3 }}>{g}</h2>
            <div className="space-y-2">
              {DQ_CHECKS.filter((c) => c.group === g).map((c) => {
                const n = count(c.key);
                const dismissed = Number(summary.dismissed?.[c.key] ?? 0);
                const isOpen = open === c.key;
                return (
                  <div key={c.key} style={{ ...card, padding: "14px 18px" }}>
                    <button className="w-full flex items-start gap-3 text-left" onClick={() => setOpen(isOpen ? null : c.key)} aria-expanded={isOpen}>
                      <span
                        className="mt-0.5 shrink-0 inline-flex items-center justify-center rounded-full text-[11px] font-bold"
                        style={{ width: 20, height: 20, background: n ? "rgba(183,121,31,0.14)" : "rgba(47,125,79,0.14)", color: n ? C.warn : C.good }}
                        aria-hidden
                      >
                        {n ? "!" : "✓"}
                      </span>
                      <span className="flex-1 min-w-0">
                        <span className="flex items-baseline justify-between gap-3">
                          <span className="text-sm font-semibold" style={{ color: C.ink }}>{c.title}</span>
                          <span className="text-sm font-bold tabular-nums shrink-0" style={{ color: C.ink }}>
                            {n ? n.toLocaleString() : <span className="text-xs font-semibold" style={{ color: C.good }}>All clear</span>}
                          </span>
                        </span>
                        <span className="block text-[11px] mt-0.5" style={{ color: C.ink3 }}>
                          {c.why}
                          {dismissed > 0 && (
                            <>
                              {" "}
                              · {dismissed.toLocaleString()} dismissed (
                              <span
                                role="button"
                                tabIndex={0}
                                className="underline"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  restore(c.key);
                                }}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") {
                                    e.stopPropagation();
                                    restore(c.key);
                                  }
                                }}
                              >
                                restore
                              </span>
                              )
                            </>
                          )}
                        </span>
                      </span>
                      <span className="text-xs shrink-0 mt-0.5" style={{ color: C.ink3 }}>{isOpen ? "▲" : "▼"}</span>
                    </button>
                    {isOpen && <CheckPanel check={c} offices={offices} onChanged={refresh} />}
                  </div>
                );
              })}
            </div>
          </section>
        ))}
    </div>
  );
}
