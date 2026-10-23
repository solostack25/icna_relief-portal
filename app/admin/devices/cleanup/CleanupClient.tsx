"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { COVERAGE_LABELS, type Coverage } from "@/lib/devices/shared";
import { Button } from "../ui";
import { card, dim, emerald, faint, fmtDate, ink, line, relTime, rose } from "../style";

export type CleanupRow = {
  device_key: string;
  display_name: string | null;
  operating_system: string | null;
  trust_type: string | null;
  coverage: string;
  owner_name: string | null;
  owner_upn: string | null;
  approx_last_sign_in: string | null;
  intune_last_sync: string | null;
  registered_at: string | null;
  account_enabled: boolean | null;
  intune_id: string | null;
  entra_object_id: string | null;
};

const lastSeen = (r: CleanupRow) => [r.approx_last_sign_in, r.intune_last_sync].filter(Boolean).sort().pop() ?? null;
const days = (iso: string | null) => (iso ? Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000) : Infinity);

export default function CleanupClient({ rows, disabledAt }: { rows: CleanupRow[]; disabledAt: Record<string, string> }) {
  const router = useRouter();
  const [view, setView] = useState<"stale" | "disabled">("stale");
  const [minDays, setMinDays] = useState(90);
  const [kind, setKind] = useState("");
  const [skipIntune, setSkipIntune] = useState(true);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ done: number; failed: { name: string | null; error: string }[]; skipped: { name: string | null; why: string }[] } | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const list = useMemo(() => {
    const out = rows.filter((r) => {
      if (view === "disabled") return r.account_enabled === false;
      if (r.account_enabled === false) return false;
      if (days(lastSeen(r)) < minDays) return false;
      if (skipIntune && r.intune_id) return false;
      if (kind && r.coverage !== kind) return false;
      return true;
    });
    return out.sort((a, b) => (lastSeen(a) ?? "").localeCompare(lastSeen(b) ?? ""));
  }, [rows, view, minDays, kind, skipIntune]);

  const kinds = useMemo(() => Array.from(new Set(rows.map((r) => r.coverage))).sort(), [rows]);
  const allSelected = list.length > 0 && list.every((r) => sel.has(r.device_key));

  function toggleAll() {
    setSel(allSelected ? new Set() : new Set(list.map((r) => r.device_key)));
  }
  function switchView(v: "stale" | "disabled") {
    setView(v);
    setSel(new Set());
    setResult(null);
    setErr(null);
  }

  async function run() {
    const action = view === "stale" ? "disable" : "enable";
    const n = sel.size;
    if (!confirm(`${action === "disable" ? "Disable" : "Re-enable"} ${n} device${n === 1 ? "" : "s"} in Entra?`)) return;
    setBusy(true);
    setErr(null);
    setResult(null);
    try {
      const res = await fetch("/api/devices/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, keys: Array.from(sel), reason }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "Failed");
      setResult(d);
      setSel(new Set());
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  const field = "rounded-xl px-3 py-2 text-sm bg-white outline-none";
  const fieldStyle = { border: `1.5px solid ${line}`, color: ink };
  const staleCount = rows.filter((r) => r.account_enabled !== false && days(lastSeen(r)) >= 90).length;
  const disabledCount = rows.filter((r) => r.account_enabled === false).length;

  return (
    <div>
      <div className="flex gap-2 mb-4">
        {(
          [
            ["stale", `Not used 90+ days · ${staleCount}`],
            ["disabled", `Disabled · ${disabledCount}`],
          ] as const
        ).map(([v, label]) => (
          <button
            key={v}
            type="button"
            onClick={() => switchView(v)}
            className="text-xs font-bold rounded-full px-3 py-1.5 cursor-pointer"
            style={{ border: `1.5px solid ${line}`, background: view === v ? ink : "#fff", color: view === v ? "#fff" : ink }}
          >
            {label}
          </button>
        ))}
      </div>

      {view === "stale" && (
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <select value={minDays} onChange={(e) => setMinDays(Number(e.target.value))} className={field} style={fieldStyle}>
            <option value={90}>Not used 90+ days</option>
            <option value={180}>Not used 180+ days</option>
            <option value={365}>Not used 1+ year</option>
          </select>
          <select value={kind} onChange={(e) => setKind(e.target.value)} className={field} style={fieldStyle}>
            <option value="">All kinds</option>
            {kinds.map((k) => (
              <option key={k} value={k}>
                {COVERAGE_LABELS[k as Coverage] ?? k}
              </option>
            ))}
          </select>
          <label className="flex items-center gap-2 text-xs px-1" style={{ color: dim }}>
            <input type="checkbox" checked={skipIntune} onChange={(e) => setSkipIntune(e.target.checked)} />
            Leave Intune-managed devices alone
          </label>
        </div>
      )}

      {result && (
        <div className="rounded-2xl px-4 py-3 text-sm mb-4" style={{ background: `${emerald}10`, border: `1px solid ${emerald}40`, color: ink }}>
          <b>{result.done}</b> device{result.done === 1 ? "" : "s"} {view === "stale" ? "disabled" : "re-enabled"}.
          {result.failed.length > 0 && (
            <div className="mt-1" style={{ color: rose }}>
              {result.failed.length} failed: {result.failed.slice(0, 5).map((f) => `${f.name ?? "device"} (${f.error})`).join("; ")}
              {result.failed.length > 5 ? "…" : ""}
            </div>
          )}
          {result.skipped.length > 0 && (
            <div className="mt-1 text-xs" style={{ color: dim }}>
              {result.skipped.length} skipped: {result.skipped.slice(0, 5).map((s) => `${s.name ?? "device"} (${s.why})`).join("; ")}
              {result.skipped.length > 5 ? "…" : ""}
            </div>
          )}
        </div>
      )}

      {sel.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 mb-4 p-3" style={{ ...card, borderColor: view === "stale" ? `${rose}55` : `${emerald}55` }}>
          <span className="text-sm font-bold" style={{ color: ink }}>
            {sel.size} selected
          </span>
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={view === "stale" ? "Reason (e.g. cleanup: not used 90+ days)" : "Reason for re-enabling"}
            className={`${field} flex-1 min-w-[220px]`}
            style={fieldStyle}
          />
          <Button variant={view === "stale" ? "danger" : "primary"} onClick={run} disabled={busy || reason.trim().length < 5}>
            {busy ? "Working…" : view === "stale" ? `Disable ${sel.size}` : `Re-enable ${sel.size}`}
          </Button>
          {err && (
            <span className="text-xs" style={{ color: rose }}>
              {err}
            </span>
          )}
        </div>
      )}

      <div style={{ ...card, overflow: "hidden" }}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm" style={{ borderCollapse: "collapse", minWidth: 760 }}>
            <thead>
              <tr className="text-left text-xs" style={{ background: "rgba(22,48,43,0.03)", color: dim }}>
                <th className="px-4 py-2.5 w-10">
                  <input type="checkbox" checked={allSelected} onChange={toggleAll} aria-label="Select all" />
                </th>
                <th className="px-4 py-2.5 font-semibold">Device</th>
                <th className="px-4 py-2.5 font-semibold">Owner</th>
                <th className="px-4 py-2.5 font-semibold">Kind</th>
                <th className="px-4 py-2.5 font-semibold">Last used</th>
                <th className="px-4 py-2.5 font-semibold">{view === "disabled" ? "Disabled" : "Registered"}</th>
              </tr>
            </thead>
            <tbody>
              {list.slice(0, 1000).map((r) => (
                <tr key={r.device_key} style={{ borderTop: `1px solid ${line}` }}>
                  <td className="px-4 py-2">
                    <input
                      type="checkbox"
                      checked={sel.has(r.device_key)}
                      onChange={(e) =>
                        setSel((s) => {
                          const n = new Set(s);
                          if (e.target.checked) n.add(r.device_key);
                          else n.delete(r.device_key);
                          return n;
                        })
                      }
                    />
                  </td>
                  <td className="px-4 py-2">
                    <Link href={`/admin/devices/${encodeURIComponent(r.device_key)}`} className="font-bold hover:underline" style={{ color: ink }}>
                      {r.display_name ?? "Unnamed"}
                    </Link>
                    <div className="text-xs" style={{ color: faint }}>
                      {r.operating_system}
                      {r.intune_id ? " · in Intune" : ""}
                    </div>
                  </td>
                  <td className="px-4 py-2">{r.owner_name ?? r.owner_upn ?? <span style={{ color: faint }}>—</span>}</td>
                  <td className="px-4 py-2 text-xs">{COVERAGE_LABELS[r.coverage as Coverage] ?? r.coverage}</td>
                  <td className="px-4 py-2 text-xs" style={{ color: rose }}>
                    {relTime(lastSeen(r))}
                  </td>
                  <td className="px-4 py-2 text-xs" style={{ color: dim }}>
                    {view === "disabled" ? (disabledAt[r.device_key] ? fmtDate(disabledAt[r.device_key]) : "Outside the portal") : fmtDate(r.registered_at)}
                  </td>
                </tr>
              ))}
              {list.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center" style={{ color: dim }}>
                    {view === "stale" ? "No stale devices match. Nice." : "No disabled devices."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {list.length > 1000 && (
          <div className="px-4 py-3 text-xs" style={{ color: dim, borderTop: `1px solid ${line}` }}>
            Showing the oldest 1,000.
          </div>
        )}
      </div>
    </div>
  );
}
