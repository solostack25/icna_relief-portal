"use client";

import type { CSSProperties, ReactNode } from "react";

export const C = {
  ink: "#16302B",
  soft: "rgba(22,48,43,0.55)",
  faint: "rgba(22,48,43,0.4)",
  line: "rgba(22,48,43,0.1)",
  emerald: "#1F6F54",
  paper: "#FFFFFF",
  tint: "#F4F3EE",
  good: "#2F6D46",
  goodBg: "#EAF3EF",
  bad: "#B5566B",
  badBg: "#F8E8EC",
  warn: "#8A6A1F",
  warnBg: "#FBF3DF",
};

export const money = (n: number | null | undefined, cents = false) =>
  n == null || !Number.isFinite(n)
    ? "—"
    : n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: cents ? 2 : 0, maximumFractionDigits: cents ? 2 : 0 });

export const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function Card({ children, style, title, right }: { children: ReactNode; style?: CSSProperties; title?: ReactNode; right?: ReactNode }) {
  return (
    <section className="rounded-2xl p-5 mb-5" style={{ background: C.paper, border: `1px solid ${C.line}`, ...style }}>
      {(title || right) && (
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          {title ? <h2 className="text-sm font-bold" style={{ color: C.ink }}>{title}</h2> : <span />}
          {right}
        </div>
      )}
      {children}
    </section>
  );
}

export function Btn({
  children,
  onClick,
  kind = "primary",
  disabled,
  href,
  type = "button",
  small,
}: {
  children: ReactNode;
  onClick?: () => void;
  kind?: "primary" | "ghost" | "danger";
  disabled?: boolean;
  href?: string;
  type?: "button" | "submit";
  small?: boolean;
}) {
  const style: CSSProperties = {
    background: kind === "primary" ? C.emerald : "transparent",
    color: kind === "primary" ? "#fff" : kind === "danger" ? C.bad : C.emerald,
    border: kind === "primary" ? "none" : `1px solid ${kind === "danger" ? "rgba(181,86,107,0.4)" : "rgba(31,111,84,0.4)"}`,
    opacity: disabled ? 0.5 : 1,
    cursor: disabled ? "default" : "pointer",
    padding: small ? "4px 12px" : "8px 16px",
    fontSize: small ? 12 : 13,
  };
  const cls = "inline-flex items-center gap-1 rounded-full font-semibold whitespace-nowrap";
  if (href)
    return (
      <a href={href} className={cls} style={style}>
        {children}
      </a>
    );
  return (
    <button type={type} onClick={onClick} disabled={disabled} className={cls} style={style}>
      {children}
    </button>
  );
}

export function Notice({ ok, children }: { ok: boolean | "warn"; children: ReactNode }) {
  const bg = ok === "warn" ? C.warnBg : ok ? C.goodBg : C.badBg;
  const fg = ok === "warn" ? C.warn : ok ? C.good : C.bad;
  return (
    <div className="text-sm rounded-xl px-4 py-3 mb-4" style={{ background: bg, color: fg }}>
      {children}
    </div>
  );
}

export const inputStyle: CSSProperties = {
  border: `1px solid ${C.line}`,
  borderRadius: 10,
  padding: "7px 10px",
  fontSize: 13,
  background: "#fff",
  color: C.ink,
  minWidth: 0,
};

export const th: CSSProperties = { textAlign: "left", fontSize: 11, fontWeight: 700, color: C.faint, padding: "6px 8px", textTransform: "uppercase", letterSpacing: 0.3, whiteSpace: "nowrap" };
export const td: CSSProperties = { padding: "7px 8px", fontSize: 13, color: C.ink, borderTop: `1px solid ${C.line}`, verticalAlign: "top" };
export const num: CSSProperties = { ...td, textAlign: "right", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" };

export async function api<T = unknown>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((j as { error?: string }).error ?? `Request failed (${res.status})`);
  return j as T;
}

export const SOURCE_LABEL: Record<string, string> = {
  manual: "Typed in",
  upload: "Uploaded file",
  qb_file: "QuickBooks export",
  qb_online: "QuickBooks Online",
  qb_desktop: "QuickBooks Desktop",
  history: "Expenditure workbook",
};
