"use client";

import { useEffect, useState } from "react";

type Status = {
  online: { configured: boolean; sandbox: boolean; connected: boolean; company: string | null; since: string | null };
  desktop: { configured: boolean; username: string | null; lastRun: string | null };
};

const soft = "rgba(22,48,43,0.55)";

function Copy({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  return (
    <span className="inline-flex items-center gap-2 flex-wrap">
      <code className="text-[11px] px-2 py-1 rounded-md" style={{ background: "#F4F3EE" }}>{text}</code>
      <button
        className="text-xs font-semibold underline"
        style={{ color: "rgba(22,48,43,0.7)" }}
        onClick={() => {
          navigator.clipboard?.writeText(text).then(() => {
            setDone(true);
            setTimeout(() => setDone(false), 1500);
          });
        }}
      >
        {done ? "Copied" : "Copy"}
      </button>
    </span>
  );
}

// Connect / disconnect QuickBooks Online, and get the Web Connector file
// for QuickBooks Desktop. The keys themselves are the fields above.
export function QuickBooksOnlineConnect() {
  const [s, setS] = useState<Status | null>(null);
  const [origin, setOrigin] = useState("");
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const load = () => fetch("/api/admin/quickbooks/status").then(async (r) => r.ok && setS(await r.json()));
  useEffect(() => {
    setOrigin(window.location.origin);
    const sp = new URLSearchParams(window.location.search);
    if (sp.get("qbo") === "connected") setNotice({ ok: true, text: "Connected to QuickBooks Online." });
    if (sp.get("qbo") === "not-configured") setNotice({ ok: false, text: "Save the client ID and secret above first." });
    if (sp.get("qbo_error")) setNotice({ ok: false, text: sp.get("qbo_error")! });
    load();
  }, []);

  async function disconnect() {
    if (!confirm("Disconnect QuickBooks Online? Pulling months will stop until someone connects again.")) return;
    await fetch("/api/admin/quickbooks/online/disconnect", { method: "POST" });
    load();
  }

  return (
    <div className="mt-2 pt-4" style={{ borderTop: "1px solid rgba(22,48,43,0.08)" }}>
      <p className="text-xs mb-3" style={{ color: soft }}>
        In the Intuit Developer portal (developer.intuit.com → your app → Keys &amp; credentials), add this Redirect URI: <Copy text={`${origin}/api/admin/quickbooks/online/callback`} />
      </p>
      {notice && (
        <p className="text-xs mb-3 rounded-lg px-3 py-2" style={{ background: notice.ok ? "#EAF3EF" : "#F8E8EC", color: notice.ok ? "#2F6D46" : "#B5566B" }}>
          {notice.text}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-3">
        {s?.online.connected ? (
          <>
            <span className="text-sm" style={{ color: "#2F6D46" }}>
              ● {s.online.company}
              {s.online.sandbox ? " (sandbox)" : ""}
              {s.online.since ? <span style={{ color: "rgba(22,48,43,0.5)" }}> · since {new Date(s.online.since).toLocaleDateString()}</span> : null}
            </span>
            <a href="/api/admin/quickbooks/online/start" className="text-xs font-semibold underline" style={{ color: "rgba(22,48,43,0.7)" }}>Reconnect</a>
            <button onClick={disconnect} className="text-xs font-semibold underline" style={{ color: "#B5566B" }}>Disconnect</button>
          </>
        ) : (
          <a href="/api/admin/quickbooks/online/start" className="inline-block rounded-full text-xs font-semibold px-4 py-2" style={{ background: "#2CA01C", color: "#fff" }}>
            Connect to QuickBooks
          </a>
        )}
      </div>
    </div>
  );
}

export function QuickBooksDesktopConnect() {
  const [s, setS] = useState<Status | null>(null);
  const [origin, setOrigin] = useState("");
  useEffect(() => {
    setOrigin(window.location.origin);
    fetch("/api/admin/quickbooks/status").then(async (r) => r.ok && setS(await r.json()));
  }, []);
  return (
    <div className="mt-2 pt-4" style={{ borderTop: "1px solid rgba(22,48,43,0.08)" }}>
      <ol className="text-xs mb-3 list-decimal pl-4 space-y-1" style={{ color: soft }}>
        <li>Pick a username and a long password above and save both.</li>
        <li>Download the Web Connector file below. On the PC with QuickBooks Desktop, open QuickBooks as an admin with the company file open.</li>
        <li>In the QuickBooks Web Connector (free from Intuit), File → Add an application → choose the file → allow access &ldquo;even if QuickBooks is not running&rdquo;.</li>
        <li>Type the same password in the Web Connector&apos;s Password box, tick Auto-Run, and click Update Selected once to test.</li>
      </ol>
      <p className="text-xs mb-3" style={{ color: soft }}>
        Endpoint: <Copy text={`${origin}/api/qbwc`} />
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <a
          href="/api/admin/quickbooks/qwc"
          className="inline-block rounded-full border text-xs font-semibold px-4 py-2"
          style={{ borderColor: "rgba(31,111,84,0.4)", color: "#1F6F54", opacity: s?.desktop.configured ? 1 : 0.5, pointerEvents: s?.desktop.configured ? "auto" : "none" }}
        >
          Download Web Connector file (.qwc)
        </a>
        <span className="text-xs" style={{ color: s?.desktop.lastRun ? "#2F6D46" : "rgba(22,48,43,0.5)" }}>
          {s?.desktop.lastRun ? `● Last checked in ${new Date(s.desktop.lastRun).toLocaleString()}` : s?.desktop.configured ? "Waiting for the Web Connector to check in" : "Save a username and password first"}
        </span>
      </div>
    </div>
  );
}
