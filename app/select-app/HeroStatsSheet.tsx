"use client";

import { useEffect, useState } from "react";
import { useLanguage } from "@/lib/i18n/LanguageContext";
import { HERO_STATS, MAX_HERO_STATS, type HeroStatKey } from "./heroStats";

const SOURCE_STYLE: Record<string, { fg: string; bg: string }> = {
  Portal: { fg: "#1F6F54", bg: "#EAF3EF" },
  ADP: { fg: "#9A3412", bg: "#FCE7DD" },
  Managers: { fg: "#7A5A12", bg: "#FBF0DC" },
};

// Pick which numbers show in the green greeting box (up to 4, in the
// order picked).
export default function HeroStatsSheet({
  open,
  selected,
  availableKeys,
  saving,
  error,
  onClose,
  onSave,
}: {
  open: boolean;
  selected: HeroStatKey[];
  availableKeys: string[];
  saving: boolean;
  error: string | null;
  onClose: () => void;
  onSave: (keys: HeroStatKey[]) => void;
}) {
  const { t } = useLanguage();
  const [draft, setDraft] = useState<HeroStatKey[]>(selected);

  useEffect(() => {
    if (open) setDraft(selected);
  }, [open, selected]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;

  const options = HERO_STATS.filter((s) => availableKeys.includes(s.key));
  const full = draft.length >= MAX_HERO_STATS;

  const toggle = (k: HeroStatKey) =>
    setDraft((d) => (d.includes(k) ? d.filter((x) => x !== k) : d.length < MAX_HERO_STATS ? [...d, k] : d));

  return (
    <div className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center" role="dialog" aria-modal="true" aria-label="Your stats">
      <button type="button" aria-label="Cancel" className="absolute inset-0 cursor-default" style={{ background: "rgba(22,48,43,0.45)" }} onClick={onClose} />
      <div
        className="relative w-full sm:max-w-lg max-h-[90vh] flex flex-col rounded-t-3xl sm:rounded-3xl overflow-hidden"
        style={{ background: "var(--portal-sand)", boxShadow: "0 20px 60px rgba(22,48,43,0.25)" }}
      >
        <div className="px-5 sm:px-6 pt-5 pb-4" style={{ borderBottom: "1px solid var(--portal-line)" }}>
          <h2 className="m-0" style={{ fontFamily: "'Fraunces', serif", fontStyle: "italic", fontWeight: 500, fontSize: 24, color: "var(--portal-ink)" }}>
            Your stats
          </h2>
          <p className="text-sm mt-1 mb-0" style={{ color: "rgba(22,48,43,0.68)" }}>
            Pick up to {MAX_HERO_STATS} for your greeting box. {draft.length} of {MAX_HERO_STATS} chosen. Only you see this.
          </p>
        </div>

        <div className="flex-1 overflow-y-auto px-4 sm:px-5 py-4 flex flex-col gap-2">
          {options.map((s) => {
            const on = draft.includes(s.key);
            const disabled = !on && full;
            const order = draft.indexOf(s.key) + 1;
            const src = SOURCE_STYLE[s.source];
            return (
              <button
                key={s.key}
                type="button"
                onClick={() => toggle(s.key)}
                aria-pressed={on}
                disabled={disabled}
                className="flex items-center gap-3 w-full text-left rounded-2xl px-4 py-3 transition-colors"
                style={{
                  minHeight: 60,
                  background: on ? "#F2F8F5" : "#fff",
                  border: `1px solid ${on ? "var(--portal-emerald)" : "var(--portal-line)"}`,
                  opacity: disabled ? 0.55 : 1,
                  cursor: disabled ? "not-allowed" : "pointer",
                }}
              >
                <span className="flex-1 min-w-0 flex flex-col gap-0.5">
                  <span className="text-[15px] font-semibold" style={{ color: "var(--portal-ink)" }}>
                    {s.labelKey ? t(s.labelKey) : s.label}
                  </span>
                  <span className="text-[13px]" style={{ color: "rgba(22,48,43,0.68)" }}>
                    {s.desc}
                  </span>
                </span>
                <span className="text-[11px] font-semibold tracking-wide rounded-full px-2 py-0.5 flex-shrink-0" style={{ color: src.fg, background: src.bg }}>
                  {s.source.toUpperCase()}
                </span>
                <span
                  aria-hidden
                  className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold"
                  style={{
                    border: `2px solid ${on ? "var(--portal-emerald)" : "#C9C1AF"}`,
                    background: on ? "var(--portal-emerald)" : "#fff",
                    color: "#fff",
                  }}
                >
                  {on ? order : ""}
                </span>
              </button>
            );
          })}
        </div>

        <div className="px-5 sm:px-6 py-4 flex items-center justify-between gap-3" style={{ borderTop: "1px solid var(--portal-line)", paddingBottom: "calc(16px + env(safe-area-inset-bottom))" }}>
          <div className="text-sm" style={{ color: error ? "#A4262C" : "rgba(22,48,43,0.68)" }}>
            {error ?? "Numbers show in the order you pick them."}
          </div>
          <div className="flex gap-2 flex-shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="rounded-full px-4 text-sm font-semibold bg-white"
              style={{ minHeight: 44, border: "1px solid var(--portal-line)", color: "var(--portal-ink)" }}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => onSave(draft)}
              disabled={saving}
              className="rounded-full px-5 text-sm font-semibold disabled:opacity-60"
              style={{ minHeight: 44, background: "var(--portal-emerald)", color: "#fff" }}
            >
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
