"use client";

import { useEffect, useState } from "react";

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
      <span className="text-[11px]" style={{ color: "var(--portal-emerald)" }}>
        ✓ Set (updated {new Date(s.updatedAt!).toLocaleDateString()}
        {s.updatedBy ? ` by ${s.updatedBy}` : ""})
      </span>
    );
  }
  if (s.source === "env") {
    return (
      <span className="text-[11px]" style={{ color: "#A57420" }}>
        ✓ Set via environment variable (not yet in the database)
      </span>
    );
  }
  return (
    <span className="text-[11px]" style={{ color: "#B55139" }}>
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

  async function load() {
    const res = await fetch("/api/admin/dropbox-settings");
    const body = await res.json();
    if (res.ok) setStatus(body.status);
  }
  useEffect(() => {
    load();
  }, []);

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

  if (!status) return <p className="text-sm" style={{ color: "rgba(22,48,43,0.5)" }}>Loading…</p>;

  return (
    <div>
      <div className="space-y-4 mb-6">
        {(Object.keys(LABELS) as (keyof Status)[]).map((field) => (
          <div key={field} className="rounded-xl bg-white p-4" style={{ border: "1px solid var(--portal-line)" }}>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-sm font-bold">{LABELS[field]}</label>
              <StatusBadge s={status[field]} />
            </div>
            <input
              type="password"
              value={values[field]}
              onChange={(e) => setValues({ ...values, [field]: e.target.value })}
              placeholder="Leave blank to keep current value"
              className="w-full rounded-lg px-3 py-2 text-sm"
              style={{ border: "1px solid var(--portal-line)" }}
              autoComplete="off"
            />
          </div>
        ))}
      </div>

      {error && <p className="text-sm text-red-600 mb-3">{error}</p>}
      {saved && (
        <p className="text-sm mb-3" style={{ color: "var(--portal-emerald)" }}>
          Saved — changes are live immediately, no deploy needed.
        </p>
      )}

      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={save}
          disabled={saving || Object.values(values).every((v) => !v.trim())}
          className="text-sm px-5 py-2.5 rounded-lg text-white font-medium disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
          style={{ background: "var(--portal-emerald)" }}
        >
          {saving ? "Saving…" : "Save Changes"}
        </button>
        <button
          onClick={testConnection}
          disabled={testing}
          className="text-sm px-5 py-2.5 rounded-lg font-medium disabled:opacity-50 cursor-pointer"
          style={{ border: "1px solid var(--portal-line)", color: "var(--portal-emerald)" }}
        >
          {testing ? "Testing…" : "Test Connection"}
        </button>
      </div>

      {testResult && (
        <div
          className="rounded-lg px-4 py-3 text-sm"
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
