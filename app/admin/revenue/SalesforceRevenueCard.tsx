"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Props = {
  year: number;
  lastRun: { status: string; started_at: string; rows_upserted: number; error: string | null } | null;
  total: number;
  count: number;
  byProgram: { program: string; total: number }[];
  byOffice: { office: string; total: number }[];
  unassigned: number;
};

const money = (n: number) => `$${Math.round(n).toLocaleString()}`;

// Donations synced nightly from Salesforce. Until access is set up this
// explains what will appear here; afterwards it shows totals by program and
// office, the last sync, and the Power BI export.
export default function SalesforceRevenueCard({ year, lastRun, total, count, byProgram, byOffice, unassigned }: Props) {
  const router = useRouter();
  const [syncing, setSyncing] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const connected = count > 0 || lastRun?.status === "success";

  async function syncNow() {
    setSyncing(true);
    setMsg(null);
    const res = await fetch("/api/cron/revenue-sync", { method: "POST" });
    const data = await res.json().catch(() => ({}));
    setSyncing(false);
    setMsg(
      data.status === "success"
        ? `Synced ${data.rows} payment${data.rows === 1 ? "" : "s"}.`
        : data.status === "not_configured"
          ? "Salesforce revenue sync isn't switched on yet."
          : data.error ?? "Sync failed."
    );
    router.refresh();
  }

  return (
    <div style={{ background: "#fff", borderRadius: 24, boxShadow: "0 3px 12px rgba(22,48,43,0.06)", padding: "22px 24px", marginTop: 24 }}>
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <h2 className="text-sm font-bold" style={{ color: "#2F4A3E" }}>
            Donations from Salesforce
          </h2>
          <p className="text-xs mt-1" style={{ color: "rgba(22,48,43,0.5)" }}>
            {connected
              ? `Every paid donation in Salesforce, synced nightly and credited to an office by the donor's zip / city (Admin → Zip → Office Map).`
              : "Waiting on Salesforce access. Once it's connected, every paid donation — online, check, DAF, entered by staff — syncs here nightly and is credited to an office by the donor's zip, replacing the Master Cleaner revenue upload."}
          </p>
        </div>
        <div className="flex gap-2 shrink-0">
          <a
            href={`/api/admin/revenue/export?year=${year}`}
            className="text-xs font-semibold rounded-full px-3 py-1.5"
            style={{ border: "1.5px solid rgba(31,111,84,0.35)", color: "#1F6F54" }}
          >
            Export {year} (Power BI)
          </a>
          <button
            onClick={syncNow}
            disabled={syncing}
            className="text-xs font-semibold rounded-full px-3 py-1.5 disabled:opacity-50"
            style={{ background: "#F4F3EE", color: "rgba(22,48,43,0.7)" }}
          >
            {syncing ? "Syncing…" : "Sync now"}
          </button>
        </div>
      </div>

      {lastRun && (
        <p className="text-[11px] mb-3" style={{ color: lastRun.status === "error" ? "#B5566B" : "rgba(22,48,43,0.45)" }}>
          Last sync {new Date(lastRun.started_at).toLocaleString()} ·{" "}
          {lastRun.status === "success"
            ? `${lastRun.rows_upserted} updated`
            : lastRun.status === "not_configured"
              ? "not switched on"
              : lastRun.status === "error"
                ? `failed: ${lastRun.error ?? ""}`.slice(0, 200)
                : lastRun.status}
        </p>
      )}
      {msg && <p className="text-xs mb-3" style={{ color: "#1F6F54" }}>{msg}</p>}

      {count > 0 && (
        <>
          <div className="text-2xl font-bold" style={{ color: "#16302B" }}>
            {money(total)}
            <span className="text-xs font-normal ml-2" style={{ color: "rgba(22,48,43,0.5)" }}>
              {count.toLocaleString()} payments in {year}
              {unassigned > 0 ? ` · ${money(unassigned)} couldn't be matched to an office` : ""}
            </span>
          </div>
          <div className="grid sm:grid-cols-2 gap-6 mt-4">
            {[
              { title: "By program", rows: byProgram.map((p) => ({ label: p.program, total: p.total })) },
              { title: "Top offices", rows: byOffice.slice(0, 10).map((o) => ({ label: o.office, total: o.total })) },
            ].map((col) => (
              <div key={col.title}>
                <div className="text-xs font-semibold mb-2" style={{ color: "rgba(22,48,43,0.55)" }}>
                  {col.title}
                </div>
                {col.rows.map((r) => (
                  <div key={r.label} className="flex justify-between text-sm py-0.5">
                    <span className="truncate pr-3">{r.label}</span>
                    <span className="tabular-nums">{money(r.total)}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
