"use client";

import { useEffect, useState } from "react";
import PasswordInput from "@/components/PasswordInput";

type FieldStatus = { source: "database" | "env" | "unset"; updatedAt: string | null; updatedBy: string | null };
type Status = { appKey: FieldStatus; appSecret: FieldStatus; refreshToken: FieldStatus };

const LABELS: Record<keyof Status, string> = {
  appKey: "App Key",
  appSecret: "App Secret",
  refreshToken: "Refresh Token",
};

function StatusBadge({ s }: { s: FieldStatus }) {
  if (s.source === "database") {
    return (
      <span className="text-[11px] font-semibold rounded-full px-2.5 py-1" style={{ color: "var(--portal-emerald)", background: "#EAF5EE" }}>
        ✓ Set (updated {new Date(s.updatedAt!).toLocaleDateString()}
        {s.updatedBy ? ` by ${s.updatedBy}` : ""})
      </span>
    );
  }
  if (s.source === "env") {
    return (
      <span className="text-[11px] font-semibold rounded-full px-2.5 py-1" style={{ color: "#A57420", background: "#FCEFDD" }}>
        ✓ Set via environment variable (not yet in the database)
      </span>
    );
  }
  return (
    <span className="text-[11px] font-semibold rounded-full px-2.5 py-1" style={{ color: "#B5566B", background: "#FBE9EC" }}>
      Not configured
    </span>
  );
}

export default function DropboxSettingsClient() {
  const [status, setStatus] = useState<Status | null>(null);
  const [values, setValues] = useState({ appKey: "", appSecret: "", refreshToken: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);

  const [oauthValues, setOauthValues] = useState({ appKey: "", appSecret: "", code: "" });
  const [connecting, setConnecting] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);

  async function load() {
    const res = await fetch("/api/admin/dropbox-settings");
    const body = await res.json();
    if (res.ok) setStatus(body.status);
  }
  useEffect(() => {
    load();
  }, []);

  async function connectWithCode() {
    setConnecting(true);
    setConnectError(null);
    setConnected(false);
    try {
      const res = await fetch("/api/admin/dropbox-oauth-exchange", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(oauthValues),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error);
      setOauthValues({ appKey: "", appSecret: "", code: "" });
      setConnected(true);
      load();
    } catch (e: any) {
      setConnectError(e.message);
    } finally {
      setConnecting(false);
    }
  }

  async function save() {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const res = await fetch("/api/admin/dropbox-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error);
      setValues({ appKey: "", appSecret: "", refreshToken: "" });
      setSaved(true);
      load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  async function testConnection() {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch("/api/admin/dropbox-settings/test", { method: "POST" });
      const body = await res.json();
      if (body.ok) {
        setTestResult({ ok: true, message: `Connected as ${body.accountName ?? body.accountEmail ?? "Dropbox account"}` });
      } else {
        setTestResult({ ok: false, message: body.error ?? "Connection failed." });
      }
    } catch (e: any) {
      setTestResult({ ok: false, message: e.message });
    } finally {
      setTesting(false);
    }
  }

  if (!status) return <p className="text-sm" style={{ color: "rgba(22,48,43,0.4)" }}>Loading…</p>;

  const fieldInputStyle: React.CSSProperties = {
    border: "1.5px solid var(--portal-line, rgba(22,48,43,0.12))",
    borderRadius: 10,
    padding: "10px 14px",
    outline: "none",
  };

  return (
    <div>
      <div className="rounded-2xl p-5 mb-6" style={{ background: "#EAF5EE" }}>
        <h3 className="text-sm font-bold mb-1" style={{ color: "#2F4A3E" }}>
          Connect via Authorization Code
        </h3>
        <p className="text-xs mb-3" style={{ color: "rgba(22,48,43,0.55)" }}>
          The easy path — paste your App Key, App Secret, and a fresh authorization code from Dropbox
          (from visiting the authorize URL), and this does the token exchange and saves everything
          for you.
        </p>
        <div className="space-y-2 mb-3">
          <PasswordInput
            value={oauthValues.appKey}
            onChange={(v) => setOauthValues({ ...oauthValues, appKey: v })}
            placeholder="App Key"
            className="w-full text-sm"
            style={fieldInputStyle}
            autoComplete="off"
          />
          <PasswordInput
            value={oauthValues.appSecret}
            onChange={(v) => setOauthValues({ ...oauthValues, appSecret: v })}
            placeholder="App Secret"
            className="w-full text-sm"
            style={fieldInputStyle}
            autoComplete="off"
          />
          <PasswordInput
            value={oauthValues.code}
            onChange={(v) => setOauthValues({ ...oauthValues, code: v })}
            placeholder="Authorization Code (from the Dropbox authorize page)"
            className="w-full text-sm"
            style={fieldInputStyle}
            autoComplete="off"
          />
        </div>
        {connectError && (
          <p className="text-sm mb-2" style={{ color: "#B5566B" }}>
            {connectError}
          </p>
        )}
        {connected && (
          <p className="text-sm mb-2" style={{ color: "var(--portal-emerald)" }}>
            Connected — all three credentials saved and live immediately.
          </p>
        )}
        <button
          onClick={connectWithCode}
          disabled={connecting || Object.values(oauthValues).some((v) => !v.trim())}
          className="text-sm px-5 py-2.5 rounded-full text-white font-bold disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed hover:scale-105 active:scale-95 transition-transform duration-150"
          style={{ background: "var(--portal-emerald)", boxShadow: "0 3px 10px rgba(31,111,84,0.3)" }}
        >
          {connecting ? "Connecting…" : "Connect"}
        </button>
        <p className="text-[11px] mt-2" style={{ color: "rgba(22,48,43,0.4)" }}>
          Authorization codes expire within a few minutes — if this fails, generate a fresh one by
          revisiting the Dropbox authorize URL and try again right away.
        </p>
      </div>

      <p className="text-xs mb-3 font-semibold" style={{ color: "rgba(22,48,43,0.5)" }}>
        Or set each value manually
      </p>

      <div className="space-y-4 mb-6">
        {(Object.keys(LABELS) as (keyof Status)[]).map((field) => (
          <div key={field} className="rounded-2xl p-4" style={{ background: "#F4F3EE" }}>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-sm font-bold" style={{ color: "#2F4A3E" }}>
                {LABELS[field]}
              </label>
              <StatusBadge s={status[field]} />
            </div>
            <PasswordInput
              value={values[field]}
              onChange={(v) => setValues({ ...values, [field]: v })}
              placeholder="Leave blank to keep current value"
              className="w-full text-sm"
              style={{ ...fieldInputStyle, background: "#fff" }}
              autoComplete="off"
            />
          </div>
        ))}
      </div>

      {error && (
        <p className="text-sm mb-3" style={{ color: "#B5566B" }}>
          {error}
        </p>
      )}
      {saved && (
        <p className="text-sm mb-3" style={{ color: "var(--portal-emerald)" }}>
          Saved — changes are live immediately, no deploy needed.
        </p>
      )}

      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={save}
          disabled={saving || Object.values(values).every((v) => !v.trim())}
          className="text-sm px-5 py-2.5 rounded-full text-white font-bold disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed hover:scale-105 active:scale-95 transition-transform duration-150"
          style={{ background: "var(--portal-emerald)", boxShadow: "0 3px 10px rgba(31,111,84,0.3)" }}
        >
          {saving ? "Saving…" : "Save Changes"}
        </button>
        <button
          onClick={testConnection}
          disabled={testing}
          className="text-sm px-5 py-2.5 rounded-full font-bold disabled:opacity-50 cursor-pointer hover:scale-105 active:scale-95 transition-transform duration-150"
          style={{ background: "#fff", color: "var(--portal-emerald)", boxShadow: "0 2px 8px rgba(22,48,43,0.08)" }}
        >
          {testing ? "Testing…" : "Test Connection"}
        </button>
      </div>

      {testResult && (
        <div
          className="rounded-2xl px-4 py-3 text-sm"
          style={{
            background: testResult.ok ? "#E3F0EA" : "#FBE3DC",
            color: testResult.ok ? "var(--portal-emerald)" : "#B55139",
          }}
        >
          {testResult.ok ? "✓ " : "✗ "}
          {testResult.message}
        </div>
      )}

      <p className="text-xs mt-6" style={{ color: "rgba(22,48,43,0.45)" }}>
        These values are never displayed back once saved — only whether each one is set, and when it was
        last updated. Enter a new value to overwrite; leave a field blank to keep what's already there.
      </p>
    </div>
  );
}
