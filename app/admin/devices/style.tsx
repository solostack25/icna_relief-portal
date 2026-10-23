import { COVERAGE_COLORS, COVERAGE_LABELS, type Coverage } from "@/lib/devices/shared";

// Plain (server- and client-safe) styling helpers for Device Management.
// Keep hooks out of this file: server pages import it directly.

export const ink = "#16302B";
export const dim = "rgba(22,48,43,0.6)";
export const faint = "rgba(22,48,43,0.42)";
export const line = "rgba(22,48,43,0.12)";
export const emerald = "#1F6F54";
export const gold = "#A57420";
export const rose = "#B5566B";

export const card: React.CSSProperties = {
  background: "#fff",
  borderRadius: 16,
  border: `1px solid ${line}`,
  boxShadow: "0 1px 2px rgba(22,48,43,0.04), 0 8px 24px -12px rgba(22,48,43,0.12)",
};

export function CoveragePill({ coverage }: { coverage: string }) {
  const c = COVERAGE_COLORS[coverage as Coverage] ?? "#777";
  return (
    <span
      className="inline-flex items-center gap-1.5 text-[11px] font-bold rounded-full px-2.5 py-1 whitespace-nowrap"
      style={{ color: c, background: `${c}14`, border: `1px solid ${c}33` }}
    >
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: c }} />
      {COVERAGE_LABELS[coverage as Coverage] ?? coverage}
    </span>
  );
}

export function relTime(iso: string | null | undefined) {
  if (!iso) return "Never";
  const d = (Date.now() - new Date(iso).getTime()) / 86_400_000;
  if (d < 1 / 24) return "Just now";
  if (d < 1) return `${Math.round(d * 24)}h ago`;
  if (d < 45) return `${Math.round(d)}d ago`;
  if (d < 365) return `${Math.round(d / 30)}mo ago`;
  return `${(d / 365).toFixed(1)}y ago`;
}

export function fmtDate(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
}

