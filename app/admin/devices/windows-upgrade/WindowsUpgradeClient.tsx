"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { card, dim, faint, emerald, gold, rose, ink, line } from "../style";

type DeviceRow = {
  deviceKey: string;
  name: string | null;
  model: string | null;
  serial: string | null;
  person: string | null;
  employeeId: string | null;
  office: string | null;
  edition: string;
  editionSource: string | null;
  joined: boolean;
  managed: boolean;
  needsUpgrade: boolean;
  active: boolean;
  lastSeen: string | null;
};
type Upgrade = {
  id: string;
  device_key: string;
  device_name: string | null;
  employee_id: string | null;
  owner_upn?: string | null;
  key_id: string | null;
  status: string;
  reported_edition: string | null;
  steps: Record<string, string>;
  blocked_reason: string | null;
  updated_at: string;
  completed_at: string | null;
  key: { license_type: string; key_last5: string } | null;
  person: string | null;
  personEmail: string | null;
  office: string | null;
};
type Key = { id: string; product: string; license_type: string; key_last5: string; activations_total: number; activations_used: number; status: string; purchase_ref: string | null; created_at: string };
type Pool = Record<string, { total: number; used: number; available: number }>;

const STATUS: Record<string, { label: string; color: string }> = {
  planned: { label: "Planned", color: faint },
  key_assigned: { label: "Key assigned", color: gold },
  upgraded: { label: "On Pro · not joined", color: gold },
  joined: { label: "Joined · confirming", color: "#3E7C9A" },
  complete: { label: "Complete", color: emerald },
  blocked: { label: "Blocked", color: rose },
};
const LICENSE_LABEL: Record<string, string> = { retail: "Retail (FPP)", csp_perpetual: "CSP perpetual", oem: "OEM", mak: "Volume (MAK)" };

async function post(action: string, body: Record<string, unknown> = {}) {
  const res = await fetch("/api/devices/windows-upgrade", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, ...body }) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? "Failed");
  return data;
}

export default function WindowsUpgradeClient({ devices, upgrades, keys, pool }: { devices: DeviceRow[]; upgrades: Upgrade[]; keys: Key[]; pool: Pool }) {
  const router = useRouter();
  const [tab, setTab] = useState<"report" | "upgrades" | "keys">("report");
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [addOpen, setAddOpen] = useState(false);
  const [tech, setTech] = useState<{ upgrade: Upgrade; key: string; licenseType: string } | null>(null);
  const [filter, setFilter] = useState<string>("needs");

  const plannedKeys = new Set(upgrades.filter((u) => u.status !== "complete").map((u) => u.device_key));
  const fullAvail = (pool.retail?.available ?? 0) + (pool.csp_perpetual?.available ?? 0) + (pool.oem?.available ?? 0);
  const makAvail = pool.mak?.available ?? 0;

  const summary = useMemo(() => {
    const by = (pred: (d: DeviceRow) => boolean) => devices.filter((d) => d.active && pred(d)).length;
    return {
      home: by((d) => d.edition === "Home"),
      unknown: by((d) => d.edition.startsWith("Unknown") && d.needsUpgrade),
      pro: by((d) => ["Pro", "Pro for Workstations"].includes(d.edition)),
      ent: by((d) => ["Enterprise", "Enterprise LTSC", "Education", "Pro Education"].includes(d.edition)),
      notManaged: by((d) => !d.managed),
      complete: upgrades.filter((u) => u.status === "complete").length,
      active: devices.filter((d) => d.active).length,
      stale: devices.filter((d) => !d.active).length,
    };
  }, [devices, upgrades]);

  const byOffice = useMemo(() => {
    const m = new Map<string, { office: string; total: number; home: number; unknown: number; ok: number; done: number; open: number }>();
    for (const d of devices) {
      if (!d.active) continue;
      const k = d.office ?? "No office on file";
      const r = m.get(k) ?? { office: k, total: 0, home: 0, unknown: 0, ok: 0, done: 0, open: 0 };
      r.total++;
      if (d.edition === "Home") r.home++;
      else if (d.edition.startsWith("Unknown") && d.needsUpgrade) r.unknown++;
      else if (!d.needsUpgrade) r.ok++;
      m.set(k, r);
    }
    for (const u of upgrades) {
      const k = u.office ?? "No office on file";
      const r = m.get(k);
      if (!r) continue;
      if (u.status === "complete") r.done++;
      else r.open++;
    }
    return [...m.values()].sort((a, b) => b.home + b.unknown - (a.home + a.unknown));
  }, [devices, upgrades]);

  const shown = devices.filter((d) =>
    filter === "stale" ? !d.active : d.active && (filter === "needs" ? d.needsUpgrade : filter === "home" ? d.edition === "Home" : filter === "unknown" ? d.edition.startsWith("Unknown") : true)
  );

  async function run(label: string, fn: () => Promise<any>, after?: (r: any) => void) {
    setBusy(label);
    setMsg(null);
    try {
      const r = await fn();
      after?.(r);
      router.refresh();
    } catch (e: any) {
      setMsg(e.message);
    } finally {
      setBusy(null);
    }
  }

  const licensesNeeded = Math.max(0, summary.home - fullAvail);

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3 mb-1">
        <div>
          <h1 style={{ fontFamily: "'Fraunces', serif", fontStyle: "italic", fontWeight: 500, fontSize: 30, margin: 0 }}>Windows 11 Pro Upgrade</h1>
          <p className="text-sm mt-1" style={{ color: dim }}>
            Get every ICNA Relief PC onto Pro, joined to Entra ID and managed by Intune. Editions come from Intune; Home PCs are confirmed on the device during the upgrade.
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => run("sync", () => post("sync_editions"), (r) => setMsg(r.error ? r.error : `Editions refreshed for ${r.updated} managed PCs.`))} disabled={!!busy} className="text-xs font-bold px-3.5 py-2 rounded-full" style={{ border: `1px solid ${line}`, background: "#fff" }}>
            {busy === "sync" ? "Refreshing…" : "Refresh editions"}
          </button>
          <button onClick={() => setAddOpen(true)} className="text-xs font-bold px-3.5 py-2 rounded-full text-white" style={{ background: emerald }}>
            + Add license keys
          </button>
        </div>
      </div>
      {msg && (
        <p className="text-xs my-2 px-3 py-2 rounded-lg" style={{ background: "#FBF7EF", color: ink }}>
          {msg}
        </p>
      )}

      <div className="grid gap-3 my-5" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))" }}>
        <Stat label="Windows Home" value={summary.home} color={rose} note="need a full Pro license" />
        <Stat label="Edition unknown" value={summary.unknown} color={gold} note="registered-only; confirm on PC" />
        <Stat label="Pro" value={summary.pro} />
        <Stat label="Enterprise / Edu" value={summary.ent} color={emerald} note="via M365 E3/E5" />
        <Stat label="Full Pro keys left" value={fullAvail} color={fullAvail ? emerald : rose} note={makAvail ? `+ ${makAvail} MAK activations (Pro PCs only)` : undefined} />
        <Stat label="Upgrades complete" value={summary.complete} color={emerald} />
      </div>

      <p className="text-xs -mt-2 mb-4" style={{ color: faint }}>
        Counting the {summary.active} Windows PCs used in the last 90 days. {summary.stale} older registrations (old, personal or duplicate PCs that haven't signed in for 90+ days) are under the Stale filter - clean those up in Devices → Cleanup rather than buying licenses for them.
      </p>

      {licensesNeeded > 0 && (
        <div className="p-4 mb-5 text-sm" style={{ ...card, borderColor: `${gold}55` }}>
          <b>Licenses to buy:</b> you have {summary.home} Home PC{summary.home === 1 ? "" : "s"} and {fullAvail} full Pro key{fullAvail === 1 ? "" : "s"} on hand, so at least <b>{licensesNeeded}</b> more full Windows 11 Pro licenses (retail, CSP perpetual or OEM, <i>not</i> volume/MAK) are needed. {summary.unknown > 0 && <>Up to {summary.unknown} more may be needed once the unknown PCs are checked.</>}
        </div>
      )}

      <div className="flex gap-1.5 mb-4">
        {(
          [
            ["report", `Edition report`],
            ["upgrades", `Upgrades (${upgrades.filter((u) => u.status !== "complete").length} open)`],
            ["keys", `Keys (${keys.length})`],
          ] as const
        ).map(([t, l]) => (
          <button key={t} onClick={() => setTab(t)} className="text-xs font-bold px-3.5 py-2 rounded-full" style={{ background: tab === t ? ink : "#fff", color: tab === t ? "#fff" : ink, border: `1px solid ${line}` }}>
            {l}
          </button>
        ))}
      </div>

      {tab === "report" && (
        <>
          <section className="p-4 mb-5 overflow-x-auto" style={card}>
            <div className="text-sm font-bold mb-3">By office</div>
            <table className="w-full text-xs">
              <thead>
                <tr style={{ color: dim }} className="text-left">
                  <th className="py-1.5 pr-3">Office</th>
                  <th className="py-1.5 pr-3">Windows PCs</th>
                  <th className="py-1.5 pr-3">Home</th>
                  <th className="py-1.5 pr-3">Unknown</th>
                  <th className="py-1.5 pr-3">Pro or better</th>
                  <th className="py-1.5 pr-3">Upgrades open</th>
                  <th className="py-1.5">Complete</th>
                </tr>
              </thead>
              <tbody>
                {byOffice.map((r) => (
                  <tr key={r.office} style={{ borderTop: `1px solid ${line}` }}>
                    <td className="py-2 pr-3 font-semibold">{r.office}</td>
                    <td className="py-2 pr-3">{r.total}</td>
                    <td className="py-2 pr-3" style={{ color: r.home ? rose : faint, fontWeight: 700 }}>{r.home}</td>
                    <td className="py-2 pr-3" style={{ color: r.unknown ? gold : faint, fontWeight: 700 }}>{r.unknown}</td>
                    <td className="py-2 pr-3">{r.ok}</td>
                    <td className="py-2 pr-3">{r.open}</td>
                    <td className="py-2" style={{ color: emerald, fontWeight: 700 }}>{r.done}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <section className="p-4" style={card}>
            <div className="flex flex-wrap items-center gap-2 mb-3">
              <div className="text-sm font-bold mr-auto">Windows PCs</div>
              {(
                [
                  ["needs", "Needs upgrade"],
                  ["home", "Home"],
                  ["unknown", "Unknown"],
                  ["all", "All active"],
                  ["stale", `Stale (${summary.stale})`],
                ] as const
              ).map(([f, l]) => (
                <button key={f} onClick={() => setFilter(f)} className="text-[11px] font-bold px-2.5 py-1 rounded-full" style={{ background: filter === f ? ink : "#fff", color: filter === f ? "#fff" : ink, border: `1px solid ${line}` }}>
                  {l}
                </button>
              ))}
              <button
                disabled={!!busy || selected.length === 0}
                onClick={() => run("plan", () => post("plan", { deviceKeys: selected }), (r) => { setSelected([]); setMsg(`Planned ${r.created} upgrade${r.created === 1 ? "" : "s"}.${r.skipped.length ? ` Skipped: ${r.skipped.slice(0, 4).join("; ")}${r.skipped.length > 4 ? "…" : ""}` : ""}`); setTab("upgrades"); })}
                className="text-[11px] font-bold px-3 py-1.5 rounded-full text-white disabled:opacity-40"
                style={{ background: emerald }}
              >
                {busy === "plan" ? "Planning…" : `Plan upgrade for ${selected.length || ""} selected`}
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr style={{ color: dim }} className="text-left">
                    <th className="py-1.5 pr-2">
                      <input
                        type="checkbox"
                        aria-label="Select all"
                        checked={shown.length > 0 && shown.filter((d) => !plannedKeys.has(d.deviceKey)).every((d) => selected.includes(d.deviceKey))}
                        onChange={(e) => setSelected(e.target.checked ? shown.filter((d) => !plannedKeys.has(d.deviceKey) && d.needsUpgrade).map((d) => d.deviceKey) : [])}
                      />
                    </th>
                    <th className="py-1.5 pr-3">PC</th>
                    <th className="py-1.5 pr-3">Person</th>
                    <th className="py-1.5 pr-3">Office</th>
                    <th className="py-1.5 pr-3">Edition</th>
                    <th className="py-1.5 pr-3">Joined / managed</th>
                    <th className="py-1.5">Confirm edition</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((d) => (
                    <tr key={d.deviceKey} style={{ borderTop: `1px solid ${line}` }}>
                      <td className="py-2 pr-2">
                        {plannedKeys.has(d.deviceKey) ? (
                          <span className="text-[10px] font-bold" style={{ color: gold }}>planned</span>
                        ) : (
                          d.needsUpgrade && <input type="checkbox" aria-label={`Select ${d.name}`} checked={selected.includes(d.deviceKey)} onChange={(e) => setSelected((s) => (e.target.checked ? [...s, d.deviceKey] : s.filter((x) => x !== d.deviceKey)))} />
                        )}
                      </td>
                      <td className="py-2 pr-3">
                        <div className="font-semibold">{d.name ?? "(unnamed)"}</div>
                        <div style={{ color: faint }}>{[d.model, d.serial].filter(Boolean).join(" · ")}</div>
                      </td>
                      <td className="py-2 pr-3">{d.person ?? "—"}</td>
                      <td className="py-2 pr-3">{d.office ?? "—"}</td>
                      <td className="py-2 pr-3">
                        <EditionPill edition={d.edition} />
                        {d.editionSource === "reported" && <span className="ml-1 text-[10px]" style={{ color: faint }}>reported</span>}
                      </td>
                      <td className="py-2 pr-3" style={{ color: d.joined && d.managed ? emerald : dim }}>
                        {d.joined ? "Joined" : "Not joined"} · {d.managed ? "Intune" : "unmanaged"}
                      </td>
                      <td className="py-2">
                        {d.edition.startsWith("Unknown") && (
                          <select aria-label={`Set edition for ${d.name}`} defaultValue="" onChange={(e) => e.target.value && run("ed", () => post("set_edition", { deviceKey: d.deviceKey, edition: e.target.value }))} className="text-[11px] rounded-md px-1.5 py-1" style={{ border: `1px solid ${line}` }}>
                            <option value="">Set…</option>
                            <option>Home</option>
                            <option>Pro</option>
                            <option>Enterprise</option>
                          </select>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {shown.length === 0 && (
                <p className="text-xs py-3" style={{ color: dim }}>
                  Nothing here.
                </p>
              )}
            </div>
          </section>
        </>
      )}

      {tab === "upgrades" && (
        <section className="space-y-2">
          {upgrades.length === 0 && (
            <p className="text-sm" style={{ color: dim }}>
              No upgrades planned yet. Select PCs in the Edition report and plan them, or staff can start their own from the portal.
            </p>
          )}
          {upgrades.map((u) => {
            const st = STATUS[u.status] ?? { label: u.status, color: faint };
            return (
              <div key={u.id} className="p-4 flex flex-wrap items-center gap-3" style={card}>
                <span className="text-[10px] font-extrabold uppercase px-2 py-1 rounded-full" style={{ color: st.color, background: `${st.color}14`, border: `1px solid ${st.color}33` }}>
                  {st.label}
                </span>
                <div className="flex-1 min-w-[220px]">
                  <div className="text-sm font-bold">{u.device_name ?? "(unnamed PC)"}</div>
                  <div className="text-xs" style={{ color: dim }}>
                    {[u.person, u.office, u.reported_edition && `was ${u.reported_edition}`, u.key && `${LICENSE_LABEL[u.key.license_type]} …${u.key.key_last5}`].filter(Boolean).join(" · ")}
                    {u.blocked_reason && <span style={{ color: rose }}> · {u.blocked_reason}</span>}
                  </div>
                  <StepDots steps={u.steps} status={u.status} />
                </div>
                {u.status !== "complete" && (
                  <div className="flex flex-wrap gap-1.5">
                    {!u.key_id && (
                      <>
                        <Btn onClick={() => run(`a${u.id}`, () => post("assign_key", { upgradeId: u.id }))} busy={busy === `a${u.id}`}>
                          Assign key
                        </Btn>
                        {u.reported_edition !== "Home" && makAvail > 0 && (
                          <Btn onClick={() => run(`m${u.id}`, () => post("assign_key", { upgradeId: u.id, allowMak: true }))} busy={busy === `m${u.id}`}>
                            Assign MAK
                          </Btn>
                        )}
                      </>
                    )}
                    {u.key_id && (
                      <Btn
                        primary
                        onClick={() => run(`r${u.id}`, () => post("reveal_key", { upgradeId: u.id }), (r) => setTech({ upgrade: u, key: r.key, licenseType: r.licenseType }))}
                        busy={busy === `r${u.id}`}
                      >
                        Tech mode
                      </Btn>
                    )}
                    {u.employee_id && (
                      <Btn onClick={() => run(`c${u.id}`, () => post("refresh_employee", { employeeId: u.employee_id }), (r) => setMsg(r.completed ? `Confirmed: ${r.completed} upgrade${r.completed === 1 ? "" : "s"} complete.` : "Not confirmed yet - the PC must be joined to Entra ID, show up in Intune, and report Pro. Intune can take up to an hour after joining."))} busy={busy === `c${u.id}`}>
                        Check now
                      </Btn>
                    )}
                    <Btn onClick={() => { const reason = prompt("What's blocking this upgrade?"); if (reason) run(`b${u.id}`, () => post("set_step", { upgradeId: u.id, step: "blocked", value: reason })); }}>Blocked</Btn>
                    <Btn onClick={() => confirm("Cancel this upgrade? An unused key goes back to the pool.") && run(`x${u.id}`, () => post("set_step", { upgradeId: u.id, step: "cancelled" }))}>Cancel</Btn>
                  </div>
                )}
              </div>
            );
          })}
        </section>
      )}

      {tab === "keys" && (
        <section className="p-4 overflow-x-auto" style={card}>
          <div className="grid gap-3 mb-4" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))" }}>
            {Object.entries(LICENSE_LABEL).map(([t, l]) => (
              <div key={t} className="p-3 rounded-xl" style={{ border: `1px solid ${line}` }}>
                <div className="text-lg font-extrabold">
                  {pool[t]?.available ?? 0}
                  <span className="text-xs font-semibold" style={{ color: faint }}> / {pool[t]?.total ?? 0}</span>
                </div>
                <div className="text-[11px] font-semibold" style={{ color: dim }}>
                  {l} available
                </div>
              </div>
            ))}
          </div>
          <table className="w-full text-xs">
            <thead>
              <tr style={{ color: dim }} className="text-left">
                <th className="py-1.5 pr-3">Key</th>
                <th className="py-1.5 pr-3">Type</th>
                <th className="py-1.5 pr-3">Product</th>
                <th className="py-1.5 pr-3">Used</th>
                <th className="py-1.5 pr-3">Status</th>
                <th className="py-1.5 pr-3">Purchase ref</th>
                <th className="py-1.5" />
              </tr>
            </thead>
            <tbody>
              {keys.map((k) => (
                <tr key={k.id} style={{ borderTop: `1px solid ${line}` }}>
                  <td className="py-2 pr-3 font-mono">•••••-•••••-•••••-•••••-{k.key_last5}</td>
                  <td className="py-2 pr-3">{LICENSE_LABEL[k.license_type]}</td>
                  <td className="py-2 pr-3">{k.product}</td>
                  <td className="py-2 pr-3">
                    {k.activations_used} / {k.activations_total}
                  </td>
                  <td className="py-2 pr-3" style={{ color: k.status === "available" ? emerald : k.status === "revoked" ? rose : dim, fontWeight: 700 }}>
                    {k.status}
                  </td>
                  <td className="py-2 pr-3">{k.purchase_ref ?? "—"}</td>
                  <td className="py-2">
                    {k.status !== "revoked" && (
                      <button className="text-[11px] font-bold" style={{ color: rose }} onClick={() => { const r = prompt("Revoke this key? Reason (e.g. invalid, returned):"); if (r !== null) run("rev", () => post("revoke_key", { keyId: k.id, reason: r })); }}>
                        Revoke
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {keys.length === 0 && (
            <p className="text-xs py-3" style={{ color: dim }}>
              No keys yet. Add the keys from your license purchase.
            </p>
          )}
        </section>
      )}

      {addOpen && <AddKeysModal onClose={() => setAddOpen(false)} onDone={(m) => { setAddOpen(false); setMsg(m); router.refresh(); }} />}
      {tech && <TechModeModal tech={tech} onClose={() => setTech(null)} onStep={(step) => run("st", () => post("set_step", { upgradeId: tech.upgrade.id, step }), () => setTech(null))} />}
    </div>
  );
}

function AddKeysModal({ onClose, onDone }: { onClose: () => void; onDone: (msg: string) => void }) {
  const [type, setType] = useState("csp_perpetual");
  const [text, setText] = useState("");
  const [ref, setRef] = useState("");
  const [mak, setMak] = useState(25);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  async function save() {
    setBusy(true);
    setErr(null);
    try {
      const r = await post("import_keys", { licenseType: type, text, purchaseRef: ref, makActivations: mak });
      onDone(`Added ${r.added.length} key${r.added.length === 1 ? "" : "s"}.${r.duplicates.length ? ` ${r.duplicates.length} already on file.` : ""}${r.invalid.length ? ` ${r.invalid.length} line(s) weren't valid 25-character keys.` : ""}`);
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(22,48,43,0.5)" }} onClick={onClose}>
      <div className="bg-white rounded-2xl p-5 w-full max-w-lg space-y-3" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-sm font-bold">Add license keys</h2>
        <label className="block text-xs font-semibold" style={{ color: dim }}>
          License type
          <select value={type} onChange={(e) => setType(e.target.value)} className="w-full mt-1 rounded-lg px-3 py-2 text-sm" style={{ border: `1px solid ${line}` }}>
            <option value="csp_perpetual">CSP perpetual (full license, one PC each)</option>
            <option value="retail">Retail / FPP (full license, one PC each)</option>
            <option value="oem">OEM (full license, one PC each)</option>
            <option value="mak">Volume MAK (many activations - Pro PCs only, not Home)</option>
          </select>
        </label>
        {type === "mak" && (
          <label className="block text-xs font-semibold" style={{ color: dim }}>
            Activations per MAK key
            <input type="number" min={1} value={mak} onChange={(e) => setMak(Number(e.target.value))} className="w-full mt-1 rounded-lg px-3 py-2 text-sm" style={{ border: `1px solid ${line}` }} />
          </label>
        )}
        <label className="block text-xs font-semibold" style={{ color: dim }}>
          Keys - one per line (optionally <span className="font-mono">KEY, PO-123</span>)
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={7} className="w-full mt-1 rounded-lg px-3 py-2 text-sm font-mono" style={{ border: `1px solid ${line}` }} placeholder="XXXXX-XXXXX-XXXXX-XXXXX-XXXXX" />
        </label>
        <label className="block text-xs font-semibold" style={{ color: dim }}>
          Purchase reference (PO / invoice)
          <input value={ref} onChange={(e) => setRef(e.target.value)} className="w-full mt-1 rounded-lg px-3 py-2 text-sm" style={{ border: `1px solid ${line}` }} />
        </label>
        <p className="text-[11px]" style={{ color: faint }}>
          Keys are encrypted before they're saved. Only the last 5 characters are ever shown in lists; every reveal is logged.
        </p>
        {err && <p className="text-xs" style={{ color: rose }}>{err}</p>}
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="text-sm px-4 py-2 rounded-full" style={{ border: `1px solid ${line}` }}>
            Cancel
          </button>
          <button onClick={save} disabled={busy || !text.trim()} className="text-sm font-bold px-4 py-2 rounded-full text-white disabled:opacity-50" style={{ background: emerald }}>
            {busy ? "Saving…" : "Add keys"}
          </button>
        </div>
      </div>
    </div>
  );
}

function TechModeModal({ tech, onClose, onStep }: { tech: { upgrade: Upgrade; key: string; licenseType: string }; onClose: () => void; onStep: (s: "upgraded" | "joined") => void }) {
  const ps = `# Run in an elevated PowerShell on ${tech.upgrade.device_name ?? "the PC"}
(Get-CimInstance Win32_OperatingSystem).Caption   # confirm current edition
changepk.exe /ProductKey ${tech.key}               # upgrades Home -> Pro, then restarts
# After restart, join ICNA Relief's Entra ID:
start ms-settings:workplace                          # Access work or school -> Connect -> Join this device to Microsoft Entra ID`;
  const [copied, setCopied] = useState<string | null>(null);
  const copy = (t: string, l: string) => navigator.clipboard.writeText(t).then(() => setCopied(l));
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(22,48,43,0.5)" }} onClick={onClose}>
      <div className="bg-white rounded-2xl p-5 w-full max-w-xl space-y-3" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-sm font-bold">Tech mode · {tech.upgrade.device_name}</h2>
        <p className="text-xs" style={{ color: dim }}>
          {tech.upgrade.person} · {LICENSE_LABEL[tech.licenseType]} key. This reveal is logged.
        </p>
        <div className="flex items-center gap-2 p-3 rounded-xl" style={{ background: "#FBF7EF" }}>
          <span className="font-mono text-sm font-bold flex-1 break-all">{tech.key}</span>
          <button onClick={() => copy(tech.key, "key")} className="text-xs font-bold px-3 py-1.5 rounded-full" style={{ border: `1px solid ${line}`, background: "#fff" }}>
            {copied === "key" ? "Copied" : "Copy key"}
          </button>
        </div>
        <ol className="text-xs space-y-1.5 list-decimal pl-5">
          <li>
            On the PC: <b>Settings → System → Activation → Change product key</b>, enter the key, and let it restart. (Or run the PowerShell below as admin.)
          </li>
          <li>
            After restart: <b>Settings → Accounts → Access work or school</b>. If an ICNA account is listed there, <b>Disconnect</b> it first. Then <b>Connect → Join this device to Microsoft Entra ID</b> and sign in with the employee's ICNA account.
          </li>
          <li>Restart, then have the employee sign in to Windows with their ICNA Relief email. Intune enrolls automatically; the portal confirms within about an hour (use Check now).</li>
        </ol>
        <pre className="text-[11px] p-3 rounded-xl overflow-x-auto" style={{ background: ink, color: "#E8F4EE" }}>
          {ps}
        </pre>
        <div className="flex flex-wrap justify-end gap-2">
          <button onClick={() => copy(ps, "ps")} className="text-xs font-bold px-3 py-2 rounded-full" style={{ border: `1px solid ${line}` }}>
            {copied === "ps" ? "Copied" : "Copy PowerShell"}
          </button>
          <button onClick={() => onStep("upgraded")} className="text-xs font-bold px-3 py-2 rounded-full" style={{ border: `1px solid ${line}` }}>
            Mark on Pro
          </button>
          <button onClick={() => onStep("joined")} className="text-xs font-bold px-3 py-2 rounded-full text-white" style={{ background: emerald }}>
            Mark joined
          </button>
        </div>
      </div>
    </div>
  );
}

function StepDots({ steps, status }: { steps: Record<string, string>; status: string }) {
  const items = [
    ["Edition checked", !!steps?.edition_reported_at || status !== "planned"],
    ["Key entered", !!steps?.key_revealed_at || !!steps?.upgraded_at],
    ["On Pro", !!steps?.upgraded_at || ["joined", "complete"].includes(status)],
    ["Joined", !!steps?.joined_at || status === "complete"],
    ["Confirmed", status === "complete"],
  ] as const;
  return (
    <div className="flex flex-wrap gap-2 mt-1.5">
      {items.map(([l, done]) => (
        <span key={l} className="text-[10px] font-semibold inline-flex items-center gap-1" style={{ color: done ? emerald : faint }}>
          <span className="w-2 h-2 rounded-full inline-block" style={{ background: done ? emerald : line }} />
          {l}
        </span>
      ))}
    </div>
  );
}

function EditionPill({ edition }: { edition: string }) {
  const c = edition === "Home" ? rose : edition.startsWith("Unknown") ? gold : ["Enterprise", "Education", "Pro Education", "Enterprise LTSC"].includes(edition) ? emerald : "#3E7C9A";
  return (
    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap" style={{ color: c, background: `${c}14`, border: `1px solid ${c}33` }}>
      {edition}
    </span>
  );
}

function Stat({ label, value, color, note }: { label: string; value: number | string; color?: string; note?: string }) {
  return (
    <div className="p-4" style={card}>
      <div className="text-2xl font-extrabold" style={{ color: color ?? ink }}>
        {value}
      </div>
      <div className="text-[11px] font-semibold" style={{ color: dim }}>
        {label}
      </div>
      {note && (
        <div className="text-[10px] mt-0.5" style={{ color: faint }}>
          {note}
        </div>
      )}
    </div>
  );
}

function Btn({ children, onClick, busy, primary }: { children: React.ReactNode; onClick: () => void; busy?: boolean; primary?: boolean }) {
  return (
    <button onClick={onClick} disabled={busy} className="text-[11px] font-bold px-3 py-1.5 rounded-full disabled:opacity-50" style={primary ? { background: emerald, color: "#fff" } : { border: `1px solid ${line}`, background: "#fff", color: ink }}>
      {busy ? "…" : children}
    </button>
  );
}
