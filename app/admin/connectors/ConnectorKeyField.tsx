"use client";

import { useEffect, useState } from "react";

type Status = { source: "database" | "env" | "unset"; updatedAt: string | null; updatedBy: string | null };

export default function ConnectorKeyField({
  settingKey,
  label,
  envFallbackKey,
  placeholder,
}: {
  settingKey: string;
  label: string;
  envFallbackKey?: string;
  placeholder?: string;
}) {
  const [status, setStatus] = useState<Status | null>(null);
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const params = new URLSearchParams({ key: settingKey });
    if (envFallbackKey) params.set("envFallbackKey", envFallbackKey);
    const res = await fetch(`/api/admin/integration-settings?${params}`);
    const body = await res.json();
    if (res.ok) setStatus(body.status);
  }
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settingKey]);

  async function save() {
    if (!value.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/integration-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: settingKey, value }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error);
      setValue("");
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  if (!status) return <p className="text-sm" style={{ color: "rgba(22,48,43,0.5)" }}>Loading…</p>;

  return (
    <div className="mb-3">
      <div className="flex items-center justify-between mb-1.5">
        <label className="text-sm font-bold">{label}</label>
        {status.source === "database" && (
          <span className="text-[11px]" style={{ color: "var(--portal-emerald)" }}>
            ✓ Set{status.updatedAt ? ` (updated ${new Date(status.updatedAt).toLocaleDateString()}` : ""}
            {status.updatedBy ? ` by ${status.updatedBy})` : status.updatedAt ? ")" : ""}
          </span>
        )}
        {status.source === "env" && (
          <span className="text-[11px]" style={{ color: "#A57420" }}>
            ✓ Set via environment variable
          </span>
        )}
        {status.source === "unset" && <span className="text-[11px] text-gray-400">Not set</span>}
      </div>
      <div className="flex gap-2">
        <input
          type="password"
          className="border rounded px-3 py-2 text-sm flex-1"
          placeholder={placeholder ?? "Paste value..."}
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
        <button
          onClick={save}
          disabled={saving || !value.trim()}
          className="px-3 py-2 rounded text-sm font-medium text-white disabled:opacity-40"
          style={{ background: "var(--portal-emerald)" }}
        >
          {saving ? "Saving..." : "Save"}
        </button>
      </div>
      {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
    </div>
  );
}
