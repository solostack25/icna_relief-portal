"use client";

import { useMemo, useState } from "react";
import { card, dim, emerald, faint, gold, ink, line, rose } from "../../devices/style";

export type ScoreControl = {
  id: string;
  title: string;
  category: string | null;
  service: string | null;
  max_score: number | null;
  current_score: number | null;
  implementation_status: string | null;
  implementation_cost: string | null;
  user_impact: string | null;
  tier: string | null;
  threats: string[];
  remediation_impact: string | null;
  action_url: string | null;
  rank: number | null;
  deprecated: boolean;
  remediationText: string;
  gain: number;
};

const LEVEL_COLOR: Record<string, string> = { low: emerald, moderate: gold, high: rose };

export default function ScoreClient({ controls, current, max, initialOpen }: { controls: ScoreControl[]; current: number | null; max: number | null; initialOpen: string | null }) {
  const [view, setView] = useState<"todo" | "done" | "all">("todo");
  const [category, setCategory] = useState("");
  const [impact, setImpact] = useState("");
  const [open, setOpen] = useState<string | null>(initialOpen);

  const categories = useMemo(() => Array.from(new Set(controls.map((c) => c.category).filter(Boolean) as string[])).sort(), [controls]);
  const list = useMemo(
    () =>
      controls
        .filter((c) => (view === "todo" ? c.gain > 0 : view === "done" ? c.gain <= 0 : true))
        .filter((c) => !category || c.category === category)
        .filter((c) => !impact || (c.user_impact ?? "").toLowerCase() === impact)
        .sort((a, b) => b.gain - a.gain || (a.rank ?? 999) - (b.rank ?? 999)),
    [controls, view, category, impact]
  );
  const available = controls.reduce((s, c) => s + Math.max(0, c.gain), 0);
  const quickWins = controls.filter((c) => c.gain > 0 && (c.user_impact ?? "").toLowerCase() === "low");

  const field = "rounded-xl px-3 py-2 text-sm bg-white outline-none";
  const fieldStyle = { border: `1.5px solid ${line}`, color: ink };

  return (
    <div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
        {[
          { n: current != null && max ? `${Math.round((current / max) * 100)}%` : "—", label: "Current score", color: ink },
          { n: Math.round(available), label: "Points still available", color: gold },
          { n: controls.filter((c) => c.gain > 0).length, label: "Recommendations to do", color: rose },
          { n: quickWins.length, label: "Low user impact", hint: "Quick wins staff won't notice", color: emerald },
        ].map((t) => (
          <div key={t.label} className="p-4" style={card}>
            <div style={{ fontFamily: "'Fraunces', serif", fontSize: 28, fontWeight: 500, color: t.color, lineHeight: 1 }}>{t.n}</div>
            <div className="text-xs font-bold mt-1.5" style={{ color: ink }}>
              {t.label}
            </div>
            {"hint" in t && t.hint && (
              <div className="text-[11px]" style={{ color: faint }}>
                {t.hint}
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-4">
        {(
          [
            ["todo", "To do"],
            ["done", "Done"],
            ["all", "All"],
          ] as const
        ).map(([v, label]) => (
          <button
            key={v}
            type="button"
            onClick={() => setView(v)}
            className="text-xs font-bold rounded-full px-3 py-1.5 cursor-pointer"
            style={{ border: `1.5px solid ${line}`, background: view === v ? ink : "#fff", color: view === v ? "#fff" : ink }}
          >
            {label}
          </button>
        ))}
        <select value={category} onChange={(e) => setCategory(e.target.value)} className={field} style={fieldStyle}>
          <option value="">All areas</option>
          {categories.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
        <select value={impact} onChange={(e) => setImpact(e.target.value)} className={field} style={fieldStyle}>
          <option value="">Any user impact</option>
          <option value="low">Low user impact</option>
          <option value="moderate">Moderate</option>
          <option value="high">High</option>
        </select>
      </div>

      <div style={{ ...card, overflow: "hidden" }}>
        {list.length === 0 && (
          <div className="p-8 text-center text-sm" style={{ color: dim }}>
            Nothing here.
          </div>
        )}
        {list.map((c) => {
          const isOpen = open === c.id;
          return (
            <div key={c.id} style={{ borderTop: `1px solid ${line}` }}>
              <button type="button" onClick={() => setOpen(isOpen ? null : c.id)} className="w-full text-left px-4 py-3 flex items-start justify-between gap-3 cursor-pointer">
                <div className="min-w-0">
                  <div className="font-bold text-sm" style={{ color: ink }}>
                    {c.title}
                  </div>
                  <div className="text-xs mt-0.5 flex flex-wrap gap-x-3" style={{ color: faint }}>
                    {c.category && <span>{c.category}</span>}
                    {c.service && <span>{c.service}</span>}
                    {c.user_impact && <span style={{ color: LEVEL_COLOR[c.user_impact.toLowerCase()] ?? faint }}>User impact: {c.user_impact.toLowerCase()}</span>}
                    {c.implementation_cost && <span>Effort: {c.implementation_cost.toLowerCase()}</span>}
                    {c.implementation_status && <span>{c.implementation_status}</span>}
                  </div>
                </div>
                <div className="text-right whitespace-nowrap">
                  <div className="text-sm font-bold" style={{ color: c.gain > 0 ? emerald : faint }}>
                    {c.gain > 0 ? `+${c.gain}` : "Done"}
                  </div>
                  <div className="text-[11px]" style={{ color: faint }}>
                    {c.current_score ?? 0}/{c.max_score} pts
                  </div>
                </div>
              </button>
              {isOpen && (
                <div className="px-4 pb-4 text-sm grid gap-3" style={{ color: ink }}>
                  {c.remediationText && (
                    <div>
                      <div className="text-xs font-bold uppercase tracking-wider mb-1" style={{ color: emerald }}>
                        How to fix
                      </div>
                      <div className="whitespace-pre-line">{c.remediationText}</div>
                    </div>
                  )}
                  {c.remediation_impact && (
                    <div>
                      <div className="text-xs font-bold uppercase tracking-wider mb-1" style={{ color: gold }}>
                        Effect on staff
                      </div>
                      <div className="whitespace-pre-line">{c.remediation_impact}</div>
                    </div>
                  )}
                  {c.threats.length > 0 && (
                    <div className="text-xs" style={{ color: dim }}>
                      Protects against: {c.threats.join(", ")}
                    </div>
                  )}
                  {c.action_url && (
                    <a href={c.action_url} target="_blank" rel="noopener noreferrer" className="text-xs font-bold rounded-full px-3 py-1.5 w-fit" style={{ border: `1.5px solid ${line}`, color: ink }}>
                      Open the setting in Microsoft ↗
                    </a>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
