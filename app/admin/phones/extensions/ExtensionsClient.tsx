"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import type { ForwardingProfile, PbxDestination, PbxUser } from "@/lib/threecxAdmin";
import DestPicker, { describeDest, type DestOption } from "../DestPicker";
import { ErrorNote, Pill, btn, btnDanger, btnPrimary, card, emerald, goldBg, goldFg, greenBg, input, ink, muted, rose, roseBg } from "../ui";

type Employee = { id: string; first_name: string; last_name: string; email: string; threecx_extension: string | null };

async function post(body: Record<string, unknown>) {
  const res = await fetch("/api/admin/phones/threecx", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? "3CX request failed.");
  return data;
}

const name = (u: PbxUser) => [u.FirstName, u.LastName].filter(Boolean).join(" ") || u.DisplayName || u.Number;
const STATUSES = ["Available", "Away", "Out of office", "Custom 1", "Custom 2"];

function statusColor(u: PbxUser) {
  if (u.Enabled === false) return "#C9C1AF";
  const p = (u.CurrentProfileName ?? "").toLowerCase();
  if (p.startsWith("available")) return "#22A06B";
  if (p.includes("out of office")) return "#9A3412";
  return "#C99A3D";
}

export default function ExtensionsClient({ users, error, employees, destOptions }: { users: PbxUser[]; error: string | null; employees: Employee[]; destOptions: DestOption[] }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState("all");
  const [selId, setSelId] = useState<number | null>(users[0]?.Id ?? null);
  const [flash, setFlash] = useState<{ ok: boolean; text: string } | null>(null);
  const [creating, setCreating] = useState(false);

  const empByExt = useMemo(() => new Map(employees.filter((e) => e.threecx_extension).map((e) => [e.threecx_extension!, e])), [employees]);

  const shown = users.filter((u) => {
    const s = q.trim().toLowerCase();
    if (s && !(`${u.Number} ${name(u)} ${u.EmailAddress ?? ""} ${u.Mobile ?? ""}`.toLowerCase().includes(s))) return false;
    if (filter === "unlinked") return !empByExt.has(u.Number);
    if (filter === "unregistered") return !u.IsRegistered;
    if (filter === "disabled") return u.Enabled === false;
    return true;
  });
  const sel = users.find((u) => u.Id === selId) ?? null;

  const done = (text: string) => {
    setFlash({ ok: true, text });
    router.refresh();
  };
  const fail = (text: string) => setFlash({ ok: false, text });

  return (
    <div className="flex flex-col gap-4">
      {flash && (
        <div role="status" className="rounded-xl px-4 py-3 text-sm flex justify-between gap-3" style={{ background: flash.ok ? greenBg : roseBg, color: flash.ok ? emerald : rose }}>
          <span style={{ whiteSpace: "pre-wrap" }}>{flash.text}</span>
          <button type="button" onClick={() => setFlash(null)} className="underline text-xs">
            Dismiss
          </button>
        </div>
      )}
      <ErrorNote text={error} />

      <div className="flex flex-wrap gap-2 items-center">
        <input aria-label="Search extensions" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, extension, email or mobile" style={{ ...input, flex: "1 1 260px", width: "auto", borderRadius: 999, minHeight: 44 }} />
        <select aria-label="Filter" value={filter} onChange={(e) => setFilter(e.target.value)} style={{ ...input, width: "auto", borderRadius: 999, minHeight: 44 }}>
          <option value="all">All extensions ({users.length})</option>
          <option value="unlinked">Not linked to a portal employee</option>
          <option value="unregistered">No phone registered</option>
          <option value="disabled">Disabled</option>
        </select>
        <button type="button" onClick={() => setCreating(true)} style={{ ...btnPrimary, minHeight: 44 }}>
          New extension
        </button>
      </div>

      {creating && <NewExtension onClose={() => setCreating(false)} onDone={(m) => { setCreating(false); done(m); }} onError={fail} />}

      <div className="flex flex-wrap gap-5 items-start">
        <section aria-label="Extensions" className="rounded-3xl overflow-x-auto" style={{ ...card, flex: "999 1 560px", minWidth: 0 }}>
          <table className="w-full text-sm" style={{ minWidth: 720, borderCollapse: "collapse" }}>
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide" style={{ color: muted }}>
                <th className="py-3 px-4 font-bold">Ext</th>
                <th className="py-3 px-2 font-bold">Name</th>
                <th className="py-3 px-2 font-bold">Status</th>
                <th className="py-3 px-2 font-bold">Phone</th>
                <th className="py-3 px-2 font-bold">Portal</th>
                <th className="py-3 px-4 font-bold">If no answer</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((u) => {
                const avail = u.ForwardingProfiles?.find((p) => p.Name === "Available");
                const linked = empByExt.get(u.Number);
                return (
                  <tr key={u.Id} onClick={() => setSelId(u.Id)} className="cursor-pointer" style={{ borderTop: "1px solid rgba(22,48,43,0.08)", background: u.Id === selId ? "#F2F8F5" : undefined, opacity: u.Enabled === false ? 0.6 : 1 }}>
                    <td className="py-2.5 px-4" style={{ fontFamily: "'IBM Plex Mono', monospace" }}>
                      {u.Number}
                    </td>
                    <th scope="row" className="py-2.5 px-2 text-left">
                      <button type="button" onClick={() => setSelId(u.Id)} className="font-bold text-left" style={{ color: ink }}>
                        {name(u)}
                      </button>
                      {u.EmailAddress && <span className="block text-xs font-normal" style={{ color: muted }}>{u.EmailAddress}</span>}
                    </th>
                    <td className="py-2.5 px-2">
                      <span className="inline-flex items-center gap-1.5 text-[13px]">
                        <span aria-hidden className="w-2 h-2 rounded-full" style={{ background: statusColor(u) }} />
                        {u.Enabled === false ? "Disabled" : u.CurrentProfileName || "—"}
                      </span>
                    </td>
                    <td className="py-2.5 px-2 text-[13px]" style={{ color: u.IsRegistered ? muted : rose }}>
                      {u.IsRegistered ? (u.Phones?.[0]?.Name || u.Phones?.[0]?.TemplateName || "Registered") : "Not registered"}
                    </td>
                    <td className="py-2.5 px-2">{linked ? <Pill fg={emerald} bg={greenBg}>Linked</Pill> : <Pill fg={goldFg} bg={goldBg}>Not linked</Pill>}</td>
                    <td className="py-2.5 px-4 text-[13px]" style={{ color: muted }}>
                      {describeDest(avail?.AvailableRoute?.NoAnswerExternal, destOptions)}
                    </td>
                  </tr>
                );
              })}
              {shown.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-6 text-center" style={{ color: muted }}>
                    No extensions match.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </section>

        {sel && (
          <Editor
            key={sel.Id}
            u={sel}
            employees={employees}
            linked={empByExt.get(sel.Number) ?? null}
            destOptions={destOptions}
            onDone={done}
            onError={fail}
          />
        )}
      </div>
    </div>
  );
}

function Editor({ u, employees, linked, destOptions, onDone, onError }: { u: PbxUser; employees: Employee[]; linked: Employee | null; destOptions: DestOption[]; onDone: (m: string) => void; onError: (m: string) => void }) {
  const [form, setForm] = useState({
    FirstName: u.FirstName ?? "",
    LastName: u.LastName ?? "",
    EmailAddress: u.EmailAddress ?? "",
    Mobile: u.Mobile ?? "",
    OutboundCallerID: u.OutboundCallerID ?? "",
    Enabled: u.Enabled !== false,
    VMEnabled: u.VMEnabled !== false,
    RecordCalls: !!u.RecordCalls,
  });
  const avail = u.ForwardingProfiles?.find((p) => p.Name === "Available");
  const away = u.ForwardingProfiles?.find((p) => p.Name === "Away");
  const ooo = u.ForwardingProfiles?.find((p) => p.Name === "Out of office");
  const [noAnswer, setNoAnswer] = useState<PbxDestination | undefined>(avail?.AvailableRoute?.NoAnswerExternal);
  const [busyDest, setBusyDest] = useState<PbxDestination | undefined>(avail?.AvailableRoute?.BusyExternal);
  const [timeout, setTimeoutSec] = useState(String(avail?.NoAnswerTimeout ?? 20));
  const [awayDest, setAwayDest] = useState<PbxDestination | undefined>(away?.AwayRoute?.External);
  const [oooDest, setOooDest] = useState<PbxDestination | undefined>(ooo?.AwayRoute?.External);
  const [empId, setEmpId] = useState(linked?.id ?? "");
  const [busy, setBusy] = useState<string | null>(null);

  async function run(key: string, body: Record<string, unknown>, ok: string | ((d: Record<string, unknown>) => string)) {
    setBusy(key);
    try {
      const d = await post(body);
      onDone(typeof ok === "function" ? ok(d) : ok);
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  const profiles: Partial<ForwardingProfile>[] = [];
  if (avail) profiles.push({ Id: avail.Id, Name: avail.Name, NoAnswerTimeout: Number(timeout) || 20, AvailableRoute: { NoAnswerExternal: noAnswer, BusyExternal: busyDest } });
  if (away) profiles.push({ Id: away.Id, Name: away.Name, AwayRoute: { External: awayDest } });
  if (ooo) profiles.push({ Id: ooo.Id, Name: ooo.Name, AwayRoute: { External: oooDest } });

  const row = "grid grid-cols-[110px_minmax(0,1fr)] gap-2 items-center text-sm";

  return (
    <aside aria-label={`Extension ${u.Number}`} className="rounded-3xl p-5 flex flex-col gap-4" style={{ ...card, flex: "1 1 380px" }}>
      <div className="flex items-center gap-3">
        <span aria-hidden className="w-11 h-11 rounded-full flex items-center justify-center font-bold" style={{ background: greenBg, color: emerald }}>
          {(u.FirstName?.[0] ?? "") + (u.LastName?.[0] ?? "") || u.Number.slice(-2)}
        </span>
        <div>
          <h2 className="text-lg font-bold m-0">{name(u)}</h2>
          <div className="text-[13px]" style={{ color: muted }}>
            Extension {u.Number} · queues: {u.QueueStatus === "LoggedIn" ? "logged in" : "logged out"}
          </div>
        </div>
      </div>

      <div>
        <div className="text-[13px] font-bold mb-2">Status</div>
        <div role="group" aria-label="Status" className="flex flex-wrap gap-1.5">
          {STATUSES.map((st) => {
            const on = u.CurrentProfileName === st;
            return (
              <button
                key={st}
                type="button"
                aria-pressed={on}
                disabled={busy === "status"}
                onClick={() => run("status", { action: "update_user", id: u.Id, number: u.Number, patch: { CurrentProfileName: st } }, `${name(u)} set to ${st}.`)}
                style={{ ...btn, minHeight: 34, background: on ? emerald : "#fff", color: on ? "#fff" : ink, borderColor: on ? emerald : undefined }}
              >
                {st}
              </button>
            );
          })}
        </div>
        <p className="text-xs mt-1.5 mb-0" style={{ color: muted }}>
          Some 3CX V20 builds don&apos;t allow changing status by API; if so you&apos;ll see the error here.
        </p>
      </div>

      <div className={row}>
        <label htmlFor="x-fn" style={{ color: muted }}>First name</label>
        <input id="x-fn" value={form.FirstName} onChange={(e) => setForm({ ...form, FirstName: e.target.value })} style={input} />
        <label htmlFor="x-ln" style={{ color: muted }}>Last name</label>
        <input id="x-ln" value={form.LastName} onChange={(e) => setForm({ ...form, LastName: e.target.value })} style={input} />
        <label htmlFor="x-em" style={{ color: muted }}>Email</label>
        <input id="x-em" value={form.EmailAddress} onChange={(e) => setForm({ ...form, EmailAddress: e.target.value })} style={input} />
        <label htmlFor="x-mob" style={{ color: muted }}>Mobile</label>
        <input id="x-mob" value={form.Mobile} onChange={(e) => setForm({ ...form, Mobile: e.target.value })} style={input} />
        <label htmlFor="x-cid" style={{ color: muted }}>Caller ID out</label>
        <input id="x-cid" value={form.OutboundCallerID} onChange={(e) => setForm({ ...form, OutboundCallerID: e.target.value })} placeholder="Number shown on outside calls" style={input} />
      </div>
      <div className="flex flex-wrap gap-4 text-sm">
        {(
          [
            ["Enabled", "Extension enabled"],
            ["VMEnabled", "Voicemail"],
            ["RecordCalls", "Record calls"],
          ] as const
        ).map(([k, l]) => (
          <label key={k} className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={form[k]} onChange={(e) => setForm({ ...form, [k]: e.target.checked })} style={{ width: 18, height: 18, accentColor: emerald }} />
            {l}
          </label>
        ))}
      </div>

      <div className="flex flex-col gap-2.5 pt-3" style={{ borderTop: "1px solid rgba(22,48,43,0.08)" }}>
        <div className="text-[13px] font-bold">Forwarding</div>
        {avail ? (
          <>
            <div className="text-xs" style={{ color: muted }}>
              When available and not answered after{" "}
              <input aria-label="Seconds before forwarding" value={timeout} onChange={(e) => setTimeoutSec(e.target.value.replace(/\D/g, ""))} style={{ ...input, width: 56, minHeight: 30, display: "inline-block", padding: "0 6px" }} /> seconds
            </div>
            <DestPicker id="fw-na" label="No answer" value={noAnswer} onChange={setNoAnswer} options={destOptions} />
            <div className="text-xs" style={{ color: muted }}>When busy</div>
            <DestPicker id="fw-busy" label="Busy" value={busyDest} onChange={setBusyDest} options={destOptions} />
          </>
        ) : (
          <p className="text-xs m-0" style={{ color: muted }}>No Available profile found on this extension.</p>
        )}
        {away && (
          <>
            <div className="text-xs" style={{ color: muted }}>When set to Away</div>
            <DestPicker id="fw-away" label="Away" value={awayDest} onChange={setAwayDest} options={destOptions} />
          </>
        )}
        {ooo && (
          <>
            <div className="text-xs" style={{ color: muted }}>When Out of office</div>
            <DestPicker id="fw-ooo" label="Out of office" value={oooDest} onChange={setOooDest} options={destOptions} />
          </>
        )}
        <p className="text-xs m-0" style={{ color: muted }}>Applies to outside and internal callers alike.</p>
      </div>

      <button
        type="button"
        disabled={busy === "save"}
        onClick={() => run("save", { action: "update_user", id: u.Id, number: u.Number, patch: { ...form, ForwardingProfiles: profiles } }, `Saved extension ${u.Number} in 3CX.`)}
        style={{ ...btnPrimary, minHeight: 46 }}
      >
        {busy === "save" ? "Saving…" : "Save to 3CX"}
      </button>

      <div className="flex flex-col gap-2 pt-3" style={{ borderTop: "1px solid rgba(22,48,43,0.08)" }}>
        <div className="text-[13px] font-bold">Phones</div>
        {(u.Phones ?? []).map((p) => (
          <div key={p.Id} className="flex justify-between gap-2 rounded-xl px-3 py-2 text-[13px]" style={{ background: "#FBF7EF" }}>
            <span>{p.Name || p.TemplateName || "Phone"}</span>
            <span style={{ fontFamily: "'IBM Plex Mono', monospace", color: muted }}>{p.MacAddress || p.Interface || ""}</span>
          </div>
        ))}
        {(u.Phones ?? []).length === 0 && <span className="text-[13px]" style={{ color: muted }}>No desk phones provisioned (apps and web client aren&apos;t listed here).</span>}
        <div className="text-[13px]" style={{ color: u.IsRegistered ? emerald : rose }}>{u.IsRegistered ? "Registered right now" : "Nothing registered right now"}</div>
      </div>

      <div className="flex flex-col gap-2 pt-3" style={{ borderTop: "1px solid rgba(22,48,43,0.08)" }}>
        <label htmlFor="x-emp" className="text-[13px] font-bold">
          Portal employee
        </label>
        <div className="flex gap-2">
          <select id="x-emp" value={empId} onChange={(e) => setEmpId(e.target.value)} style={input}>
            <option value="">Not linked</option>
            {employees.map((e) => (
              <option key={e.id} value={e.id}>
                {e.first_name} {e.last_name}
                {e.threecx_extension && e.threecx_extension !== u.Number ? ` (has ${e.threecx_extension})` : ""}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={busy === "link" || empId === (linked?.id ?? "")}
            onClick={() => run("link", { action: "link_employee", extension: u.Number, employeeId: empId || null }, empId ? "Linked. Click-to-call and SMS in the portal will use this extension." : "Unlinked.")}
            style={btn}
          >
            Save
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 pt-3" style={{ borderTop: "1px solid rgba(22,48,43,0.08)" }}>
        <button
          type="button"
          disabled={busy === "pin"}
          onClick={() => window.confirm(`Reset the voicemail PIN for ${name(u)}?`) && run("pin", { action: "reset_vm_pin", id: u.Id, number: u.Number }, (d) => `New voicemail PIN for ${name(u)}: ${d.pin}\nGive it to them now; it isn't shown again.`)}
          style={btn}
        >
          Reset voicemail PIN
        </button>
        <button type="button" disabled={busy === "welcome"} onClick={() => run("welcome", { action: "welcome_email", id: u.Id, number: u.Number }, `Welcome email sent to ${u.EmailAddress || name(u)}.`)} style={btn}>
          Send welcome email
        </button>
        {u.Enabled !== false && (
          <button
            type="button"
            disabled={busy === "disable"}
            onClick={() => window.confirm(`Disable extension ${u.Number} (${name(u)})? Calls to it will stop ringing.`) && run("disable", { action: "update_user", id: u.Id, number: u.Number, patch: { Enabled: false } }, `Extension ${u.Number} disabled.`)}
            style={btnDanger}
          >
            Disable extension
          </button>
        )}
      </div>
    </aside>
  );
}

function NewExtension({ onClose, onDone, onError }: { onClose: () => void; onDone: (m: string) => void; onError: (m: string) => void }) {
  const [f, setF] = useState({ FirstName: "", LastName: "", EmailAddress: "", Mobile: "", Number: "" });
  const [busy, setBusy] = useState(false);
  async function create() {
    setBusy(true);
    try {
      const d = await post({ action: "create_user", ...f });
      onDone(`Created extension ${d.user?.Number ?? ""} for ${f.FirstName} ${f.LastName}. Send them the welcome email from their panel.`);
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section aria-label="New extension" className="rounded-3xl p-5 flex flex-col gap-3" style={card}>
      <div className="flex justify-between items-center">
        <h2 className="text-base font-bold m-0">New extension</h2>
        <button type="button" onClick={onClose} style={btn}>
          Cancel
        </button>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2">
        <input aria-label="First name" placeholder="First name" value={f.FirstName} onChange={(e) => setF({ ...f, FirstName: e.target.value })} style={input} />
        <input aria-label="Last name" placeholder="Last name" value={f.LastName} onChange={(e) => setF({ ...f, LastName: e.target.value })} style={input} />
        <input aria-label="Email" placeholder="Work email" value={f.EmailAddress} onChange={(e) => setF({ ...f, EmailAddress: e.target.value })} style={input} />
        <input aria-label="Mobile" placeholder="Mobile (optional)" value={f.Mobile} onChange={(e) => setF({ ...f, Mobile: e.target.value })} style={input} />
        <input aria-label="Extension number" placeholder="Ext (blank = next free)" value={f.Number} onChange={(e) => setF({ ...f, Number: e.target.value })} style={input} />
      </div>
      <button type="button" disabled={busy} onClick={create} style={{ ...btnPrimary, alignSelf: "flex-start", minHeight: 44 }}>
        {busy ? "Creating…" : "Create in 3CX"}
      </button>
    </section>
  );
}
