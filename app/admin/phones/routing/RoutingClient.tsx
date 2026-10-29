"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import type { Holiday, Member, OfficeHours, PbxDestination, Queue, Receptionist, ReceptionistForward, RingGroup } from "@/lib/threecxAdmin";
import DestPicker, { type DestOption } from "../DestPicker";
import { ErrorNote, btn, btnDanger, btnPrimary, card, emerald, greenBg, input, ink, muted, rose, roseBg } from "../ui";

type Sel = { kind: "queue" | "group" | "menu"; id: number } | { kind: "hours" };

async function post(body: Record<string, unknown>) {
  const res = await fetch("/api/admin/phones/threecx", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? "3CX request failed.");
  return data;
}

const POLLING: [string, string][] = [
  ["RingAll", "Ring all at once"],
  ["LongestWaiting", "Longest waiting agent"],
  ["NextAgent", "Round robin"],
  ["Hunt", "In order (hunt)"],
  ["HuntRandomStart", "In order, random start"],
  ["LeastTalkTime", "Least talk time"],
  ["FewestAnswered", "Fewest answered"],
  ["HuntBy3s", "In order, 3 at a time"],
  ["First3Available", "First 3 available"],
];
const RING: [string, string][] = [
  ["RingAll", "Ring all at once"],
  ["Hunt", "In order (hunt)"],
  ["Paging", "Paging"],
];
const IVR_TYPES: [string, string][] = [
  ["Extension", "Extension"],
  ["Queue", "Queue"],
  ["RingGroup", "Ring group"],
  ["IVR", "Another menu"],
  ["VoiceMail", "Voicemail"],
  ["CallByName", "Dial by name"],
  ["RepeatPrompt", "Repeat the greeting"],
  ["EndCall", "Hang up"],
];
const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

export default function RoutingClient({
  queues,
  groups,
  menus,
  users,
  hours,
  holidays,
  errors,
}: {
  queues: Queue[];
  groups: RingGroup[];
  menus: Receptionist[];
  users: { Number: string; Name: string }[];
  hours: OfficeHours | null;
  holidays: Holiday[];
  errors: Record<string, string | null>;
}) {
  const router = useRouter();
  const [sel, setSel] = useState<Sel>(queues[0] ? { kind: "queue", id: queues[0].Id } : groups[0] ? { kind: "group", id: groups[0].Id } : { kind: "hours" });
  const [flash, setFlash] = useState<{ ok: boolean; text: string } | null>(null);

  const options: DestOption[] = useMemo(
    () => [
      ...users.map((u) => ({ number: u.Number, label: u.Name, kind: "Extension" as const })),
      ...queues.map((q) => ({ number: q.Number, label: q.Name, kind: "Queue" as const })),
      ...groups.map((g) => ({ number: g.Number, label: g.Name, kind: "RingGroup" as const })),
      ...menus.map((m) => ({ number: m.Number, label: m.Name, kind: "IVR" as const })),
    ],
    [users, queues, groups, menus]
  );

  const done = (text: string) => {
    setFlash({ ok: true, text });
    router.refresh();
  };
  const fail = (text: string) => setFlash({ ok: false, text });

  const navItem = (key: string, label: string, number: string | null, on: boolean, onClick: () => void) => (
    <button
      key={key}
      type="button"
      onClick={onClick}
      aria-current={on ? "true" : undefined}
      className="flex items-center justify-between gap-2 w-full rounded-xl px-2.5 text-left text-sm"
      style={{ minHeight: 42, background: on ? emerald : "transparent", color: on ? "#fff" : ink, fontWeight: on ? 700 : 500 }}
    >
      <span className="truncate">{label}</span>
      {number && <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 12, opacity: 0.8 }}>{number}</span>}
    </button>
  );

  const groupHead = (t: string) => (
    <div className="text-xs font-bold uppercase tracking-wider px-2 pt-2 pb-1" style={{ color: muted }}>
      {t}
    </div>
  );

  const curQueue = sel.kind === "queue" ? queues.find((q) => q.Id === sel.id) : undefined;
  const curGroup = sel.kind === "group" ? groups.find((g) => g.Id === sel.id) : undefined;
  const curMenu = sel.kind === "menu" ? menus.find((m) => m.Id === sel.id) : undefined;

  return (
    <div className="flex flex-col gap-4">
      {flash && (
        <div role="status" className="rounded-xl px-4 py-3 text-sm flex justify-between gap-3" style={{ background: flash.ok ? greenBg : roseBg, color: flash.ok ? emerald : rose }}>
          {flash.text}
          <button type="button" onClick={() => setFlash(null)} className="underline text-xs">
            Dismiss
          </button>
        </div>
      )}
      {Object.values(errors).filter(Boolean).map((e, i) => (
        <ErrorNote key={i} text={e} />
      ))}

      <div className="flex flex-wrap gap-5 items-start">
        <nav aria-label="Routing" className="rounded-3xl p-3 flex flex-col gap-0.5" style={{ ...card, flex: "1 1 240px", maxWidth: 320 }}>
          {groupHead("Queues")}
          {queues.map((q) => navItem(`q${q.Id}`, q.Name, q.Number, sel.kind === "queue" && sel.id === q.Id, () => setSel({ kind: "queue", id: q.Id })))}
          {queues.length === 0 && <span className="text-xs px-2" style={{ color: muted }}>None</span>}
          {groupHead("Ring groups")}
          {groups.map((g) => navItem(`g${g.Id}`, g.Name, g.Number, sel.kind === "group" && sel.id === g.Id, () => setSel({ kind: "group", id: g.Id })))}
          {groups.length === 0 && <span className="text-xs px-2" style={{ color: muted }}>None</span>}
          {groupHead("Menus")}
          {menus.map((m) => navItem(`m${m.Id}`, m.Name, m.Number, sel.kind === "menu" && sel.id === m.Id, () => setSel({ kind: "menu", id: m.Id })))}
          {menus.length === 0 && <span className="text-xs px-2" style={{ color: muted }}>None</span>}
          {groupHead("Schedule")}
          {navItem("hours", "Office hours & holidays", null, sel.kind === "hours", () => setSel({ kind: "hours" }))}
        </nav>

        <div style={{ flex: "999 1 520px", minWidth: 0 }}>
          {curQueue && <QueueEditor key={`q${curQueue.Id}`} q={curQueue} users={users} options={options} onDone={done} onError={fail} />}
          {curGroup && <GroupEditor key={`g${curGroup.Id}`} g={curGroup} users={users} options={options} onDone={done} onError={fail} />}
          {curMenu && <MenuEditor key={`m${curMenu.Id}`} m={curMenu} options={options} onDone={done} onError={fail} />}
          {sel.kind === "hours" && <HoursEditor hours={hours} holidays={holidays} onDone={done} onError={fail} />}
        </div>
      </div>
    </div>
  );
}

function Panel({ kind, title, number, children }: { kind: string; title: string; number?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-3xl p-5 flex flex-col gap-5" style={card}>
      <div>
        <div className="text-xs font-bold uppercase tracking-wider" style={{ color: "#2C5F7A" }}>
          {kind}
        </div>
        <h2 className="text-xl font-bold m-0 mt-0.5">
          {title} {number && <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 15, fontWeight: 400, color: muted }}>{number}</span>}
        </h2>
      </div>
      {children}
    </section>
  );
}

function Field({ label, id, children }: { label: string; id: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-[13px] font-bold">
        {label}
      </label>
      {children}
    </div>
  );
}

function MembersEditor({ members, setMembers, users }: { members: Member[]; setMembers: (m: Member[]) => void; users: { Number: string; Name: string }[] }) {
  const [add, setAdd] = useState("");
  const nameOf = (n: string) => users.find((u) => u.Number === n)?.Name;
  const move = (i: number, d: number) => {
    const next = [...members];
    const j = i + d;
    if (j < 0 || j >= next.length) return;
    [next[i], next[j]] = [next[j], next[i]];
    setMembers(next);
  };
  return (
    <div className="flex flex-col gap-2">
      <div className="text-[13px] font-bold">Members ({members.length})</div>
      {members.map((m, i) => (
        <div key={`${m.Number}-${i}`} className="flex items-center gap-2 rounded-xl px-3 py-1.5 text-sm" style={{ background: "#FBF7EF" }}>
          <span className="flex-1 min-w-0 truncate">
            {m.Name || nameOf(m.Number) || "Extension"} <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 12, color: muted }}>{m.Number}</span>
          </span>
          <button type="button" aria-label="Move up" onClick={() => move(i, -1)} disabled={i === 0} style={{ ...btn, minHeight: 30, padding: "0 8px" }}>
            ↑
          </button>
          <button type="button" aria-label="Move down" onClick={() => move(i, 1)} disabled={i === members.length - 1} style={{ ...btn, minHeight: 30, padding: "0 8px" }}>
            ↓
          </button>
          <button type="button" aria-label={`Remove ${m.Number}`} onClick={() => setMembers(members.filter((_, k) => k !== i))} style={{ ...btn, minHeight: 30, padding: "0 10px", color: rose }}>
            Remove
          </button>
        </div>
      ))}
      <div className="flex gap-2">
        <select aria-label="Add member" value={add} onChange={(e) => setAdd(e.target.value)} style={input}>
          <option value="">Add an extension…</option>
          {users
            .filter((u) => !members.some((m) => m.Number === u.Number))
            .map((u) => (
              <option key={u.Number} value={u.Number}>
                {u.Number} · {u.Name}
              </option>
            ))}
        </select>
        <button
          type="button"
          disabled={!add}
          onClick={() => {
            setMembers([...members, { Number: add, Name: users.find((u) => u.Number === add)?.Name }]);
            setAdd("");
          }}
          style={btn}
        >
          Add
        </button>
      </div>
    </div>
  );
}

function SaveBar({ busy, onSave }: { busy: boolean; onSave: () => void }) {
  return (
    <div className="flex justify-end gap-2 pt-4" style={{ borderTop: "1px solid rgba(22,48,43,0.08)" }}>
      <button type="button" disabled={busy} onClick={onSave} style={{ ...btnPrimary, minHeight: 44, padding: "0 22px" }}>
        {busy ? "Saving…" : "Save to 3CX"}
      </button>
    </div>
  );
}

function QueueEditor({ q, users, options, onDone, onError }: { q: Queue; users: { Number: string; Name: string }[]; options: DestOption[]; onDone: (m: string) => void; onError: (m: string) => void }) {
  const [name, setName] = useState(q.Name);
  const [strategy, setStrategy] = useState(q.PollingStrategy ?? "RingAll");
  const [ring, setRing] = useState(String(q.RingTimeout ?? 20));
  const [master, setMaster] = useState(String(q.MasterTimeout ?? 300));
  const [maxCallers, setMaxCallers] = useState(String(q.MaxCallersInQueue ?? 10));
  const [fna, setFna] = useState<PbxDestination | undefined>(q.ForwardNoAnswer);
  const [agents, setAgents] = useState<Member[]>(q.Agents ?? []);
  const [busy, setBusy] = useState(false);
  async function save() {
    setBusy(true);
    try {
      await post({
        action: "update_queue",
        id: q.Id,
        number: q.Number,
        patch: { Name: name, PollingStrategy: strategy, RingTimeout: ring, MasterTimeout: master, MaxCallersInQueue: maxCallers, ForwardNoAnswer: fna, Agents: agents },
      });
      onDone(`Saved queue ${q.Number}.`);
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Panel kind="Queue" title={q.Name} number={q.Number}>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Field label="Name" id="qe-name">
          <input id="qe-name" value={name} onChange={(e) => setName(e.target.value)} style={input} />
        </Field>
        <Field label="How it rings" id="qe-strat">
          <select id="qe-strat" value={strategy} onChange={(e) => setStrategy(e.target.value)} style={input}>
            {POLLING.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
            {!POLLING.some(([v]) => v === strategy) && <option value={strategy}>{strategy}</option>}
          </select>
        </Field>
        <Field label="Ring each agent for (seconds)" id="qe-ring">
          <input id="qe-ring" inputMode="numeric" value={ring} onChange={(e) => setRing(e.target.value.replace(/\D/g, ""))} style={input} />
        </Field>
        <Field label="Max wait in queue (seconds)" id="qe-master">
          <input id="qe-master" inputMode="numeric" value={master} onChange={(e) => setMaster(e.target.value.replace(/\D/g, ""))} style={input} />
        </Field>
        <Field label="Max callers waiting" id="qe-max">
          <input id="qe-max" inputMode="numeric" value={maxCallers} onChange={(e) => setMaxCallers(e.target.value.replace(/\D/g, ""))} style={input} />
        </Field>
      </div>
      <Field label="After max wait, send to" id="qe-fna">
        <DestPicker id="qe-fna" label="After max wait" value={fna} onChange={setFna} options={options} />
      </Field>
      <MembersEditor members={agents} setMembers={setAgents} users={users} />
      <SaveBar busy={busy} onSave={save} />
    </Panel>
  );
}

function GroupEditor({ g, users, options, onDone, onError }: { g: RingGroup; users: { Number: string; Name: string }[]; options: DestOption[]; onDone: (m: string) => void; onError: (m: string) => void }) {
  const [name, setName] = useState(g.Name);
  const [strategy, setStrategy] = useState(g.RingStrategy ?? "RingAll");
  const [ringTime, setRingTime] = useState(String(g.RingTime ?? 20));
  const [fna, setFna] = useState<PbxDestination | undefined>(g.ForwardNoAnswer);
  const [members, setMembers] = useState<Member[]>(g.Members ?? []);
  const [busy, setBusy] = useState(false);
  async function save() {
    setBusy(true);
    try {
      await post({ action: "update_ring_group", id: g.Id, number: g.Number, patch: { Name: name, RingStrategy: strategy, RingTime: ringTime, ForwardNoAnswer: fna, Members: members } });
      onDone(`Saved ring group ${g.Number}.`);
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Panel kind="Ring group" title={g.Name} number={g.Number}>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Field label="Name" id="ge-name">
          <input id="ge-name" value={name} onChange={(e) => setName(e.target.value)} style={input} />
        </Field>
        <Field label="How it rings" id="ge-strat">
          <select id="ge-strat" value={strategy} onChange={(e) => setStrategy(e.target.value)} style={input}>
            {RING.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Ring for (seconds)" id="ge-time">
          <input id="ge-time" inputMode="numeric" value={ringTime} onChange={(e) => setRingTime(e.target.value.replace(/\D/g, ""))} style={input} />
        </Field>
      </div>
      <Field label="If nobody answers, send to" id="ge-fna">
        <DestPicker id="ge-fna" label="If nobody answers" value={fna} onChange={setFna} options={options} />
      </Field>
      <MembersEditor members={members} setMembers={setMembers} users={users} />
      <SaveBar busy={busy} onSave={save} />
    </Panel>
  );
}

function MenuEditor({ m, options, onDone, onError }: { m: Receptionist; options: DestOption[]; onDone: (msg: string) => void; onError: (msg: string) => void }) {
  const [name, setName] = useState(m.Name);
  const [timeout, setTimeoutSec] = useState(String(m.Timeout ?? 10));
  const [timeoutType, setTimeoutType] = useState(m.TimeoutForwardType ?? "VoiceMail");
  const [timeoutDn, setTimeoutDn] = useState(m.TimeoutForwardDN ?? "");
  const [forwards, setForwards] = useState<ReceptionistForward[]>(m.Forwards ?? []);
  const [busy, setBusy] = useState(false);
  const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0", "*", "#"];
  const needsDn = (t: string) => ["Extension", "Queue", "RingGroup", "IVR", "VoiceMail"].includes(t);
  const kindFor = (t: string): DestOption["kind"] | null => (t === "Extension" || t === "VoiceMail" ? "Extension" : t === "Queue" ? "Queue" : t === "RingGroup" ? "RingGroup" : t === "IVR" ? "IVR" : null);

  const setFwd = (input: string, patch: Partial<ReceptionistForward> | null) => {
    setForwards((fs) => {
      const rest = fs.filter((f) => f.Input !== input);
      if (!patch) return rest;
      const cur = fs.find((f) => f.Input === input) ?? { Input: input, ForwardType: "Extension", ForwardDN: "" };
      return [...rest, { ...cur, ...patch }].sort((a, b) => keys.indexOf(a.Input) - keys.indexOf(b.Input));
    });
  };

  async function save() {
    setBusy(true);
    try {
      await post({ action: "update_receptionist", id: m.Id, number: m.Number, patch: { Name: name, Timeout: timeout, TimeoutForwardType: timeoutType, TimeoutForwardDN: timeoutDn, Forwards: forwards } });
      onDone(`Saved menu ${m.Number}.`);
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const dnSelect = (type: string, value: string, onChange: (v: string) => void, label: string) => {
    const k = kindFor(type);
    if (!k || !needsDn(type)) return <span />;
    return (
      <select aria-label={label} value={value} onChange={(e) => onChange(e.target.value)} style={input}>
        <option value="">Choose…</option>
        {options
          .filter((o) => o.kind === k)
          .map((o) => (
            <option key={o.number} value={o.number}>
              {o.number} · {o.label}
            </option>
          ))}
        {value && !options.some((o) => o.number === value) && <option value={value}>{value}</option>}
      </select>
    );
  };

  return (
    <Panel kind="Menu (digital receptionist)" title={m.Name} number={m.Number}>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Field label="Name" id="me-name">
          <input id="me-name" value={name} onChange={(e) => setName(e.target.value)} style={input} />
        </Field>
        <Field label="Greeting" id="me-prompt">
          <input id="me-prompt" value={m.PromptFilename ?? "—"} readOnly style={{ ...input, background: "#FBF7EF" }} />
        </Field>
      </div>
      <div className="flex flex-col gap-2">
        <div className="text-[13px] font-bold">When the caller presses</div>
        {keys.map((k) => {
          const f = forwards.find((x) => x.Input === k);
          return (
            <div key={k} className="grid gap-2 items-center" style={{ gridTemplateColumns: "48px minmax(0,1fr) minmax(0,1.2fr)" }}>
              <span className="h-10 rounded-xl flex items-center justify-center" style={{ background: f ? greenBg : "#F3F0E8", color: f ? emerald : muted, fontFamily: "'IBM Plex Mono', monospace" }}>
                {k}
              </span>
              <select aria-label={`Key ${k} action`} value={f?.ForwardType ?? ""} onChange={(e) => setFwd(k, e.target.value ? { ForwardType: e.target.value, ForwardDN: "" } : null)} style={input}>
                <option value="">Not used</option>
                {IVR_TYPES.map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
              {f ? dnSelect(f.ForwardType, f.ForwardDN ?? "", (v) => setFwd(k, { ForwardDN: v }), `Key ${k} destination`) : <span />}
            </div>
          );
        })}
      </div>
      <div className="grid gap-2 items-end" style={{ gridTemplateColumns: "120px minmax(0,1fr) minmax(0,1.2fr)" }}>
        <Field label="No key after (s)" id="me-to">
          <input id="me-to" inputMode="numeric" value={timeout} onChange={(e) => setTimeoutSec(e.target.value.replace(/\D/g, ""))} style={input} />
        </Field>
        <Field label="Then" id="me-tt">
          <select id="me-tt" value={timeoutType} onChange={(e) => { setTimeoutType(e.target.value); setTimeoutDn(""); }} style={input}>
            {IVR_TYPES.filter(([v]) => v !== "RepeatPrompt" && v !== "CallByName").map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </Field>
        {dnSelect(timeoutType, timeoutDn, setTimeoutDn, "Timeout destination")}
      </div>
      <p className="text-xs m-0" style={{ color: muted }}>
        Greeting recordings are changed in 3CX (it has no upload API); everything else here saves straight to 3CX.
      </p>
      <SaveBar busy={busy} onSave={save} />
    </Panel>
  );
}

function HoursEditor({ hours, holidays, onDone, onError }: { hours: OfficeHours | null; holidays: Holiday[]; onDone: (m: string) => void; onError: (m: string) => void }) {
  const initial = useMemo(() => {
    const m: Record<string, { open: boolean; start: string; stop: string }> = {};
    for (const d of DAYS) m[d] = { open: false, start: "09:00", stop: "17:00" };
    for (const p of hours?.Hours?.Periods ?? []) {
      m[p.DayOfWeek] = { open: true, start: p.Start.slice(0, 5), stop: p.Stop.slice(0, 5) };
    }
    return m;
  }, [hours]);
  const [days, setDays] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [hol, setHol] = useState({ name: "", date: "", endDate: "", recurring: false });

  async function saveHours() {
    setBusy(true);
    try {
      const periods = DAYS.filter((d) => days[d].open).map((d) => ({ DayOfWeek: d, Start: days[d].start, Stop: days[d].stop }));
      await post({ action: "update_office_hours", periods });
      onDone("Office hours saved in 3CX.");
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function addHoliday() {
    setBusy(true);
    try {
      await post({ action: "add_holiday", name: hol.name, date: hol.date, endDate: hol.endDate || hol.date, recurring: hol.recurring });
      setHol({ name: "", date: "", endDate: "", recurring: false });
      onDone(`Holiday "${hol.name}" added.`);
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function removeHoliday(h: Holiday) {
    if (!window.confirm(`Delete the holiday "${h.Name}"?`)) return;
    setBusy(true);
    try {
      await post({ action: "delete_holiday", id: h.Id });
      onDone(`Holiday "${h.Name}" deleted.`);
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const fmt = (h: Holiday) => {
    const s = new Date(h.Year || 2000, h.Month - 1, h.Day).toLocaleDateString("en-US", { month: "short", day: "numeric", ...(h.IsRecurrent ? {} : { year: "numeric" }) });
    const sameDay = (h.DayEnd ?? h.Day) === h.Day && (h.MonthEnd ?? h.Month) === h.Month;
    const e = sameDay ? "" : ` – ${new Date(h.YearEnd || h.Year || 2000, (h.MonthEnd ?? h.Month) - 1, h.DayEnd ?? h.Day).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
    return `${s}${e}${h.IsRecurrent ? " (every year)" : ""}`;
  };

  return (
    <Panel kind="Schedule" title="Office hours & holidays">
      <div className="flex flex-col gap-2">
        <div className="text-[13px] font-bold">System office hours{hours?.TimeZoneId ? ` · ${hours.TimeZoneId}` : ""}</div>
        {DAYS.map((d) => {
          const v = days[d];
          return (
            <div key={d} className="grid items-center gap-2" style={{ gridTemplateColumns: "130px 90px minmax(0,1fr) minmax(0,1fr)" }}>
              <span className="text-sm font-semibold">{d}</span>
              <label className="flex items-center gap-1.5 text-sm cursor-pointer">
                <input type="checkbox" checked={v.open} onChange={(e) => setDays({ ...days, [d]: { ...v, open: e.target.checked } })} style={{ width: 18, height: 18, accentColor: emerald }} />
                Open
              </label>
              <input aria-label={`${d} opens`} type="time" disabled={!v.open} value={v.start} onChange={(e) => setDays({ ...days, [d]: { ...v, start: e.target.value } })} style={{ ...input, opacity: v.open ? 1 : 0.5 }} />
              <input aria-label={`${d} closes`} type="time" disabled={!v.open} value={v.stop} onChange={(e) => setDays({ ...days, [d]: { ...v, stop: e.target.value } })} style={{ ...input, opacity: v.open ? 1 : 0.5 }} />
            </div>
          );
        })}
        <p className="text-xs m-0" style={{ color: muted }}>
          These are the system-wide hours. Departments with their own hours keep them.
        </p>
        <div className="flex justify-end">
          <button type="button" disabled={busy} onClick={saveHours} style={{ ...btnPrimary, minHeight: 44 }}>
            Save hours
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-2 pt-4" style={{ borderTop: "1px solid rgba(22,48,43,0.08)" }}>
        <div className="text-[13px] font-bold">Holidays (closed)</div>
        {holidays.length === 0 && <span className="text-sm" style={{ color: muted }}>None set.</span>}
        {holidays.map((h) => (
          <div key={h.Id} className="flex items-center justify-between gap-2 rounded-xl px-3 py-2 text-sm" style={{ background: "#FBF7EF" }}>
            <span>
              <strong>{h.Name}</strong> <span style={{ color: muted }}>{fmt(h)}</span>
            </span>
            <button type="button" disabled={busy} onClick={() => removeHoliday(h)} style={{ ...btnDanger, minHeight: 32 }}>
              Delete
            </button>
          </div>
        ))}
        <div className="grid gap-2 items-end mt-1" style={{ gridTemplateColumns: "minmax(0,1.4fr) minmax(0,1fr) minmax(0,1fr) auto auto" }}>
          <input aria-label="Holiday name" placeholder="Holiday name" value={hol.name} onChange={(e) => setHol({ ...hol, name: e.target.value })} style={input} />
          <input aria-label="Start date" type="date" value={hol.date} onChange={(e) => setHol({ ...hol, date: e.target.value })} style={input} />
          <input aria-label="End date" type="date" value={hol.endDate} min={hol.date || undefined} onChange={(e) => setHol({ ...hol, endDate: e.target.value })} style={input} />
          <label className="flex items-center gap-1.5 text-xs cursor-pointer">
            <input type="checkbox" checked={hol.recurring} onChange={(e) => setHol({ ...hol, recurring: e.target.checked })} style={{ accentColor: emerald }} />
            Yearly
          </label>
          <button type="button" disabled={busy || !hol.name || !hol.date} onClick={addHoliday} style={btn}>
            Add
          </button>
        </div>
      </div>
    </Panel>
  );
}
