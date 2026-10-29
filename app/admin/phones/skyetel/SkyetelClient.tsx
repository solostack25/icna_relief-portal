"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import type { IpHealth, SkyEndpoint, SkyNumber, SkyReceipt } from "@/lib/skyetelAdmin";
import { ErrorNote, Pill, SectionTitle, Stat, btn, btnPrimary, card, emerald, fmtPhone, goldBg, goldFg, greenBg, input, ink, muted, rose, roseBg } from "../ui";

type Props =
  | { notConnected: true }
  | {
      notConnected?: false;
      numbers: SkyNumber[];
      endpoints: SkyEndpoint[];
      health: IpHealth[];
      balance: { balance: number | null; credit: boolean };
      totals: Record<string, number | string> | null;
      traffic: { date: string; inbound_minutes: number; outbound_minutes: number; total_billing_cost: number | string }[];
      receipts: SkyReceipt[];
      errors: Record<string, string | null>;
    };

async function call(body: Record<string, unknown>) {
  const res = await fetch("/api/admin/phones/skyetel", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? "Skyetel request failed.");
  return data;
}

const label = (k: string) => k.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

export default function SkyetelClient(props: Props) {
  if (props.notConnected) {
    return (
      <div className="rounded-2xl p-6" style={card}>
        <h2 className="text-lg font-bold m-0 mb-1">Skyetel isn&apos;t connected</h2>
        <p className="text-sm m-0" style={{ color: muted }}>
          Add the Skyetel API SID and secret under{" "}
          <Link href="/admin/connectors" className="underline" style={{ color: emerald }}>
            Admin › Connectors
          </Link>{" "}
          (the same keys used for SMS).
        </p>
      </div>
    );
  }
  return <Connected {...props} />;
}

function Connected({ numbers, endpoints, health, balance, totals, traffic, receipts: initialReceipts, errors }: Exclude<Props, { notConnected: true }>) {
  const router = useRouter();
  const [selId, setSelId] = useState<number | null>(numbers[0]?.id ?? null);
  const [query, setQuery] = useState("");
  const [receipts, setReceipts] = useState(initialReceipts);
  const [receiptFilter, setReceiptFilter] = useState("");
  const [flash, setFlash] = useState<{ ok: boolean; text: string } | null>(null);

  const groups = useMemo(() => {
    const m = new Map<number, string>();
    for (const e of endpoints) if (e.endpoint_group) m.set(e.endpoint_group.id, e.endpoint_group.name);
    for (const n of numbers) if (n.endpoint_group) m.set(n.endpoint_group.id, n.endpoint_group.name);
    return Array.from(m, ([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [endpoints, numbers]);

  const shown = numbers.filter((n) => {
    if (!query.trim()) return true;
    const q = query.toLowerCase().replace(/[()\-\s]/g, "");
    return n.number.includes(q) || (n.note ?? "").toLowerCase().includes(query.toLowerCase()) || (n.endpoint_group?.name ?? "").toLowerCase().includes(query.toLowerCase());
  });
  const sel = numbers.find((n) => n.id === selId) ?? null;
  const smsOn = numbers.filter((n) => n.message_enabled).length;
  const e911Missing = numbers.filter((n) => !n.e911_enabled).length;
  const maxMin = Math.max(1, ...traffic.map((t) => Number(t.inbound_minutes || 0) + Number(t.outbound_minutes || 0)));

  async function refreshReceipts() {
    try {
      const r = await call({ action: "sms_receipts", number: receiptFilter || undefined });
      setReceipts(r.receipts);
    } catch (e) {
      setFlash({ ok: false, text: (e as Error).message });
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {flash && (
        <div role="status" className="rounded-xl px-4 py-3 text-sm flex justify-between gap-3" style={{ background: flash.ok ? greenBg : roseBg, color: flash.ok ? emerald : rose }}>
          {flash.text}
          <button type="button" onClick={() => setFlash(null)} className="underline text-xs">
            Dismiss
          </button>
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat dark n={balance.balance != null ? `$${balance.balance.toFixed(2)}` : "—"} label={balance.credit ? "Balance (credit account)" : "Account balance"} />
        <Stat n={numbers.length} label="Phone numbers" />
        <Stat n={smsOn} label="Numbers with SMS on" />
        <Stat n={e911Missing} label="Numbers without E911" color={e911Missing ? rose : ink} />
      </div>
      <ErrorNote text={errors.balance} />

      {/* Usage */}
      <section className="rounded-3xl p-5" style={card}>
        <SectionTitle>Last 30 days</SectionTitle>
        <ErrorNote text={errors.traffic} />
        {traffic.length > 0 && (
          <div className="flex items-end gap-1 h-28 mb-2" role="img" aria-label="Call minutes per day, last 30 days">
            {traffic.map((t) => {
              const m = Number(t.inbound_minutes || 0) + Number(t.outbound_minutes || 0);
              return (
                <div key={t.date} className="flex-1 rounded-t" title={`${t.date}: ${Math.round(m)} min`} style={{ height: `${Math.max(2, (m / maxMin) * 100)}%`, background: emerald, opacity: 0.85 }} />
              );
            })}
          </div>
        )}
        <div className="text-xs" style={{ color: muted }}>
          Call minutes per day (inbound + outbound).
        </div>
        {totals && (
          <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-2 text-sm">
            {Object.entries(totals)
              .filter(([, v]) => v !== null && v !== "" && typeof v !== "object")
              .slice(0, 12)
              .map(([k, v]) => (
                <div key={k} className="flex justify-between gap-3" style={{ borderBottom: "1px solid rgba(22,48,43,0.06)", padding: "4px 0" }}>
                  <span style={{ color: muted }}>{label(k)}</span>
                  <span style={{ fontFamily: "'IBM Plex Mono', monospace" }}>{String(v)}</span>
                </div>
              ))}
          </div>
        )}
        <ErrorNote text={errors.statement} />
      </section>

      {/* Numbers */}
      <section>
        <SectionTitle
          right={
            <input aria-label="Search numbers" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search number, note, route" style={{ ...input, width: 260, borderRadius: 999 }} />
          }
        >
          Numbers
        </SectionTitle>
        <ErrorNote text={errors.numbers} />
        <div className="flex flex-wrap gap-5 items-start">
          <div className="rounded-3xl overflow-x-auto" style={{ ...card, flex: "999 1 560px", minWidth: 0 }}>
            <table className="w-full text-sm" style={{ minWidth: 680, borderCollapse: "collapse" }}>
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide" style={{ color: muted }}>
                  <th className="py-3 px-4 font-bold">Number</th>
                  <th className="py-3 px-2 font-bold">Routes to</th>
                  <th className="py-3 px-2 font-bold">SMS</th>
                  <th className="py-3 px-2 font-bold">Caller ID</th>
                  <th className="py-3 px-4 font-bold">E911</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((n) => (
                  <tr key={n.id} onClick={() => setSelId(n.id)} className="cursor-pointer" style={{ borderTop: "1px solid rgba(22,48,43,0.08)", background: n.id === selId ? "#F2F8F5" : undefined }}>
                    <th scope="row" className="py-2.5 px-4 text-left">
                      <button type="button" onClick={() => setSelId(n.id)} className="font-bold" style={{ color: ink }}>
                        {fmtPhone(n.number)}
                      </button>
                      {n.note && <span className="block text-xs font-normal" style={{ color: muted }}>{n.note}</span>}
                    </th>
                    <td className="py-2.5 px-2">{n.endpoint_group?.name ?? (n.forward ? `Forward ${fmtPhone(n.forward)}` : <span style={{ color: rose }}>Not routed</span>)}</td>
                    <td className="py-2.5 px-2">{n.message_enabled ? <Pill fg={emerald} bg={greenBg}>On</Pill> : <span style={{ color: muted }}>Off</span>}</td>
                    <td className="py-2.5 px-2">{n.cnam_enabled ? n.lidb?.cnam_text || "On" : <span style={{ color: muted }}>Off</span>}</td>
                    <td className="py-2.5 px-4">{n.e911_enabled ? <Pill fg={emerald} bg={greenBg}>Set</Pill> : <Pill fg={rose} bg={roseBg}>Missing</Pill>}</td>
                  </tr>
                ))}
                {shown.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-6 text-center" style={{ color: muted }}>
                      No numbers match.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          {sel && <NumberEditor key={sel.id} n={sel} groups={groups} onSaved={(msg) => { setFlash({ ok: true, text: msg }); router.refresh(); }} onError={(msg) => setFlash({ ok: false, text: msg })} />}
        </div>
      </section>

      {/* Endpoints */}
      <section className="rounded-3xl p-5" style={card}>
        <SectionTitle>Endpoints (where calls are sent)</SectionTitle>
        <ErrorNote text={errors.endpoints} />
        <div className="flex flex-col gap-2">
          {endpoints.map((e) => {
            const h = health.find((x) => x.ip === e.ip);
            const alert = h && (h.alert === true || h.alert === "true" || h.alert === 1 as unknown);
            return (
              <div key={e.id} className="flex flex-wrap items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm" style={{ background: "#FBF7EF" }}>
                <span className="font-bold">{e.description || e.ip}</span>
                <span style={{ fontFamily: "'IBM Plex Mono', monospace", color: muted }}>
                  {e.ip}:{e.port ?? 5060} {e.transport ?? "UDP"}
                </span>
                <span style={{ color: muted }}>Group: {e.endpoint_group?.name ?? "—"} · priority {e.priority ?? "—"}</span>
                <span className="ml-auto">{h ? alert ? <Pill fg={rose} bg={roseBg}>Alert</Pill> : <Pill fg={emerald} bg={greenBg}>Healthy</Pill> : <Pill fg={goldFg} bg={goldBg}>Not monitored</Pill>}</span>
              </div>
            );
          })}
          {endpoints.length === 0 && !errors.endpoints && <p className="text-sm m-0" style={{ color: muted }}>No endpoints.</p>}
        </div>
      </section>

      {/* SMS receipts */}
      <section className="rounded-3xl p-5" style={card}>
        <SectionTitle
          right={
            <div className="flex gap-2">
              <input aria-label="Filter by number" value={receiptFilter} onChange={(e) => setReceiptFilter(e.target.value)} placeholder="To number (optional)" style={{ ...input, width: 200, borderRadius: 999 }} />
              <button type="button" onClick={refreshReceipts} style={btn}>
                Refresh
              </button>
            </div>
          }
        >
          SMS delivery receipts
        </SectionTitle>
        <ErrorNote text={errors.receipts} />
        <p className="text-xs mt-0 mb-3" style={{ color: muted }}>
          Skyetel keeps delivery status only, not message text. &quot;Delivered&quot; means handed to the carrier.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm" style={{ minWidth: 640, borderCollapse: "collapse" }}>
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide" style={{ color: muted }}>
                <th className="py-2 px-2 font-bold">Time</th>
                <th className="py-2 px-2 font-bold">From</th>
                <th className="py-2 px-2 font-bold">To</th>
                <th className="py-2 px-2 font-bold">Status</th>
                <th className="py-2 px-2 font-bold text-right">Segments</th>
                <th className="py-2 px-2 font-bold text-right">Cost</th>
              </tr>
            </thead>
            <tbody>
              {receipts.map((r) => (
                <tr key={r.id} style={{ borderTop: "1px solid rgba(22,48,43,0.08)" }}>
                  <td className="py-2 px-2 whitespace-nowrap">{new Date(r.time).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</td>
                  <td className="py-2 px-2">{fmtPhone(r.from_phonenumber)}</td>
                  <td className="py-2 px-2">{fmtPhone(r.to_phonenumber)}</td>
                  <td className="py-2 px-2">
                    {r.flag_delivered ? <Pill fg={emerald} bg={greenBg}>Delivered</Pill> : <Pill fg={goldFg} bg={goldBg}>{r.delivery_state || "Pending"}</Pill>}
                    {r.flag_attachment && <span className="ml-1.5 text-xs" style={{ color: muted }}>MMS</span>}
                  </td>
                  <td className="py-2 px-2 text-right">{r.segment_count ?? "—"}</td>
                  <td className="py-2 px-2 text-right" style={{ fontFamily: "'IBM Plex Mono', monospace" }}>{r.cost != null ? `$${Number(r.cost).toFixed(4)}` : "—"}</td>
                </tr>
              ))}
              {receipts.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-5 text-center" style={{ color: muted }}>
                    No receipts.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <BuyNumbers onOrdered={(msg) => { setFlash({ ok: true, text: msg }); router.refresh(); }} onError={(msg) => setFlash({ ok: false, text: msg })} />
    </div>
  );
}

function NumberEditor({ n, groups, onSaved, onError }: { n: SkyNumber; groups: { id: number; name: string }[]; onSaved: (m: string) => void; onError: (m: string) => void }) {
  const [note, setNote] = useState(n.note ?? "");
  const [group, setGroup] = useState(n.endpoint_group?.id ? String(n.endpoint_group.id) : "");
  const [forward, setForward] = useState(n.forward ?? "");
  const [failover, setFailover] = useState(n.failover ?? "");
  const [sms, setSms] = useState(!!n.message_enabled);
  const [spam, setSpam] = useState(!!n.spamblock_enabled);
  const [cnamOn, setCnamOn] = useState(!!n.cnam_enabled);
  const [cnam, setCnam] = useState(n.lidb?.cnam_text ?? "");
  const a = n.e911_address;
  const [addr, setAddr] = useState({
    caller_name: a?.caller_name ?? "ICNA Relief",
    address1: a?.address1 ?? "",
    address2: a?.address2 ?? "",
    community: a?.community ?? "",
    state: a?.state ?? "",
    postal_code: a?.postal_code ?? "",
  });
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    try {
      await call({
        action: "update_number",
        id: n.id,
        number: n.number,
        fields: { note, endpoint_group_id: group, forward, failover, message_enabled: sms, spamblock_enabled: spam, cnam_enabled: cnamOn, ...(cnamOn ? { cnam_text: cnam } : {}) },
      });
      onSaved(`Saved ${fmtPhone(n.number)} in Skyetel.`);
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function saveE911() {
    setBusy(true);
    try {
      await call({ action: "set_e911", id: n.id, number: n.number, address: addr, hadAddress: !!a });
      onSaved(`E911 address saved for ${fmtPhone(n.number)}.`);
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const row = "grid grid-cols-[110px_minmax(0,1fr)] gap-2 items-center text-sm";

  return (
    <aside aria-label={`Edit ${fmtPhone(n.number)}`} className="rounded-3xl p-5 flex flex-col gap-4" style={{ ...card, flex: "1 1 340px" }}>
      <div>
        <h3 className="text-lg font-bold m-0">{fmtPhone(n.number)}</h3>
        {n.pending_port_out && <Pill fg={rose} bg={roseBg}>Port-out pending</Pill>}
      </div>
      <div className={row}>
        <label htmlFor="sk-note" style={{ color: muted }}>Note</label>
        <input id="sk-note" value={note} onChange={(e) => setNote(e.target.value)} style={input} />
        <label htmlFor="sk-group" style={{ color: muted }}>Route to</label>
        <select id="sk-group" value={group} onChange={(e) => setGroup(e.target.value)} style={input}>
          <option value="">— none —</option>
          {groups.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </select>
        <label htmlFor="sk-fwd" style={{ color: muted }}>Forward to</label>
        <input id="sk-fwd" value={forward} onChange={(e) => setForward(e.target.value)} placeholder="Optional number" style={input} />
        <label htmlFor="sk-fo" style={{ color: muted }}>If PBX down</label>
        <input id="sk-fo" value={failover} onChange={(e) => setFailover(e.target.value)} placeholder="Failover number" style={input} />
      </div>
      <div className="flex flex-col gap-2 text-sm">
        <Toggle label="SMS / MMS" on={sms} set={setSms} />
        <Toggle label="Spam call blocking" on={spam} set={setSpam} />
        <Toggle label="Caller ID name (CNAM)" on={cnamOn} set={setCnamOn} />
        {cnamOn && <input aria-label="Caller ID name" maxLength={15} value={cnam} onChange={(e) => setCnam(e.target.value)} placeholder="ICNA RELIEF (15 chars max)" style={input} />}
      </div>
      <button type="button" disabled={busy} onClick={save} style={{ ...btnPrimary, minHeight: 44 }}>
        {busy ? "Saving…" : "Save number"}
      </button>

      <div className="flex flex-col gap-2 pt-4" style={{ borderTop: "1px solid rgba(22,48,43,0.08)" }}>
        <div className="flex items-center justify-between">
          <span className="text-sm font-bold">E911 address</span>
          {n.e911_enabled ? <Pill fg={emerald} bg={greenBg}>Active</Pill> : <Pill fg={rose} bg={roseBg}>Not set</Pill>}
        </div>
        <input aria-label="Caller name" value={addr.caller_name} onChange={(e) => setAddr({ ...addr, caller_name: e.target.value })} placeholder="Caller name" style={input} />
        <input aria-label="Street" value={addr.address1} onChange={(e) => setAddr({ ...addr, address1: e.target.value })} placeholder="Street address" style={input} />
        <input aria-label="Suite" value={addr.address2} onChange={(e) => setAddr({ ...addr, address2: e.target.value })} placeholder="Suite / floor (optional)" style={input} />
        <div className="grid grid-cols-[minmax(0,1fr)_64px_90px] gap-2">
          <input aria-label="City" value={addr.community} onChange={(e) => setAddr({ ...addr, community: e.target.value })} placeholder="City" style={input} />
          <input aria-label="State" maxLength={2} value={addr.state} onChange={(e) => setAddr({ ...addr, state: e.target.value.toUpperCase() })} placeholder="TX" style={input} />
          <input aria-label="ZIP" maxLength={5} value={addr.postal_code} onChange={(e) => setAddr({ ...addr, postal_code: e.target.value })} placeholder="ZIP" style={input} />
        </div>
        <button type="button" disabled={busy} onClick={saveE911} style={btn}>
          Save E911 address
        </button>
      </div>
    </aside>
  );
}

function Toggle({ label: text, on, set }: { label: string; on: boolean; set: (v: boolean) => void }) {
  return (
    <label className="flex items-center justify-between gap-3 cursor-pointer" style={{ minHeight: 36 }}>
      <span>{text}</span>
      <input type="checkbox" checked={on} onChange={(e) => set(e.target.checked)} style={{ width: 20, height: 20, accentColor: emerald }} />
    </label>
  );
}

function BuyNumbers({ onOrdered, onError }: { onOrdered: (m: string) => void; onError: (m: string) => void }) {
  const [npa, setNpa] = useState("");
  const [state, setState] = useState("");
  const [tollFree, setTollFree] = useState(false);
  const [results, setResults] = useState<string[] | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  async function search() {
    setBusy(true);
    setPicked([]);
    try {
      const r = await call({ action: "search", npa, state, tollFree, quantity: 15 });
      setResults(r.results);
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function order() {
    if (!picked.length) return;
    if (!window.confirm(`Order ${picked.length} number${picked.length === 1 ? "" : "s"} from Skyetel? This is billed to the ICNA Relief account.`)) return;
    setBusy(true);
    try {
      await call({ action: "order", numbers: picked, confirm: "ORDER" });
      onOrdered(`Ordered ${picked.length} number${picked.length === 1 ? "" : "s"}. Route them to the PBX above.`);
      setResults(null);
      setPicked([]);
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-3xl p-5" style={card}>
      <SectionTitle>Buy numbers</SectionTitle>
      <div className="flex flex-wrap gap-2 items-end mb-3">
        <input aria-label="Area code" value={npa} onChange={(e) => setNpa(e.target.value.replace(/\D/g, "").slice(0, 3))} placeholder="Area code, e.g. 713" style={{ ...input, width: 170 }} />
        <input aria-label="State" value={state} onChange={(e) => setState(e.target.value.toUpperCase().slice(0, 2))} placeholder="State (optional)" style={{ ...input, width: 150 }} />
        <label className="flex items-center gap-2 text-sm px-1">
          <input type="checkbox" checked={tollFree} onChange={(e) => setTollFree(e.target.checked)} style={{ accentColor: emerald }} /> Toll-free
        </label>
        <button type="button" disabled={busy || (!npa && !state && !tollFree)} onClick={search} style={btn}>
          Search
        </button>
      </div>
      <p className="text-xs mt-0 mb-3" style={{ color: muted }}>
        Found numbers are held for 10 minutes. Toll-free numbers can&apos;t send or receive SMS.
      </p>
      {results && (
        <>
          {results.length === 0 ? (
            <p className="text-sm" style={{ color: muted }}>
              Nothing available for that search.
            </p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 mb-3">
              {results.map((r) => {
                const on = picked.includes(r);
                return (
                  <label key={r} className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm cursor-pointer" style={{ background: on ? "#F2F8F5" : "#FBF7EF", border: `1px solid ${on ? emerald : "transparent"}` }}>
                    <input type="checkbox" checked={on} onChange={() => setPicked((p) => (on ? p.filter((x) => x !== r) : [...p, r].slice(0, 10)))} style={{ accentColor: emerald }} />
                    {fmtPhone(r)}
                  </label>
                );
              })}
            </div>
          )}
          <button type="button" disabled={busy || picked.length === 0} onClick={order} style={{ ...btnPrimary, opacity: picked.length ? 1 : 0.5 }}>
            Order {picked.length || ""} selected
          </button>
        </>
      )}
    </section>
  );
}
