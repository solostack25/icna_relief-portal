"use client";

import { useEffect, useState } from "react";
import { api, Btn, C, Card, inputStyle, MONTH_SHORT, Notice, td, th } from "./ui";
import { QbResultNotice } from "./ImportPanel";

type Status = {
  online: { configured: boolean; sandbox: boolean; connected: boolean; company: string | null; since: string | null };
  desktop: { configured: boolean; username: string | null; lastRun: string | null };
  queue: { id: string; year: number; month: number; source: string; status: string; error: string | null; requested_at: string; finished_at: string | null }[];
};

export default function QuickBooksPanel({ year, month, onPulled }: { year: number; month: number | null; onPulled: () => void }) {
  const [s, setS] = useState<Status | null>(null);
  const [pYear, setPYear] = useState(year);
  const [pMonth, setPMonth] = useState(month ?? (new Date().getMonth() || 12));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [result, setResult] = useState<Parameters<typeof QbResultNotice>[0]["r"] | null>(null);

  const load = () => api<Status>("/api/admin/quickbooks/status").then(setS).catch((e) => setMsg({ ok: false, text: String(e) }));
  useEffect(() => {
    load();
  }, []);

  async function pull(source: "online" | "desktop") {
    setBusy(true);
    setMsg(null);
    setResult(null);
    try {
      const r = await api<{ queued?: boolean; result?: Parameters<typeof QbResultNotice>[0]["r"] }>("/api/admin/quickbooks/pull", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ year: pYear, month: pMonth, source }),
      });
      if (r.queued) setMsg({ ok: true, text: `${MONTH_SHORT[pMonth - 1]} ${pYear} is queued. The Web Connector picks it up on its next run (or click "Update Selected" in the Web Connector on the finance PC).` });
      if (r.result) {
        setResult(r.result);
        onPulled();
      }
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(false);
      load();
    }
  }

  if (!s) return <p className="text-sm" style={{ color: C.soft }}>{msg?.text ?? "Loading…"}</p>;
  const none = !s.online.connected && !s.desktop.configured;

  return (
    <div style={{ maxWidth: 900 }}>
      {none && (
        <Notice ok="warn">
          QuickBooks isn&apos;t connected yet. Set up QuickBooks Online or the Desktop Web Connector on <a className="underline font-semibold" href="/admin/connectors#quickbooks">Connectors</a>. Until then, upload the QuickBooks export on the Upload tab.
        </Notice>
      )}
      <div className="grid gap-4 mb-5" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))" }}>
        <Card title="QuickBooks Online" style={{ marginBottom: 0 }}>
          <p className="text-sm" style={{ color: s.online.connected ? C.good : C.soft }}>
            {s.online.connected ? `● Connected to ${s.online.company ?? "company"}${s.online.sandbox ? " (sandbox)" : ""}` : s.online.configured ? "App keys saved — not connected yet" : "Not set up"}
          </p>
          <p className="text-xs mt-2" style={{ color: C.faint }}>Pulls the month straight away.</p>
        </Card>
        <Card title="QuickBooks Desktop" style={{ marginBottom: 0 }}>
          <p className="text-sm" style={{ color: s.desktop.configured ? C.good : C.soft }}>
            {s.desktop.configured ? `● Web Connector set up (user ${s.desktop.username})` : "Not set up"}
          </p>
          <p className="text-xs mt-2" style={{ color: C.faint }}>
            {s.desktop.lastRun ? `Last checked in ${new Date(s.desktop.lastRun).toLocaleString()}` : "Hasn't checked in yet."} Queued months are sent on the next run.
          </p>
        </Card>
      </div>

      <Card title="Pull a month">
        <div className="flex flex-wrap items-center gap-3">
          <select value={pMonth} onChange={(e) => setPMonth(Number(e.target.value))} style={inputStyle}>
            {MONTH_SHORT.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
          </select>
          <input type="number" value={pYear} onChange={(e) => setPYear(Number(e.target.value))} style={{ ...inputStyle, width: 90 }} />
          <Btn onClick={() => pull("online")} disabled={busy || !s.online.connected}>{busy ? "Working…" : "Pull from QuickBooks Online"}</Btn>
          <Btn kind="ghost" onClick={() => pull("desktop")} disabled={busy || !s.desktop.configured}>Queue for Desktop</Btn>
        </div>
        <p className="text-xs mt-3" style={{ color: C.faint }}>
          Reads the Profit &amp; Loss by Class for the month. Classes go where Class mapping says; new classes get a suggestion. Revenue and typed-in rows aren&apos;t touched. Read-only — nothing is written to QuickBooks.
        </p>
        <div className="mt-4">
          {msg && <Notice ok={msg.ok}>{msg.text}</Notice>}
          {result && <QbResultNotice r={result} />}
        </div>
      </Card>

      <Card title="Recent pulls" right={<button className="text-xs underline" style={{ color: C.emerald }} onClick={load}>Refresh</button>}>
        {s.queue.length ? (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={th}>Month</th>
                <th style={th}>From</th>
                <th style={th}>Status</th>
                <th style={th}>Requested</th>
              </tr>
            </thead>
            <tbody>
              {s.queue.map((q) => (
                <tr key={q.id}>
                  <td style={td}>{MONTH_SHORT[q.month - 1]} {q.year}</td>
                  <td style={td}>{q.source === "online" ? "Online" : "Desktop"}</td>
                  <td style={{ ...td, color: q.status === "done" ? C.good : q.status === "failed" ? C.bad : C.warn }}>
                    {q.status === "queued" ? "Waiting for Web Connector" : q.status === "sent" ? "In progress" : q.status === "done" ? "Done" : "Failed"}
                    {q.error && <span className="block text-xs">{q.error}</span>}
                  </td>
                  <td style={{ ...td, color: C.soft, whiteSpace: "nowrap" }}>{new Date(q.requested_at).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="text-sm" style={{ color: C.soft }}>Nothing pulled yet.</p>
        )}
      </Card>
    </div>
  );
}
