"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { COVERAGE_LABELS, TRUST_LABELS, isStale, type Coverage } from "@/lib/devices/shared";
import type { DeviceListRow } from "./data";
import { CoveragePill, card, dim, emerald, faint, gold, ink, line, relTime, rose } from "./style";

type Quick = "all" | Coverage | "stale" | "attention";

function osFamily(os: string | null) {
  const o = (os ?? "").toLowerCase();
  if (o.includes("windows")) return "Windows";
  if (o.includes("mac")) return "macOS";
  if (o.includes("ios") || o.includes("ipad")) return "iOS/iPadOS";
  if (o.includes("android")) return "Android";
  if (o.includes("linux")) return "Linux";
  return os || "Other";
}

// Intune says something's wrong: not compliant, or not encrypted.
function needsAttention(d: DeviceListRow) {
  if (!d.intune_id) return false;
  return (d.compliance_state && d.compliance_state !== "compliant" && d.compliance_state !== "inGracePeriod") || d.is_encrypted === false;
}

export default function DevicesClient({ devices, initialQuery = "" }: { devices: DeviceListRow[]; initialQuery?: string }) {
  const [q, setQ] = useState(initialQuery);
  const [quick, setQuick] = useState<Quick>("all");
  const [os, setOs] = useState("");
  const [office, setOffice] = useState("");
  const [showDisabled, setShowDisabled] = useState(false);

  const now = Date.now();
  const base = useMemo(() => devices.filter((d) => showDisabled || d.account_enabled !== false), [devices, showDisabled]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: base.length, stale: 0, attention: 0 };
    for (const d of base) {
      c[d.coverage] = (c[d.coverage] ?? 0) + 1;
      if (isStale(d.approx_last_sign_in ?? d.intune_last_sync, now)) c.stale++;
      if (needsAttention(d)) c.attention++;
    }
    return c;
  }, [base, now]);

  const osOptions = useMemo(() => Array.from(new Set(base.map((d) => osFamily(d.operating_system)))).sort(), [base]);
  const officeOptions = useMemo(() => Array.from(new Set(base.map((d) => d.office).filter(Boolean) as string[])).sort(), [base]);

  const shown = useMemo(() => {
    const term = q.trim().toLowerCase();
    return base.filter((d) => {
      if (quick === "stale" && !isStale(d.approx_last_sign_in ?? d.intune_last_sync, now)) return false;
      if (quick === "attention" && !needsAttention(d)) return false;
      if (quick !== "all" && quick !== "stale" && quick !== "attention" && d.coverage !== quick) return false;
      if (os && osFamily(d.operating_system) !== os) return false;
      if (office && d.office !== office) return false;
      if (term) {
        const hay = [d.display_name, d.owner_name, d.owner_upn, d.serial_number, d.model, d.manufacturer].join(" ").toLowerCase();
        if (!hay.includes(term)) return false;
      }
      return true;
    });
  }, [base, q, quick, os, office, now]);

  function exportCsv() {
    const head = ["Device", "Owner", "Owner email", "Office", "OS", "OS version", "Join type", "Coverage", "Last seen", "Serial", "Manufacturer", "Model", "Compliance", "Encrypted", "Enabled"];
    const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const rows = shown.map((d) =>
      [
        d.display_name,
        d.owner_name,
        d.owner_upn,
        d.office,
        d.operating_system,
        d.os_version,
        TRUST_LABELS[d.trust_type ?? ""] ?? d.trust_type,
        COVERAGE_LABELS[d.coverage as Coverage] ?? d.coverage,
        d.approx_last_sign_in ?? d.intune_last_sync,
        d.serial_number,
        d.manufacturer,
        d.model,
        d.compliance_state,
        d.is_encrypted == null ? "" : d.is_encrypted ? "Yes" : "No",
        d.account_enabled === false ? "No" : "Yes",
      ]
        .map(esc)
        .join(",")
    );
    const blob = new Blob([[head.map(esc).join(","), ...rows].join("\n")], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `devices-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  const tiles: { key: Quick; label: string; color: string; hint: string }[] = [
    { key: "all", label: "All devices", color: ink, hint: "Enabled devices in Entra/Intune" },
    { key: "intune", label: "Managed by Intune", color: emerald, hint: "Policies apply" },
    { key: "licensed_not_enrolled", label: "Licensed, not enrolled", color: gold, hint: "Enroll these next" },
    { key: "unlicensed", label: "No Intune license", color: rose, hint: "Owner on Basic/Standard" },
    { key: "personal", label: "Personal", color: "#2B6CB0", hint: "Work account on own device" },
    { key: "stale", label: `Not seen ${90}+ days`, color: "#7A7A7A", hint: "Lost, retired or unused?" },
    { key: "attention", label: "Needs attention", color: rose, hint: "Non-compliant or unencrypted" },
  ];

  const field = "rounded-xl px-3 py-2 text-sm bg-white outline-none";
  const fieldStyle = { border: `1.5px solid ${line}`, color: ink };

  return (
    <div>
      <div className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-7 gap-2.5 mb-6">
        {tiles.map((t) => {
          const active = quick === t.key;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setQuick(active && t.key !== "all" ? "all" : t.key)}
              className="text-left p-3.5 transition-transform hover:-translate-y-0.5 cursor-pointer"
              style={{ ...card, borderColor: active ? t.color : line, boxShadow: active ? `0 0 0 2px ${t.color}33` : card.boxShadow }}
            >
              <div style={{ fontFamily: "'Fraunces', serif", fontSize: 26, fontWeight: 500, color: t.color, lineHeight: 1 }}>{counts[t.key] ?? 0}</div>
              <div className="text-xs font-bold mt-1.5" style={{ color: ink }}>
                {t.label}
              </div>
              <div className="text-[11px]" style={{ color: faint }}>
                {t.hint}
              </div>
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-4">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, owner, serial, model…" className={`${field} flex-1 min-w-[200px]`} style={fieldStyle} />
        <select value={os} onChange={(e) => setOs(e.target.value)} className={field} style={fieldStyle}>
          <option value="">All OS</option>
          {osOptions.map((o) => (
            <option key={o}>{o}</option>
          ))}
        </select>
        <select value={office} onChange={(e) => setOffice(e.target.value)} className={field} style={fieldStyle}>
          <option value="">All offices</option>
          {officeOptions.map((o) => (
            <option key={o}>{o}</option>
          ))}
        </select>
        <label className="flex items-center gap-2 text-xs px-2" style={{ color: dim }}>
          <input type="checkbox" checked={showDisabled} onChange={(e) => setShowDisabled(e.target.checked)} />
          Include disabled
        </label>
        <button type="button" onClick={exportCsv} className="text-xs font-bold px-3 py-2 rounded-full bg-white cursor-pointer" style={{ border: `1.5px solid ${line}`, color: ink }}>
          Export CSV
        </button>
      </div>

      <div className="text-xs mb-2" style={{ color: faint }}>
        {shown.length} of {base.length}
      </div>

      {shown.length === 0 ? (
        <div className="p-8 text-center text-sm" style={{ ...card, color: dim }}>
          {devices.length === 0 ? "No devices yet. Run a sync once the Microsoft permissions are granted." : "No devices match these filters."}
        </div>
      ) : (
        <div style={{ ...card, overflow: "hidden" }}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm" style={{ borderCollapse: "collapse", minWidth: 860 }}>
              <thead>
                <tr style={{ background: "rgba(22,48,43,0.03)", color: dim }} className="text-left text-xs">
                  <th className="px-4 py-2.5 font-semibold">Device</th>
                  <th className="px-4 py-2.5 font-semibold">Owner</th>
                  <th className="px-4 py-2.5 font-semibold">OS</th>
                  <th className="px-4 py-2.5 font-semibold">Coverage</th>
                  <th className="px-4 py-2.5 font-semibold">Health</th>
                  <th className="px-4 py-2.5 font-semibold">Last seen</th>
                </tr>
              </thead>
              <tbody>
                {shown.slice(0, 500).map((d) => {
                  const last = d.approx_last_sign_in ?? d.intune_last_sync;
                  const stale = isStale(last, now);
                  return (
                    <tr key={d.device_key} style={{ borderTop: `1px solid ${line}`, opacity: d.account_enabled === false ? 0.55 : 1 }}>
                      <td className="px-4 py-2.5">
                        <Link href={`/admin/devices/${encodeURIComponent(d.device_key)}`} className="font-bold hover:underline" style={{ color: ink }}>
                          {d.display_name ?? "Unnamed device"}
                        </Link>
                        <div className="text-xs" style={{ color: faint }}>
                          {[d.manufacturer, d.model].filter(Boolean).join(" ") || TRUST_LABELS[d.trust_type ?? ""] || "—"}
                          {d.serial_number ? ` · ${d.serial_number}` : ""}
                          {d.account_enabled === false ? " · disabled" : ""}
                        </div>
                      </td>
                      <td className="px-4 py-2.5">
                        <div style={{ color: ink }}>{d.owner_name ?? d.owner_upn ?? "—"}</div>
                        <div className="text-xs" style={{ color: faint }}>
                          {d.office ?? ""}
                        </div>
                      </td>
                      <td className="px-4 py-2.5 whitespace-nowrap">
                        {osFamily(d.operating_system)}
                        <div className="text-xs" style={{ color: faint }}>
                          {d.os_version ?? ""}
                        </div>
                      </td>
                      <td className="px-4 py-2.5">
                        <CoveragePill coverage={d.coverage} />
                      </td>
                      <td className="px-4 py-2.5 text-xs whitespace-nowrap">
                        {d.intune_id ? (
                          <>
                            <div style={{ color: d.compliance_state === "compliant" ? emerald : d.compliance_state === "inGracePeriod" ? gold : rose }}>
                              {d.compliance_state === "compliant" ? "Compliant" : d.compliance_state === "inGracePeriod" ? "Grace period" : d.compliance_state ? "Not compliant" : "Unknown"}
                            </div>
                            <div style={{ color: d.is_encrypted ? emerald : d.is_encrypted === false ? rose : faint }}>
                              {d.is_encrypted ? "Encrypted" : d.is_encrypted === false ? "Not encrypted" : "Encryption unknown"}
                            </div>
                          </>
                        ) : (
                          <span style={{ color: faint }}>Not in Intune</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 whitespace-nowrap text-xs" style={{ color: stale ? rose : dim, fontWeight: stale ? 700 : 400 }}>
                        {relTime(last)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {shown.length > 500 && (
            <div className="px-4 py-3 text-xs" style={{ color: dim, borderTop: `1px solid ${line}` }}>
              Showing the first 500. Narrow the filters or export to CSV for the rest.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
