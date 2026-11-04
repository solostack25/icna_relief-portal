"use client";

import { useEffect, useMemo, useState } from "react";
import { ENV_EXPORT_GROUPS, ENV_EXPORT_PRESETS } from "@/lib/envExport";

type Field = { key: string; envName: string; group: string; label: string; source: "database" | "env" };
type Recent = { id: string; by: string; keys: string[]; purpose: string | null; at: string };

const GROUP_ORDER = [...ENV_EXPORT_GROUPS.map((g) => g.title), "Other"];

// Admin > Connectors: download chosen settings as a ready-to-paste .env file
// (e.g. to set up another app's Vercel project). Every download is logged.
export default function EnvExportPanel() {
  const [open, setOpen] = useState(false);
  const [fields, setFields] = useState<Field[] | null>(null);
  const [recent, setRecent] = useState<Recent[]>([]);
  const [logReady, setLogReady] = useState(true);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [purpose, setPurpose] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const res = await fetch("/api/admin/integration-settings/export");
    const body = await res.json().catch(() => ({}));
    if (!res.ok) return setError(body.error ?? "Couldn't load settings");
    setFields(body.fields);
    setRecent(body.recent ?? []);
    setLogReady(body.logReady);
  }
  useEffect(() => {
    if (open && !fields) load();
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const groups = useMemo(() => {
    const by = new Map<string, Field[]>();
    for (const f of fields ?? []) by.set(f.group, [...(by.get(f.group) ?? []), f]);
    return GROUP_ORDER.filter((g) => by.has(g)).map((g) => ({ title: g, fields: by.get(g)! }));
  }, [fields]);
  const available = useMemo(() => new Set((fields ?? []).map((f) => f.key)), [fields]);

  function toggle(key: string, on: boolean) {
    setPicked((prev) => {
      const next = new Set(prev);
      if (on) next.add(key);
      else next.delete(key);
      return next;
    });
  }

  function applyPreset(keys: string[], label: string) {
    setPicked(new Set(keys.filter((k) => available.has(k))));
    if (!purpose) setPurpose(label);
  }

  async function download() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/integration-settings/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keys: Array.from(picked), purpose }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Export failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "portal-connectors.env";
      a.click();
      URL.revokeObjectURL(url);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Export failed");
    } finally {
      setBusy(false);
    }
  }

  const btn =
    "px-5 py-2.5 rounded-full text-sm font-bold cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed hover:scale-105 active:scale-95 transition-transform duration-150";

  return (
    <div className="mb-6" style={{ background: "#fff", borderRadius: 24, boxShadow: "0 3px 12px rgba(22,48,43,0.06)", padding: "20px 26px" }}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-bold" style={{ color: "#2F4A3E" }}>
            Export as .env
          </h2>
          <p className="text-xs" style={{ color: "rgba(22,48,43,0.5)" }}>
            Download saved keys as a .env file to paste into another app&apos;s Vercel project. Every export is logged.
          </p>
        </div>
        <button onClick={() => setOpen((o) => !o)} className={`${btn} text-white`} style={{ background: "var(--portal-emerald)" }}>
          {open ? "Close" : "Export as .env"}
        </button>
      </div>

      {open && (
        <div className="mt-5 space-y-5">
          {!fields && !error && <p className="text-sm" style={{ color: "rgba(22,48,43,0.4)" }}>Loading…</p>}
          {!logReady && (
            <p className="text-xs rounded-xl px-3 py-2" style={{ background: "#FCEFDD", color: "#A57420" }}>
              The export log table is missing, so downloads are blocked. Run supabase/integration_settings_exports_migration.sql.
            </p>
          )}

          {fields && (
            <>
              <div className="flex flex-wrap gap-2">
                {ENV_EXPORT_PRESETS.map((p) => (
                  <button
                    key={p.label}
                    onClick={() => applyPreset(p.keys, p.label)}
                    title={p.description}
                    className={`${btn} border`}
                    style={{ borderColor: "var(--portal-emerald)", color: "var(--portal-emerald)", background: "#EAF5EE" }}
                  >
                    {p.label}
                  </button>
                ))}
                {picked.size > 0 && (
                  <button onClick={() => setPicked(new Set())} className="text-xs underline" style={{ color: "rgba(22,48,43,0.5)" }}>
                    Clear selection
                  </button>
                )}
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                {groups.map((g) => {
                  const all = g.fields.every((f) => picked.has(f.key));
                  return (
                    <div key={g.title} className="rounded-2xl p-3" style={{ border: "1.5px solid rgba(22,48,43,0.08)" }}>
                      <label className="flex items-center gap-2 text-sm font-bold mb-1.5" style={{ color: "#2F4A3E" }}>
                        <input type="checkbox" checked={all} onChange={(e) => g.fields.forEach((f) => toggle(f.key, e.target.checked))} />
                        {g.title}
                      </label>
                      {g.fields.map((f) => (
                        <label key={f.key} className="flex items-center gap-2 text-xs py-0.5 pl-5" style={{ color: "rgba(22,48,43,0.75)" }}>
                          <input type="checkbox" checked={picked.has(f.key)} onChange={(e) => toggle(f.key, e.target.checked)} />
                          <span>{f.label}</span>
                          <code className="text-[10px]" style={{ color: "rgba(22,48,43,0.45)" }}>
                            {f.envName}
                          </code>
                          {f.source === "env" && (
                            <span className="text-[10px]" style={{ color: "#A57420" }}>
                              (from env var)
                            </span>
                          )}
                        </label>
                      ))}
                    </div>
                  );
                })}
              </div>

              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  value={purpose}
                  onChange={(e) => setPurpose(e.target.value)}
                  placeholder="What's this for? (saved in the log)"
                  className="flex-1 text-sm"
                  style={{ border: "1.5px solid rgba(22,48,43,0.12)", borderRadius: 10, padding: "10px 14px", outline: "none" }}
                />
                <button
                  onClick={download}
                  disabled={busy || picked.size === 0 || !logReady}
                  className={`${btn} text-white`}
                  style={{ background: "var(--portal-emerald)" }}
                >
                  {busy ? "Exporting…" : `Download .env (${picked.size})`}
                </button>
              </div>
              <p className="text-[11px]" style={{ color: "rgba(22,48,43,0.45)" }}>
                The file holds live secrets. Paste it into Vercel (Settings → Environment Variables → paste), then delete it. Don&apos;t commit it.
              </p>
            </>
          )}

          {error && (
            <p className="text-xs" style={{ color: "#B5566B" }}>
              {error}
            </p>
          )}

          {recent.length > 0 && (
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wide mb-1.5" style={{ color: "rgba(22,48,43,0.5)" }}>
                Recent exports
              </h3>
              <ul className="space-y-1">
                {recent.map((r) => (
                  <li key={r.id} className="text-xs" style={{ color: "rgba(22,48,43,0.7)" }}>
                    <span className="font-semibold">{r.by}</span> · {new Date(r.at).toLocaleString()} · {r.keys.length} key
                    {r.keys.length === 1 ? "" : "s"}
                    {r.purpose ? ` · ${r.purpose}` : ""}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
