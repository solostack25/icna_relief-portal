"use client";

import Link from "next/link";

// Shared visual pieces for Speaker Requests - follows the portal's
// Canva-style language: cream background, soft-shadow white cards,
// pill buttons, Fraunces italic headings, IBM Plex Mono eyebrows.

export const ink = "#16302B";
export const dim = "rgba(22,48,43,0.55)";
export const faint = "rgba(22,48,43,0.4)";
export const emerald = "#1F6F54";
export const gold = "#C99A3D";
export const rose = "#B5566B";

export const STATUS_LABELS: Record<string, string> = {
  pending_am: "Waiting on Area Manager",
  pending_leadership: "Waiting on Leadership",
  approved: "Approved",
  denied: "Denied",
  cancelled: "Cancelled",
};
export const STATUS_COLORS: Record<string, string> = {
  pending_am: "#A57420",
  pending_leadership: "#A57420",
  approved: emerald,
  denied: rose,
  cancelled: "#8a8a8a",
};

export const money = (n: number | string | null | undefined) =>
  `$${Number(n ?? 0).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

export function formatWhen(iso: string, tz?: string | null) {
  try {
    return new Intl.DateTimeFormat("en-US", { timeZone: tz || undefined, weekday: "short", month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(iso));
  } catch {
    return new Date(iso).toLocaleString();
  }
}

export function eventLabel(r: { event_type: string; event_type_other?: string | null }) {
  return r.event_type === "weekly_jummah" ? "Weekly Jummah Khutbah" : `Special Program${r.event_type_other ? `: ${r.event_type_other}` : ""}`;
}

export function PageTitle({ eyebrow, title, right }: { eyebrow?: string; title: string; right?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3 mb-6">
      <div>
        {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
        <h1 style={{ fontFamily: "'Fraunces', serif", fontStyle: "italic", fontWeight: 500, fontSize: 30, margin: 0, color: ink, letterSpacing: "-0.01em" }}>{title}</h1>
      </div>
      {right}
    </div>
  );
}

export function Eyebrow({ children, color = emerald }: { children: React.ReactNode; color?: string }) {
  return (
    <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", color, marginBottom: 6 }}>{children}</div>
  );
}

export function Card({ children, className = "", style }: { children: React.ReactNode; className?: string; style?: React.CSSProperties }) {
  return (
    <div
      className={`rounded-2xl bg-white p-5 sm:p-6 ${className}`}
      style={{ border: "1px solid var(--portal-line)", boxShadow: "0 1px 2px rgba(22,48,43,0.04), 0 8px 24px -8px rgba(22,48,43,0.10)", ...style }}
    >
      {children}
    </div>
  );
}

export function StatusPill({ status }: { status: string }) {
  const c = STATUS_COLORS[status] ?? "#666";
  return (
    <span
      className="inline-flex items-center gap-1.5 text-[11px] font-bold rounded-full px-2.5 py-1 whitespace-nowrap"
      style={{ color: c, background: `${c}14`, border: `1px solid ${c}33` }}
    >
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: c }} />
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}

export function PillButton({
  children,
  onClick,
  href,
  variant = "primary",
  disabled,
  type = "button",
}: {
  children: React.ReactNode;
  onClick?: () => void;
  href?: string;
  variant?: "primary" | "ghost" | "danger";
  disabled?: boolean;
  type?: "button" | "submit";
}) {
  const styles: Record<string, React.CSSProperties> = {
    primary: { background: emerald, color: "#fff", boxShadow: "0 3px 10px rgba(31,111,84,0.3)", border: "1.5px solid " + emerald },
    ghost: { background: "#fff", color: ink, border: "1.5px solid var(--portal-line)" },
    danger: { background: "#fff", color: rose, border: `1.5px solid ${rose}55` },
  };
  const cls = "inline-flex items-center justify-center gap-2 rounded-full px-5 py-2.5 text-sm font-bold transition-transform duration-150 hover:scale-[1.03] active:scale-95 disabled:opacity-50 disabled:hover:scale-100";
  if (href) {
    return (
      <Link href={href} className={cls} style={styles[variant]}>
        {children}
      </Link>
    );
  }
  return (
    <button type={type} onClick={onClick} disabled={disabled} className={cls} style={styles[variant]}>
      {children}
    </button>
  );
}

export const inputStyle: React.CSSProperties = {
  width: "100%",
  border: "1.5px solid var(--portal-line)",
  borderRadius: 12,
  padding: "11px 14px",
  background: "#fff",
  outline: "none",
  fontSize: 14,
  color: ink,
};

// `group` renders a <div> instead of a <label> - required when the
// children contain buttons (a <label> forwards clicks to its first
// button, which re-triggers it after a re-render).
export function Field({ label, hint, required, children, error, group }: { label: string; hint?: string; required?: boolean; children: React.ReactNode; error?: string | null; group?: boolean }) {
  const Wrapper = group ? "div" : "label";
  return (
    <Wrapper className="block">
      <span className="block text-[13px] font-semibold mb-1.5" style={{ color: ink }}>
        {label}
        {required && <span style={{ color: rose }}> *</span>}
      </span>
      {children}
      {hint && !error && (
        <span className="block text-xs mt-1.5" style={{ color: faint }}>
          {hint}
        </span>
      )}
      {error && (
        <span className="block text-xs mt-1.5 font-semibold" style={{ color: rose }}>
          {error}
        </span>
      )}
    </Wrapper>
  );
}

export function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 py-2 text-sm" style={{ borderBottom: "1px dashed var(--portal-line)" }}>
      <span style={{ color: dim }}>{k}</span>
      <span className="text-right font-semibold" style={{ color: ink }}>
        {v}
      </span>
    </div>
  );
}

export function CheckStep({ done, warn, label, detail }: { done: boolean; warn?: boolean; label: string; detail?: React.ReactNode }) {
  const c = done ? emerald : warn ? rose : "rgba(22,48,43,0.25)";
  return (
    <div className="flex gap-3 py-2">
      <span
        className="mt-0.5 w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 text-[11px] font-bold"
        style={{ background: done ? emerald : "#fff", border: `2px solid ${c}`, color: "#fff" }}
      >
        {done ? "✓" : warn ? <span style={{ color: rose }}>!</span> : ""}
      </span>
      <div>
        <div className="text-sm font-semibold" style={{ color: done ? ink : warn ? rose : dim }}>
          {label}
        </div>
        {detail && (
          <div className="text-xs mt-0.5" style={{ color: faint }}>
            {detail}
          </div>
        )}
      </div>
    </div>
  );
}
