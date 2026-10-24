"use client";

import { useEffect, useState } from "react";

const soft = "rgba(22,48,43,0.55)";

// Connect / disconnect Amazon Business. The keys themselves are the
// fields above; this sends the Amazon Business account admin to Amazon
// to approve access and shows whether it's working.
export default function AmazonBusinessConnect() {
  const [origin, setOrigin] = useState("");
  const [connected, setConnected] = useState<boolean | null>(null);
  const [lastRun, setLastRun] = useState<{ started_at: string; ok: boolean | null; error: string | null } | null>(null);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const load = () =>
    fetch("/api/admin/amazon-business?view=none")
      .then((r) => r.json())
      .then((b) => {
        setConnected(!!b.connected);
        setLastRun(b.runs?.[0] ?? null);
      })
      .catch(() => setConnected(false));

  useEffect(() => {
    setOrigin(window.location.origin);
    const sp = new URLSearchParams(window.location.search);
    if (sp.get("amzb") === "connected") setNotice({ ok: true, text: "Connected to Amazon Business. The first sync runs tonight, or press Sync now on Admin → Amazon Business." });
    if (sp.get("amzb_error")) setNotice({ ok: false, text: sp.get("amzb_error")! });
    load();
  }, []);

  async function disconnect() {
    if (!confirm("Disconnect Amazon Business? Invoices will stop syncing until someone connects again.")) return;
    await fetch("/api/admin/amazon-business/connect", { method: "DELETE" });
    load();
  }

  const redirect = `${origin}/api/admin/amazon-business/callback`;
  return (
    <div className="mt-2 pt-4" style={{ borderTop: "1px solid rgba(22,48,43,0.08)" }}>
      <p className="text-xs mb-3" style={{ color: soft }}>
        In the Amazon Business Solution Provider Portal, set your app&apos;s OAuth redirect URI to{" "}
        <code className="text-[11px] px-2 py-1 rounded-md" style={{ background: "#F4F3EE" }}>
          {redirect}
        </code>{" "}
        <button
          className="text-xs font-semibold underline"
          style={{ color: "rgba(22,48,43,0.7)" }}
          onClick={() =>
            navigator.clipboard?.writeText(redirect).then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            })
          }
        >
          {copied ? "Copied" : "Copy"}
        </button>
        . The person who clicks Connect must be an admin on ICNA Relief&apos;s Amazon Business account, and the app needs the Business Purchase Reconciliation role.
      </p>
      {notice && (
        <p className="text-xs mb-3 rounded-lg px-3 py-2" style={{ background: notice.ok ? "#EAF3EF" : "#F8E8EC", color: notice.ok ? "#2F6D46" : "#B5566B" }}>
          {notice.text}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-3">
        {connected ? (
          <>
            <span className="text-sm" style={{ color: "#2F6D46" }}>
              ● Connected
              {lastRun ? (
                <span style={{ color: lastRun.ok === false ? "#B5566B" : "rgba(22,48,43,0.5)" }}>
                  {" "}
                  · last sync {new Date(lastRun.started_at).toLocaleString()}
                  {lastRun.ok === false ? ` failed: ${lastRun.error}` : ""}
                </span>
              ) : null}
            </span>
            <a href="/admin/amazon-business" className="text-xs font-semibold underline" style={{ color: "rgba(22,48,43,0.7)" }}>
              Open Amazon Business
            </a>
            <a href="/api/admin/amazon-business/connect" className="text-xs font-semibold underline" style={{ color: "rgba(22,48,43,0.7)" }}>
              Reconnect
            </a>
            <button onClick={disconnect} className="text-xs font-semibold underline" style={{ color: "#B5566B" }}>
              Disconnect
            </button>
          </>
        ) : (
          <a href="/api/admin/amazon-business/connect" className="inline-block rounded-full text-xs font-semibold px-4 py-2" style={{ background: "#232F3E", color: "#fff" }}>
            Connect Amazon Business
          </a>
        )}
      </div>
    </div>
  );
}
