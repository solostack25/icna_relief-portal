"use client";

import { useState } from "react";

type Line = { item: string; kind: string; ok: boolean; detail: string };

// Saves the Power BI model and report definitions so reports can be mapped.
export default function ReadModelButton({ lastRead }: { lastRead: string | null }) {
  const [busy, setBusy] = useState(false);
  const [lines, setLines] = useState<Line[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function go() {
    setBusy(true);
    setError(null);
    setLines(null);
    try {
      const res = await fetch("/api/admin/powerbi/snapshot", { method: "POST" });
      const body = await res.json();
      if (body.summary) setLines(body.summary);
      if (!res.ok) setError(body.error ?? "Couldn't read the model");
    } catch {
      setError("Couldn't reach the server");
    }
    setBusy(false);
  }

  return (
    <div className="rounded-2xl px-4 py-3 text-[13px]" style={{ background: "#fff", boxShadow: "0 3px 12px rgba(22,48,43,0.06)" }}>
      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={go}
          disabled={busy}
          className="rounded-full px-4 py-1.5 text-[13px] font-semibold"
          style={{ background: "var(--portal-emerald)", color: "#fff", opacity: busy ? 0.6 : 1 }}
        >
          {busy ? "Reading… (up to a minute)" : "Read Power BI model"}
        </button>
        <span className="text-xs" style={{ color: "rgba(22,48,43,0.55)" }}>
          Saves the model&apos;s tables, measures and report layout so each report can be mapped.
          {lastRead ? ` Last read ${lastRead}.` : ""}
        </span>
      </div>
      {error && (
        <p className="text-xs mt-2" style={{ color: "#B5566B" }}>
          {error}
        </p>
      )}
      {lines && (
        <ul className="text-xs mt-2 space-y-0.5">
          {lines.map((l, i) => (
            <li key={i} style={{ color: l.ok ? "#2F6D46" : "#B5566B" }}>
              {l.ok ? "✓" : "✕"} {l.kind}: {l.item} — {l.detail}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
