"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "../ui";
import { card, dim, emerald, faint, gold, ink, line, relTime, rose } from "../style";

export type JoinPerson = {
  upn: string;
  name: string;
  office: string | null;
  department: string | null;
  hasIntune: boolean;
  registered: { key: string; name: string; lastSeen: string; inIntune: boolean }[];
  joined: { key: string; name: string; lastSeen: string; inIntune: boolean }[];
  lastSeen: string | null;
  tracking: { upn: string; status: string; method: string | null; scheduled_for: string | null; note: string | null; updated_at: string } | null;
};

const STATUS: Record<string, { label: string; color: string }> = {
  joined: { label: "Joined", color: emerald },
  not_started: { label: "Needs join", color: rose },
  scheduled: { label: "Scheduled", color: "#2B6CB0" },
  in_progress: { label: "In progress", color: gold },
  blocked: { label: "Blocked", color: "#7A2E2E" },
  done: { label: "Marked done", color: emerald },
  skip: { label: "Skip", color: "#7A7A7A" },
};
const METHOD: Record<string, string> = { manual: "Manual", ppkg: "Provisioning package", profile_wizard: "Profile Wizard", autopilot: "Wipe + Autopilot" };

// Joined once they're using a joined PC at least as recently as any
// registered-only one (7-day slack), or IT marked them done and a joined
// PC exists. Otherwise IT's status, defaulting to "needs join".
function effective(p: JoinPerson) {
  const latest = (xs: { lastSeen: string }[]) => xs.reduce((m, x) => (x.lastSeen > m ? x.lastSeen : m), "");
  const lj = latest(p.joined);
  const lr = latest(p.registered);
  if (lj && (!lr || new Date(lj).getTime() >= new Date(lr).getTime() - 7 * 86_400_000)) return "joined";
  if (lj && p.tracking?.status === "done") return "joined";
  return p.tracking?.status ?? "not_started";
}

export default function JoinClient({ people }: { people: JoinPerson[] }) {
  const router = useRouter();
  const [office, setOffice] = useState<string>("");
  const [status, setStatus] = useState("open");
  const [licensed, setLicensed] = useState("");
  const [q, setQ] = useState("");
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [bulk, setBulk] = useState({ status: "", method: "", date: "" });

  const withStatus = useMemo(() => people.map((p) => ({ ...p, eff: effective(p) })), [people]);

  const offices = useMemo(() => {
    const m = new Map<string, { total: number; joined: number; open: number; licensedOpen: number }>();
    for (const p of withStatus) {
      const k = p.office ?? "No office in Entra";
      const o = m.get(k) ?? { total: 0, joined: 0, open: 0, licensedOpen: 0 };
      o.total++;
      if (p.eff === "joined") o.joined++;
      else if (p.eff !== "skip") {
        o.open++;
        if (p.hasIntune) o.licensedOpen++;
      }
      m.set(k, o);
    }
    return Array.from(m.entries()).sort((a, b) => b[1].open - a[1].open);
  }, [withStatus]);

  const totals = useMemo(() => {
    const t = { total: withStatus.length, joined: 0, open: 0, scheduled: 0, licensedOpen: 0 };
    for (const p of withStatus) {
      if (p.eff === "joined") t.joined++;
      else if (p.eff !== "skip") {
        t.open++;
        if (p.eff === "scheduled" || p.eff === "in_progress") t.scheduled++;
        if (p.hasIntune) t.licensedOpen++;
      }
    }
    return t;
  }, [withStatus]);

  const list = useMemo(() => {
    const term = q.trim().toLowerCase();
    return withStatus
      .filter((p) => {
        if (office && (p.office ?? "No office in Entra") !== office) return false;
        if (status === "open" && (p.eff === "joined" || p.eff === "skip")) return false;
        if (status !== "open" && status !== "all" && p.eff !== status) return false;
        if (licensed === "yes" && !p.hasIntune) return false;
        if (licensed === "no" && p.hasIntune) return false;
        if (term && ![p.name, p.upn, p.department, ...p.registered.map((r) => r.name)].join(" ").toLowerCase().includes(term)) return false;
        return true;
      })
      .sort((a, b) => Number(b.hasIntune) - Number(a.hasIntune) || (a.office ?? "~").localeCompare(b.office ?? "~") || a.name.localeCompare(b.name));
  }, [withStatus, office, status, licensed, q]);

  const allSel = list.length > 0 && list.every((p) => sel.has(p.upn));

  async function save(upns: string[], patch: Record<string, unknown>) {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/devices/join-tracking", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ upns, ...patch }) });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "Failed");
      router.refresh();
      return true;
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function applyBulk() {
    const patch: Record<string, unknown> = {};
    if (bulk.status) patch.status = bulk.status;
    if (bulk.method) patch.method = bulk.method;
    if (bulk.date) patch.scheduled_for = bulk.date;
    if (!Object.keys(patch).length) return;
    if (await save(Array.from(sel), patch)) {
      setSel(new Set());
      setBulk({ status: "", method: "", date: "" });
    }
  }

  function exportCsv() {
    const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const head = ["Name", "Email", "Office", "Department", "Intune license", "Status", "Method", "Scheduled", "Registered PCs", "Joined PCs", "Last seen", "Note"];
    const rows = list.map((p) =>
      [p.name, p.upn, p.office, p.department, p.hasIntune ? "Yes" : "No", STATUS[p.eff]?.label, METHOD[p.tracking?.method ?? ""] ?? "", p.tracking?.scheduled_for ?? "", p.registered.map((r) => r.name).join("; "), p.joined.map((r) => r.name).join("; "), p.lastSeen, p.tracking?.note ?? ""]
        .map(esc)
        .join(",")
    );
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([[head.map(esc).join(","), ...rows].join("\n")], { type: "text/csv" }));
    a.download = `entra-join-tracker-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  }

  const field = "rounded-xl px-3 py-2 text-sm bg-white outline-none";
  const fieldStyle = { border: `1.5px solid ${line}`, color: ink };
  const pct = totals.total ? Math.round((totals.joined / totals.total) * 100) : 0;

  return (
    <div>
      <div className="p-5 mb-6" style={card}>
        <div className="flex flex-wrap items-end justify-between gap-3 mb-3">
          <div>
            <div style={{ fontFamily: "'Fraunces', serif", fontSize: 34, fontWeight: 500, color: emerald, lineHeight: 1 }}>{pct}%</div>
            <div className="text-xs mt-1" style={{ color: dim }}>
              of active computer users are on a joined PC · {totals.joined} of {totals.total}
            </div>
          </div>
          <div className="flex gap-5 text-sm">
            <div>
              <b style={{ color: rose }}>{totals.open}</b> <span style={{ color: dim }}>to convert</span>
            </div>
            <div>
              <b style={{ color: ink }}>{totals.licensedOpen}</b> <span style={{ color: dim }}>of them E3/E5</span>
            </div>
            <div>
              <b style={{ color: "#2B6CB0" }}>{totals.scheduled}</b> <span style={{ color: dim }}>scheduled / in progress</span>
            </div>
          </div>
        </div>
        <div className="h-2.5 rounded-full overflow-hidden" style={{ background: "rgba(22,48,43,0.08)" }}>
          <div className="h-full rounded-full" style={{ width: `${pct}%`, background: emerald }} />
        </div>
      </div>

      <div className="mb-6" style={{ ...card, overflow: "hidden" }}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm" style={{ borderCollapse: "collapse", minWidth: 560 }}>
            <thead>
              <tr className="text-left text-xs" style={{ background: "rgba(22,48,43,0.03)", color: dim }}>
                <th className="px-4 py-2.5 font-semibold">Office (from Entra)</th>
                <th className="px-4 py-2.5 font-semibold text-right">To convert</th>
                <th className="px-4 py-2.5 font-semibold text-right">E3/E5 to convert</th>
                <th className="px-4 py-2.5 font-semibold text-right">Joined</th>
                <th className="px-4 py-2.5 font-semibold w-40">Progress</th>
              </tr>
            </thead>
            <tbody>
              {offices.map(([name, o]) => {
                const p = o.total ? Math.round((o.joined / o.total) * 100) : 0;
                const active = office === name;
                return (
                  <tr key={name} onClick={() => setOffice(active ? "" : name)} className="cursor-pointer" style={{ borderTop: `1px solid ${line}`, background: active ? `${emerald}0D` : undefined }}>
                    <td className="px-4 py-2 font-semibold" style={{ color: ink }}>
                      {name}
                    </td>
                    <td className="px-4 py-2 text-right font-bold" style={{ color: o.open ? rose : faint }}>
                      {o.open}
                    </td>
                    <td className="px-4 py-2 text-right">{o.licensedOpen}</td>
                    <td className="px-4 py-2 text-right">{o.joined}</td>
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
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, email, PC…" className={`${field} flex-1 min-w-[200px]`} style={fieldStyle} />
        <select value={status} onChange={(e) => setStatus(e.target.value)} className={field} style={fieldStyle}>
          <option value="open">Still to convert</option>
          <option value="all">Everyone</option>
          {Object.entries(STATUS).map(([k, v]) => (
            <option key={k} value={k}>
              {v.label}
            </option>
          ))}
        </select>
        <select value={licensed} onChange={(e) => setLicensed(e.target.value)} className={field} style={fieldStyle}>
          <option value="">Any license</option>
          <option value="yes">E3/E5 (Intune)</option>
          <option value="no">No Intune license</option>
        </select>
        {office && (
          <button type="button" onClick={() => setOffice("")} className="text-xs font-bold rounded-full px-3 py-2 cursor-pointer" style={{ border: `1.5px solid ${emerald}`, color: emerald, background: "#fff" }}>
            {office} ✕
          </button>
        )}
        <button type="button" onClick={exportCsv} className="text-xs font-bold px-3 py-2 rounded-full bg-white cursor-pointer" style={{ border: `1.5px solid ${line}`, color: ink }}>
          Export CSV
        </button>
      </div>

      {sel.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 mb-3 p-3" style={card}>
          <span className="text-sm font-bold">{sel.size} selected</span>
          <select value={bulk.status} onChange={(e) => setBulk((b) => ({ ...b, status: e.target.value }))} className={field} style={fieldStyle}>
            <option value="">Set status…</option>
            {["not_started", "scheduled", "in_progress", "blocked", "done", "skip"].map((k) => (
              <option key={k} value={k}>
                {STATUS[k].label}
              </option>
            ))}
          </select>
          <select value={bulk.method} onChange={(e) => setBulk((b) => ({ ...b, method: e.target.value }))} className={field} style={fieldStyle}>
            <option value="">Method…</option>
            {Object.entries(METHOD).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
          <input type="date" value={bulk.date} onChange={(e) => setBulk((b) => ({ ...b, date: e.target.value }))} className={field} style={fieldStyle} />
          <Button variant="primary" onClick={applyBulk} disabled={busy || (!bulk.status && !bulk.method && !bulk.date)}>
            Apply
          </Button>
        </div>
      )}
      {err && (
        <div className="text-sm mb-3" style={{ color: rose }}>
          {err}
        </div>
      )}

      <div className="text-xs mb-2" style={{ color: faint }}>
        {list.length} people
      </div>
      <div style={{ ...card, overflow: "hidden" }}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm" style={{ borderCollapse: "collapse", minWidth: 900 }}>
            <thead>
              <tr className="text-left text-xs" style={{ background: "rgba(22,48,43,0.03)", color: dim }}>
                <th className="px-4 py-2.5 w-10">
                  <input type="checkbox" checked={allSel} onChange={() => setSel(allSel ? new Set() : new Set(list.map((p) => p.upn)))} aria-label="Select all" />
                </th>
                <th className="px-4 py-2.5 font-semibold">Person</th>
                <th className="px-4 py-2.5 font-semibold">Computers</th>
                <th className="px-4 py-2.5 font-semibold">License</th>
                <th className="px-4 py-2.5 font-semibold">Status</th>
                <th className="px-4 py-2.5 font-semibold">Plan</th>
              </tr>
            </thead>
            <tbody>
              {list.slice(0, 800).map((p) => {
                const s = STATUS[p.eff] ?? STATUS.not_started;
                return (
                  <tr key={p.upn} style={{ borderTop: `1px solid ${line}` }} className="align-top">
                    <td className="px-4 py-2.5">
                      <input
                        type="checkbox"
                        checked={sel.has(p.upn)}
                        onChange={(e) =>
                          setSel((x) => {
                            const n = new Set(x);
                            if (e.target.checked) n.add(p.upn);
                            else n.delete(p.upn);
                            return n;
                          })
                        }
                      />
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="font-bold" style={{ color: ink }}>
                        {p.name}
                      </div>
                      <div className="text-xs" style={{ color: faint }}>
                        {[p.office, p.department].filter(Boolean).join(" · ") || p.upn}
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-xs">
                      {p.registered.map((r) => (
                        <div key={r.key}>
                          <Link href={`/admin/devices/${encodeURIComponent(r.key)}`} className="hover:underline" style={{ color: rose }}>
                            {r.name}
                          </Link>{" "}
                          <span style={{ color: faint }}>registered · {relTime(r.lastSeen)}</span>
                        </div>
                      ))}
                      {p.joined.map((r) => (
                        <div key={r.key}>
                          <Link href={`/admin/devices/${encodeURIComponent(r.key)}`} className="hover:underline" style={{ color: emerald }}>
                            {r.name}
                          </Link>{" "}
                          <span style={{ color: faint }}>
                            joined{r.inIntune ? " + Intune" : ""} · {relTime(r.lastSeen)}
                          </span>
                        </div>
                      ))}
                    </td>
                    <td className="px-4 py-2.5 text-xs" style={{ color: p.hasIntune ? emerald : dim }}>
                      {p.hasIntune ? "E3/E5" : "Basic/Std"}
                    </td>
                    <td className="px-4 py-2.5">
                      <span className="text-[11px] font-bold rounded-full px-2.5 py-1 whitespace-nowrap" style={{ color: s.color, background: `${s.color}14`, border: `1px solid ${s.color}33` }}>
                        {s.label}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-xs" style={{ color: dim }}>
                      {p.tracking?.method && <div>{METHOD[p.tracking.method]}</div>}
                      {p.tracking?.scheduled_for && <div>{new Date(`${p.tracking.scheduled_for}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</div>}
                      <button
                        type="button"
                        className="underline cursor-pointer"
                        style={{ color: p.tracking?.note ? ink : faint }}
                        onClick={async () => {
                          const note = prompt("Note for this person:", p.tracking?.note ?? "");
                          if (note !== null) await save([p.upn], { note });
                        }}
                      >
                        {p.tracking?.note ? p.tracking.note : "Add note"}
                      </button>
                    </td>
                  </tr>
                );
              })}
              {list.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center" style={{ color: dim }}>
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
