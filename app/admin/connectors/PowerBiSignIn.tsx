"use client";

import { useEffect, useState } from "react";

type Status = { signedIn: boolean; name: string | null; since: string | null };

// Queries against a Power BI model that has security roles must run as a
// person, not the app. An admin signs in once here.
export default function PowerBiSignIn() {
  const [status, setStatus] = useState<Status | null>(null);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const [origin, setOrigin] = useState("");
  const [copied, setCopied] = useState(false);

  async function load() {
    const res = await fetch("/api/admin/powerbi/oauth/status");
    if (res.ok) setStatus(await res.json());
  }
  useEffect(() => {
    setOrigin(window.location.origin);
    const sp = new URLSearchParams(window.location.search);
    if (sp.get("powerbi") === "signed-in") setNotice({ ok: true, text: "Signed in. Power BI queries now run as this account." });
    if (sp.get("powerbi") === "not-configured") setNotice({ ok: false, text: "Fill in the four Power BI fields above first." });
    if (sp.get("powerbi_error")) setNotice({ ok: false, text: sp.get("powerbi_error")! });
    load();
  }, []);

  async function signOut() {
    if (!confirm("Sign out? Power BI reports and comparisons will stop pulling numbers until someone signs in again.")) return;
    await fetch("/api/admin/powerbi/oauth/signout", { method: "POST" });
    load();
  }

  const redirectUri = `${origin}/api/admin/powerbi/oauth/callback`;
  return (
    <div className="mt-2 pt-4" style={{ borderTop: "1px solid rgba(22,48,43,0.08)" }}>
      <div className="text-sm font-semibold mb-1" style={{ color: "#2F4A3E" }}>
        Run queries as
      </div>
      <p className="text-xs mb-3" style={{ color: "rgba(22,48,43,0.55)" }}>
        The model has security roles, so Power BI only answers queries from a signed-in person. Sign in once with an account that&apos;s an admin or member of the workspace. It stays signed in as long as it&apos;s used at least every 90 days (the nightly comparison keeps it fresh).
      </p>
      {notice && (
        <p className="text-xs mb-3 rounded-lg px-3 py-2" style={{ background: notice.ok ? "#EAF3EF" : "#F8E8EC", color: notice.ok ? "#2F6D46" : "#B5566B" }}>
          {notice.text}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-3">
        {status?.signedIn ? (
          <>
            <span className="text-sm" style={{ color: "#2F6D46" }}>
              ● {status.name}
              {status.since ? <span style={{ color: "rgba(22,48,43,0.5)" }}> · since {new Date(status.since).toLocaleDateString()}</span> : null}
            </span>
            <a href="/api/admin/powerbi/oauth/start" className="text-xs font-semibold underline" style={{ color: "rgba(22,48,43,0.7)" }}>
              Switch account
            </a>
            <button onClick={signOut} className="text-xs font-semibold underline" style={{ color: "#B5566B" }}>
              Sign out
            </button>
          </>
        ) : (
          <a
            href="/api/admin/powerbi/oauth/start"
            className="rounded-full px-4 py-1.5 text-[13px] font-semibold"
            style={{ background: "var(--portal-emerald)", color: "#fff" }}
          >
            Sign in with Microsoft
          </a>
        )}
      </div>
      {origin && (
        <p className="text-[11px] mt-3" style={{ color: "rgba(22,48,43,0.5)" }}>
          Redirect URI to register on the app (Entra → App registrations → Authentication → Web):{" "}
          <code>{redirectUri}</code>{" "}
          <button
            className="underline"
            onClick={() => navigator.clipboard.writeText(redirectUri).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); })}
          >
            {copied ? "copied" : "copy"}
          </button>
        </p>
      )}
    </div>
  );
}
