"use client";

import { useEffect, useState } from "react";
import PasswordInput from "@/components/PasswordInput";

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

  if (!status) return <p className="text-sm" style={{ color: "rgba(22,48,43,0.4)" }}>Loading…</p>;

  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <label className="text-sm font-bold" style={{ color: "#2F4A3E" }}>
          API Key
        </label>
        {status.source === "database" && (
          <span className="text-[11px] font-semibold rounded-full px-2.5 py-1" style={{ color: "var(--portal-emerald)", background: "#EAF5EE" }}>
            ✓ Set (updated {new Date(status.updatedAt!).toLocaleDateString()}
            {status.updatedBy ? ` by ${status.updatedBy}` : ""})
          </span>
        )}
        {status.source === "env" && (
          <span className="text-[11px] font-semibold rounded-full px-2.5 py-1" style={{ color: "#A57420", background: "#FCEFDD" }}>
            ✓ Set via environment variable
          </span>
        )}
        {status.source === "unset" && (
          <span className="text-[11px] font-semibold rounded-full px-2.5 py-1" style={{ color: "#B5566B", background: "#FBE9EC" }}>
            Not configured
          </span>
        )}
      </div>
      <PasswordInput
        value={value}
        onChange={setValue}
        placeholder="Leave blank to keep current value"
        className="w-full text-sm mb-3"
        style={{ border: "1.5px solid var(--portal-line, rgba(22,48,43,0.12))", borderRadius: 10, padding: "10px 14px", outline: "none" }}
        autoComplete="off"
      />
      {error && (
        <p className="text-sm mb-2" style={{ color: "#B5566B" }}>
          {error}
        </p>
      )}
      {saved && (
        <p className="text-sm mb-2" style={{ color: "var(--portal-emerald)" }}>
          Saved — live immediately.
        </p>
      )}
      <button
        onClick={save}
        disabled={saving || !value.trim()}
        className="text-sm px-5 py-2.5 rounded-full text-white font-bold cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed hover:scale-105 active:scale-95 transition-transform duration-150"
        style={{ background: "var(--portal-emerald)", boxShadow: value.trim() ? "0 3px 10px rgba(31,111,84,0.3)" : "none" }}
      >
        {saving ? "Saving…" : "Save"}
      </button>
    </div>
  );
}
