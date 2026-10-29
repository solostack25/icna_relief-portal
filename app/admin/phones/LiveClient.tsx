"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ActiveCall, CcParticipant, Queue, SystemStatus, Trunk } from "@/lib/threecxAdmin";
import { ErrorNote, Pill, SectionTitle, Stat, btn, btnDanger, btnPrimary, card, emerald, fmtDuration, goldFg, greenBg, input, ink, muted, rose, roseBg } from "./ui";

type LiteUser = { Id: number; Number: string; FirstName?: string; LastName?: string; QueueStatus?: string; CurrentProfileName?: string; IsRegistered?: boolean };

type Live = {
  calls: ActiveCall[];
  participants: CcParticipant[];
  status: SystemStatus | null;
  queues: Queue[];
  users: LiteUser[];
  errors: Record<string, string | null>;
  at: string;
};

const POLL_MS = 4000;

async function post(body: Record<string, unknown>) {
  const res = await fetch("/api/admin/phones/threecx", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? "3CX request failed.");
  return data;
}

/** "1000 John Doe" -> "1000" when the string starts with an extension. */
function leadNumber(s: string) {
  const m = /^(\d{2,6})\b/.exec(s.trim());
  return m ? m[1] : null;
}

function elapsed(c: ActiveCall, now: number, serverSkew: number) {
  const start = new Date(c.EstablishedAt).getTime();
  return fmtDuration((now + serverSkew - start) / 1000);
}

export default function LiveClient({ trunks, trunksError, ringGroups }: { trunks: Trunk[]; trunksError: string | null; ringGroups: { Number: string; Name: string }[] }) {
  const [live, setLive] = useState<Live | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [paused, setPaused] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [transferFor, setTransferFor] = useState<number | null>(null);
  const [dest, setDest] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [flash, setFlash] = useState<{ ok: boolean; text: string } | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/phones/threecx?view=live", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Couldn't reach 3CX.");
      setLive(data);
      setFetchError(null);
    } catch (e) {
      setFetchError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    load();
    if (paused) return;
    timer.current = setInterval(() => {
      if (document.visibilityState === "visible") load();
    }, POLL_MS);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [load, paused]);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // 3CX's clock vs ours, so "talking for" timers are right.
  const serverSkew = useMemo(() => {
    const sn = live?.calls[0]?.ServerNow;
    return sn && live ? new Date(sn).getTime() - new Date(live.at).getTime() : 0;
  }, [live]);

  const calls = live?.calls ?? [];
  const queues = live?.queues ?? [];
  const users = live?.users ?? [];
  const userByNumber = useMemo(() => new Map(users.map((u) => [u.Number, u])), [users]);
  const queueNumbers = new Set(queues.map((q) => q.Number));

  // Calls whose callee is a queue and aren't talking yet = waiting.
  const waitingFor = (q: string) => calls.filter((c) => leadNumber(c.Callee) === q && !/talk|connected/i.test(c.Status)).length;
  const totalWaiting = calls.filter((c) => queueNumbers.has(leadNumber(c.Callee) ?? "") && !/talk|connected/i.test(c.Status)).length;
  const longestWait = calls
    .filter((c) => queueNumbers.has(leadNumber(c.Callee) ?? "") && !/talk|connected/i.test(c.Status))
    .reduce((m, c) => Math.max(m, now + serverSkew - new Date(c.EstablishedAt).getTime()), 0);
  const agentsIn = users.filter((u) => u.QueueStatus === "LoggedIn").length;

  // A call can be transferred only through a Call Control participant on
  // an extension the API client monitors.
  const participantFor = (c: ActiveCall) => {
    const nums = [leadNumber(c.Caller), leadNumber(c.Callee)].filter(Boolean);
    return (live?.participants ?? []).find((p) => p.dn && nums.includes(p.dn));
  };

  async function act(key: string, body: Record<string, unknown>, okText: string) {
    setBusy(key);
    try {
      await post(body);
      setFlash({ ok: true, text: okText });
      await load();
    } catch (e) {
      setFlash({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(null);
    }
  }

  const s = live?.status;
  const destOptions = [
    ...users.map((u) => ({ v: u.Number, l: `${u.Number} · ${[u.FirstName, u.LastName].filter(Boolean).join(" ")}` })),
    ...queues.map((q) => ({ v: q.Number, l: `${q.Number} · ${q.Name} (queue)` })),
    ...ringGroups.map((g) => ({ v: g.Number, l: `${g.Number} · ${g.Name} (ring group)` })),
  ];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          {s ? (
            <>
              <Pill fg={s.HasNotRunningServices ? rose : emerald} bg={s.HasNotRunningServices ? roseBg : greenBg}>
                {s.HasNotRunningServices ? "Some 3CX services aren't running" : "3CX healthy"}
              </Pill>
              <span style={{ color: muted }}>
                V{s.Version} · {s.FQDN} · {s.ProductCode}
                {s.LicenseActive === false && <strong style={{ color: rose }}> · license inactive</strong>}
              </span>
            </>
          ) : (
            <span style={{ color: muted }}>Connecting to 3CX…</span>
          )}
        </div>
        <div className="flex items-center gap-2 text-xs" style={{ color: muted }}>
          {live && `Updated ${new Date(live.at).toLocaleTimeString()}`}
          <button type="button" onClick={() => setPaused((p) => !p)} style={btn}>
            {paused ? "Resume live" : "Pause"}
          </button>
        </div>
      </div>

      {flash && (
        <div role="status" className="rounded-xl px-4 py-3 text-sm flex justify-between gap-3" style={{ background: flash.ok ? greenBg : roseBg, color: flash.ok ? emerald : rose }}>
          {flash.text}
          <button type="button" onClick={() => setFlash(null)} className="underline text-xs">
            Dismiss
          </button>
        </div>
      )}
      <ErrorNote text={fetchError} />
      <ErrorNote text={live?.errors?.status} />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat dark n={s?.CallsActive ?? calls.length} label={s?.MaxSimCalls ? `Active calls (of ${s.MaxSimCalls})` : "Active calls"} />
        <Stat n={totalWaiting} label="Waiting in queues" color={totalWaiting ? rose : ink} />
        <Stat n={agentsIn} label="Agents logged in" />
        <Stat n={longestWait ? fmtDuration(longestWait / 1000) : "—"} label="Longest wait" color={longestWait > 120_000 ? rose : ink} />
      </div>

      <div className="flex flex-wrap gap-5 items-start">
        {/* Calls */}
        <section className="rounded-3xl p-5" style={{ ...card, flex: "999 1 560px", minWidth: 0 }}>
          <SectionTitle>Calls right now</SectionTitle>
          <ErrorNote text={live?.errors?.calls} />
          {live?.errors?.participants && (
            <p className="text-xs mt-0 mb-3" style={{ color: goldFg }}>
              Transfer isn&apos;t available: {live.errors.participants}
            </p>
          )}
          {calls.length === 0 && !live?.errors?.calls && (
            <p className="text-sm m-0 py-6 text-center" style={{ color: muted }}>
              No calls in progress.
            </p>
          )}
          <div className="flex flex-col gap-2.5">
            {calls.map((c) => {
              const toQueue = queueNumbers.has(leadNumber(c.Callee) ?? "");
              const waiting = toQueue && !/talk|connected/i.test(c.Status);
              const p = participantFor(c);
              const ringing = p ? /ring/i.test(p.status ?? "") : false;
              return (
                <article key={c.Id} className="rounded-2xl px-4 py-3 flex flex-col gap-2.5" style={{ border: `1px solid ${waiting ? "#F1C9B8" : "rgba(22,48,43,0.12)"}`, background: waiting ? "#FFF8F4" : "#fff" }}>
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="min-w-0" style={{ flex: "1 1 260px" }}>
                      <div className="text-[15px] font-bold" style={{ color: ink }}>
                        {c.Caller} <span style={{ color: muted, fontWeight: 400 }}>→</span> {c.Callee}
                      </div>
                      <div className="text-xs" style={{ color: muted }}>
                        Started {new Date(c.EstablishedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                      </div>
                    </div>
                    <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 15 }}>{elapsed(c, now, serverSkew)}</span>
                    <Pill fg={waiting ? rose : emerald} bg={waiting ? roseBg : greenBg}>
                      {c.Status}
                    </Pill>
                  </div>
                  <div className="flex flex-wrap gap-2 items-center">
                    <button
                      type="button"
                      disabled={!p}
                      title={p ? undefined : "Only calls on extensions the 3CX API client monitors can be transferred"}
                      onClick={() => {
                        setTransferFor(transferFor === c.Id ? null : c.Id);
                        setDest("");
                      }}
                      style={{ ...btn, opacity: p ? 1 : 0.45 }}
                    >
                      Transfer
                    </button>
                    <button
                      type="button"
                      disabled={busy === `drop${c.Id}`}
                      onClick={() => window.confirm(`Hang up the call between ${c.Caller} and ${c.Callee}?`) && act(`drop${c.Id}`, { action: "drop_call", id: c.Id }, "Call ended.")}
                      style={{ ...btnDanger, marginLeft: "auto" }}
                    >
                      Hang up
                    </button>
                  </div>
                  {transferFor === c.Id && p && (
                    <div className="flex flex-wrap gap-2 items-center rounded-xl px-3 py-2.5" style={{ background: "#FBF7EF" }}>
                      <label htmlFor={`tx-${c.Id}`} className="text-sm font-semibold">
                        Transfer {p.party_caller_name || p.party_caller_id || "caller"} to
                      </label>
                      <input id={`tx-${c.Id}`} list={`txl-${c.Id}`} value={dest} onChange={(e) => setDest(e.target.value)} placeholder="Extension, queue or number" style={{ ...input, width: 260 }} />
                      <datalist id={`txl-${c.Id}`}>
                        {destOptions.map((o) => (
                          <option key={o.v} value={o.v}>
                            {o.l}
                          </option>
                        ))}
                      </datalist>
                      <button
                        type="button"
                        disabled={!dest || busy === `tx${c.Id}`}
                        onClick={() =>
                          act(`tx${c.Id}`, { action: "transfer", dn: p.dn, participantId: p.id, destination: dest.split(" ")[0], ringing }, `Transferred to ${dest.split(" ")[0]}.`).then(() =>
                            setTransferFor(null)
                          )
                        }
                        style={btnPrimary}
                      >
                        Transfer now
                      </button>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
          <p className="text-xs mt-4 mb-0" style={{ color: muted }}>
            Listen, whisper and barge-in aren&apos;t offered: 3CX doesn&apos;t expose them through its API (use the 3CX web client Panel for those).
          </p>
        </section>

        {/* Queues */}
        <section className="flex flex-col gap-3" style={{ flex: "1 1 330px" }}>
          <SectionTitle>Queues</SectionTitle>
          <ErrorNote text={live?.errors?.queues} />
          {queues.map((q) => {
            const w = waitingFor(q.Number);
            return (
              <article key={q.Id} className="rounded-2xl px-4 py-3.5 flex flex-col gap-2.5" style={card}>
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <div className="text-[15px] font-bold">{q.Name}</div>
                    <div className="text-xs" style={{ color: muted }}>
                      Queue {q.Number} · {q.PollingStrategy ?? ""}
                    </div>
                  </div>
                  <Pill fg={w ? rose : emerald} bg={w ? roseBg : greenBg}>
                    {w} waiting
                  </Pill>
                </div>
                <div className="flex flex-col gap-1.5">
                  {(q.Agents ?? []).map((a) => {
                    const u = userByNumber.get(a.Number);
                    const inQ = u?.QueueStatus === "LoggedIn";
                    const onCall = calls.some((c) => leadNumber(c.Caller) === a.Number || leadNumber(c.Callee) === a.Number);
                    return (
                      <div key={a.Number} className="flex items-center justify-between gap-2 text-sm">
                        <span className="flex items-center gap-2 min-w-0">
                          <span aria-hidden className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: !inQ ? "#C9C1AF" : onCall ? "#C99A3D" : "#22A06B" }} />
                          <span className="truncate">{a.Name || a.Number}</span>
                          <span className="text-xs" style={{ color: muted }}>
                            {!inQ ? "logged out" : onCall ? "on a call" : "available"}
                          </span>
                        </span>
                        {u && (
                          <button
                            type="button"
                            disabled={busy === `q${u.Id}`}
                            onClick={() => act(`q${u.Id}`, { action: "queue_status", userId: u.Id, loggedIn: !inQ }, `${a.Name || a.Number} logged ${inQ ? "out of" : "in to"} all queues.`)}
                            style={{ ...btn, minHeight: 32, fontSize: 12 }}
                          >
                            {inQ ? "Log out" : "Log in"}
                          </button>
                        )}
                      </div>
                    );
                  })}
                  {(q.Agents ?? []).length === 0 && <span className="text-sm" style={{ color: muted }}>No agents.</span>}
                </div>
              </article>
            );
          })}
          <p className="text-xs m-0" style={{ color: muted }}>
            3CX logs agents in or out of all their queues at once; per-queue login isn&apos;t in its API. &quot;Waiting&quot; counts calls to a queue that aren&apos;t talking yet.
          </p>
        </section>
      </div>

      {/* Trunks */}
      <section className="rounded-3xl p-5" style={card}>
        <SectionTitle>Trunks</SectionTitle>
        <ErrorNote text={trunksError} />
        <div className="flex flex-col gap-2">
          {trunks.map((t) => (
            <div key={t.Id} className="flex flex-wrap items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm" style={{ background: "#FBF7EF" }}>
              <span className="font-bold">{t.Gateway?.Name || `Trunk ${t.Number}`}</span>
              <span style={{ fontFamily: "'IBM Plex Mono', monospace", color: muted }}>{t.Gateway?.Host}</span>
              <span style={{ color: muted }}>
                {t.DidNumbers?.length ?? 0} DIDs · {t.SimultaneousCalls ?? "?"} channels
              </span>
              {t.ConfigurationIssue && <span style={{ color: rose }}>{t.ConfigurationIssue}</span>}
              <span className="ml-auto">{t.IsOnline ? <Pill fg={emerald} bg={greenBg}>Online</Pill> : <Pill fg={rose} bg={roseBg}>Offline</Pill>}</span>
            </div>
          ))}
          {trunks.length === 0 && !trunksError && <p className="text-sm m-0" style={{ color: muted }}>No trunks.</p>}
          {s && (
            <p className="text-xs m-0 mt-1" style={{ color: muted }}>
              {s.TrunksRegistered}/{s.TrunksTotal} trunks registered · {s.ExtensionsRegistered}/{s.ExtensionsTotal} extensions registered
              {s.RecordingQuotaReached && <strong style={{ color: rose }}> · recording quota reached</strong>}
              {s.LastBackupDateTime && ` · last backup ${new Date(s.LastBackupDateTime).toLocaleDateString()}`}
            </p>
          )}
        </div>
      </section>
      <span className="sr-only" aria-live="polite">
        {totalWaiting > 0 ? `${totalWaiting} callers waiting` : ""}
      </span>
    </div>
  );
}
