"use client";

import { useEffect, useState } from "react";

type Status = { source: "database" | "env" | "unset"; updatedAt: string | null; updatedBy: string | null };

export default function PexelsSettingsClient() {
  const [status, setStatus] = useState<Status | null>(null);
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const res = await fetch("/api/admin/pexels-settings");
    const body = await res.json();
    if (res.ok) setStatus(body.status);
  }
  useEffect(() => {
    load();
  }, []);

  async function save() {
    if (!value.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/pexels-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey: value }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error);
      setValue("");
      setSaved(true);
      load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  if (!status) return <p className="text-sm" style={{ color: "rgba(22,48,43,0.5)" }}>Loading…</p>;

  return (
    <div className="rounded-xl bg-white p-4" style={{ border: "1px solid var(--portal-line)" }}>
      <div className="flex items-center justify-between mb-1.5">
        <label className="text-sm font-bold">API Key</label>
        {status.source === "database" && (
          <span className="text-[11px]" style={{ color: "var(--portal-emerald)" }}>
            ✓ Set (updated {new Date(status.updatedAt!).toLocaleDateString()}
            {status.updatedBy ? ` by ${status.updatedBy}` : ""})
          </span>
        )}
        {status.source === "env" && (
          <span className="text-[11px]" style={{ color: "#A57420" }}>
            ✓ Set via environment variable
          </span>
        )}
        {status.source === "unset" && (
          <span className="text-[11px]" style={{ color: "#B55139" }}>
            Not configured
          </span>
        )}
      </div>
      <input
        type="password"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Leave blank to keep current value"
        className="w-full rounded-lg px-3 py-2 text-sm mb-3"
        style={{ border: "1px solid var(--portal-line)" }}
        autoComplete="off"
      />
      {error && <p className="text-sm text-red-600 mb-2">{error}</p>}
      {saved && (
        <p className="text-sm mb-2" style={{ color: "var(--portal-emerald)" }}>
          Saved — live immediately.
        </p>
      )}
      <button
        onClick={save}
        disabled={saving || !value.trim()}
        className="text-sm px-5 py-2 rounded-lg text-white font-medium cursor-pointer disabled:opacity-40"
        style={{ background: "var(--portal-emerald)" }}
      >
        {saving ? "Saving…" : "Save"}
      </button>
    </div>
  );
}
