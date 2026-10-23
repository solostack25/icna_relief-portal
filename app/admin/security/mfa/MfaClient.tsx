"use client";

import { useMemo, useState } from "react";
import type { MfaPerson } from "../data";
import { METHOD_LABELS } from "../methods";
import { card, dim, emerald, faint, gold, ink, line, relTime, rose } from "../../devices/style";

const STRONG = new Set(["microsoftAuthenticatorPush", "microsoftAuthenticatorPasswordless", "fido2SecurityKey", "windowsHelloForBusiness", "passKeyDeviceBound", "passKeyDeviceBoundAuthenticator", "softwareOneTimePasscode", "hardwareOneTimePasscode"]);

export default function MfaClient({ people, adminsOnly }: { people: MfaPerson[]; adminsOnly: boolean }) {
  const [view, setView] = useState<"none" | "weak" | "all">("none");
  const [admins, setAdmins] = useState(adminsOnly);
  const [office, setOffice] = useState("");
  const [q, setQ] = useState("");

  const strength = (p: MfaPerson) => (!p.registered ? "none" : p.methods.some((m) => STRONG.has(m)) ? "strong" : "weak");

  const offices = useMemo(() => {
    const m = new Map<string, { total: number; none: number }>();
    for (const p of people) {
      const k = p.office ?? "No office in Entra";
      const o = m.get(k) ?? { total: 0, none: 0 };
      o.total++;
      if (!p.registered) o.none++;
      m.set(k, o);
    }
    return Array.from(m.entries()).sort((a, b) => b[1].none - a[1].none);
  }, [people]);

  const list = useMemo(() => {
    const term = q.trim().toLowerCase();
    return people
      .filter((p) => (view === "none" ? !p.registered : view === "weak" ? strength(p) === "weak" : true))
      .filter((p) => !admins || p.isAdmin)
      .filter((p) => !office || (p.office ?? "No office in Entra") === office)
      .filter((p) => !term || [p.name, p.upn, p.department].join(" ").toLowerCase().includes(term))
      .sort((a, b) => Number(b.isAdmin) - Number(a.isAdmin) || a.name.localeCompare(b.name));
  }, [people, view, admins, office, q]);

  const none = people.filter((p) => !p.registered).length;
  const weak = people.filter((p) => strength(p) === "weak").length;
  const pct = people.length ? Math.round(((people.length - none) / people.length) * 100) : 0;

  function exportCsv() {
    const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const head = ["Name", "Email", "Office", "Department", "Admin", "MFA registered", "Methods", "Default method", "Last sign-in"];
    const rows = list.map((p) => [p.name, p.upn, p.office, p.department, p.isAdmin ? "Yes" : "", p.registered ? "Yes" : "No", p.methods.map((m) => METHOD_LABELS[m] ?? m).join("; "), p.defaultMethod, p.lastSignIn].map(esc).join(","));
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([[head.map(esc).join(","), ...rows].join("\n")], { type: "text/csv" }));
    a.download = `mfa-${view}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  }

  const field = "rounded-xl px-3 py-2 text-sm bg-white outline-none";
  const fieldStyle = { border: `1.5px solid ${line}`, color: ink };

  return (
    <div>
      <div className="p-5 mb-5" style={card}>
        <div className="flex flex-wrap items-end justify-between gap-3 mb-3">
          <div>
            <div style={{ fontFamily: "'Fraunces', serif", fontSize: 34, fontWeight: 500, color: emerald, lineHeight: 1 }}>{pct}%</div>
            <div className="text-xs mt-1" style={{ color: dim }}>
              of {people.length} licensed staff have MFA set up
            </div>
          </div>
          <div className="flex gap-5 text-sm">
            <div>
              <b style={{ color: rose }}>{none}</b> <span style={{ color: dim }}>no MFA</span>
            </div>
            <div>
              <b style={{ color: gold }}>{weak}</b> <span style={{ color: dim }}>text/call only</span>
            </div>
            <div>
              <b style={{ color: rose }}>{people.filter((p) => p.isAdmin && !p.registered).length}</b> <span style={{ color: dim }}>admins without MFA</span>
            </div>
          </div>
        </div>
        <div className="h-2.5 rounded-full overflow-hidden" style={{ background: "rgba(22,48,43,0.08)" }}>
          <div className="h-full" style={{ width: `${pct}%`, background: emerald }} />
        </div>
      </div>

      <div className="mb-5" style={{ ...card, overflow: "hidden" }}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm" style={{ borderCollapse: "collapse", minWidth: 460 }}>
            <thead>
              <tr className="text-left text-xs" style={{ background: "rgba(22,48,43,0.03)", color: dim }}>
                <th className="px-4 py-2.5 font-semibold">Office (from Entra)</th>
                <th className="px-4 py-2.5 font-semibold text-right">No MFA</th>
                <th className="px-4 py-2.5 font-semibold text-right">Staff</th>
                <th className="px-4 py-2.5 font-semibold w-40">Set up</th>
              </tr>
            </thead>
            <tbody>
              {offices.map(([name, o]) => {
                const p = o.total ? Math.round(((o.total - o.none) / o.total) * 100) : 0;
                const on = office === name;
                return (
                  <tr key={name} onClick={() => setOffice(on ? "" : name)} className="cursor-pointer" style={{ borderTop: `1px solid ${line}`, background: on ? `${emerald}0D` : undefined }}>
                    <td className="px-4 py-2 font-semibold">{name}</td>
                    <td className="px-4 py-2 text-right font-bold" style={{ color: o.none ? rose : faint }}>
                      {o.none}
                    </td>
                    <td className="px-4 py-2 text-right">{o.total}</td>
                    <td className="px-4 py-2">
                      <div className="h-2 rounded-full overflow-hidden" style={{ background: "rgba(22,48,43,0.08)" }}>
                        <div className="h-full" style={{ width: `${p}%`, background: emerald }} />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-3">
        {(
          [
            ["none", `No MFA · ${none}`],
            ["weak", `Text/call only · ${weak}`],
            ["all", `Everyone · ${people.length}`],
          ] as const
        ).map(([v, label]) => (
          <button
            key={v}
            type="button"
            onClick={() => setView(v)}
            className="text-xs font-bold rounded-full px-3 py-1.5 cursor-pointer"
            style={{ border: `1.5px solid ${line}`, background: view === v ? ink : "#fff", color: view === v ? "#fff" : ink }}
          >
            {label}
          </button>
        ))}
        <label className="flex items-center gap-2 text-xs px-1" style={{ color: dim }}>
          <input type="checkbox" checked={admins} onChange={(e) => setAdmins(e.target.checked)} />
          Admins only
        </label>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search…" className={`${field} flex-1 min-w-[160px]`} style={fieldStyle} />
        {office && (
          <button type="button" onClick={() => setOffice("")} className="text-xs font-bold rounded-full px-3 py-2 cursor-pointer" style={{ border: `1.5px solid ${emerald}`, color: emerald, background: "#fff" }}>
            {office} ✕
          </button>
        )}
        <button type="button" onClick={exportCsv} className="text-xs font-bold px-3 py-2 rounded-full bg-white cursor-pointer" style={{ border: `1.5px solid ${line}`, color: ink }}>
          Export CSV
        </button>
      </div>

      <div style={{ ...card, overflow: "hidden" }}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm" style={{ borderCollapse: "collapse", minWidth: 760 }}>
            <thead>
              <tr className="text-left text-xs" style={{ background: "rgba(22,48,43,0.03)", color: dim }}>
                <th className="px-4 py-2.5 font-semibold">Person</th>
                <th className="px-4 py-2.5 font-semibold">MFA</th>
                <th className="px-4 py-2.5 font-semibold">Methods</th>
                <th className="px-4 py-2.5 font-semibold">Last sign-in</th>
              </tr>
            </thead>
            <tbody>
              {list.slice(0, 1000).map((p) => {
                const s = strength(p);
                const c = s === "strong" ? emerald : s === "weak" ? gold : rose;
                return (
                  <tr key={p.user_id} style={{ borderTop: `1px solid ${line}` }}>
                    <td className="px-4 py-2.5">
                      <div className="font-bold" style={{ color: ink }}>
                        <a href={`/admin/security/user?id=${p.user_id}`} className="hover:underline">
                          {p.name}
                        </a>
                        {p.isAdmin && (
                          <span className="ml-2 text-[10px] font-bold rounded-full px-2 py-0.5" style={{ color: rose, border: `1px solid ${rose}55` }}>
                            ADMIN
                          </span>
                        )}
                      </div>
                      <div className="text-xs" style={{ color: faint }}>
                        {[p.office, p.department].filter(Boolean).join(" · ") || p.upn}
                      </div>
                    </td>
                    <td className="px-4 py-2.5">
                      <span className="text-[11px] font-bold rounded-full px-2.5 py-1 whitespace-nowrap" style={{ color: c, background: `${c}14`, border: `1px solid ${c}33` }}>
                        {s === "strong" ? "Set up" : s === "weak" ? "Text/call only" : "Not set up"}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-xs" style={{ color: dim }}>
                      {p.methods.length ? p.methods.map((m) => METHOD_LABELS[m] ?? m).join(", ") : "—"}
                    </td>
                    <td className="px-4 py-2.5 text-xs whitespace-nowrap" style={{ color: dim }}>
                      {relTime(p.lastSignIn)}
                    </td>
                  </tr>
                );
              })}
              {list.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center" style={{ color: dim }}>
                    Nobody here.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
