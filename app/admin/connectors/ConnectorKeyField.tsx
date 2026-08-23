"use client";

import { useEffect, useState } from "react";
import PasswordInput from "@/components/PasswordInput";

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

  if (!status) return <p className="text-sm" style={{ color: "rgba(22,48,43,0.4)" }}>Loading…</p>;

  return (
    <div className="mb-4">
      <div className="flex items-center justify-between mb-1.5">
        <label className="text-sm font-bold" style={{ color: "#2F4A3E" }}>
          {label}
        </label>
        {status.source === "database" && (
          <span className="text-[11px] font-semibold rounded-full px-2.5 py-1" style={{ color: "var(--portal-emerald)", background: "#EAF5EE" }}>
            ✓ Set{status.updatedAt ? ` (updated ${new Date(status.updatedAt).toLocaleDateString()}` : ""}
            {status.updatedBy ? ` by ${status.updatedBy})` : status.updatedAt ? ")" : ""}
          </span>
        )}
        {status.source === "env" && (
          <span className="text-[11px] font-semibold rounded-full px-2.5 py-1" style={{ color: "#A57420", background: "#FCEFDD" }}>
            ✓ Set via environment variable
          </span>
        )}
        {status.source === "unset" && (
          <span className="text-[11px] font-semibold rounded-full px-2.5 py-1" style={{ color: "rgba(22,48,43,0.4)", background: "#F4F3EE" }}>
            Not set
          </span>
        )}
      </div>
      <div className="flex gap-2">
        <div className="flex-1">
          <PasswordInput
            className="w-full text-sm"
            style={{ border: "1.5px solid var(--portal-line, rgba(22,48,43,0.12))", borderRadius: 10, padding: "10px 14px", outline: "none" }}
            placeholder={placeholder ?? "Paste value..."}
            value={value}
            onChange={setValue}
          />
        </div>
        <button
          onClick={save}
          disabled={saving || !value.trim()}
          className="px-5 py-2.5 rounded-full text-sm font-bold text-white cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed hover:scale-105 active:scale-95 transition-transform duration-150"
          style={{ background: "var(--portal-emerald)", boxShadow: value.trim() ? "0 3px 10px rgba(31,111,84,0.3)" : "none" }}
        >
          {saving ? "Saving..." : "Save"}
        </button>
      </div>
      {error && (
        <p className="text-xs mt-1.5" style={{ color: "#B5566B" }}>
          {error}
        </p>
      )}
    </div>
  );
}
