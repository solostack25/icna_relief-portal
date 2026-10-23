"use client";

import Link from "next/link";
import { Card, Eyebrow, Field, PageTitle, PillButton, Row } from "@/components/speaker/ui";
import { inputStyle, ink, dim, faint, emerald, gold, rose, sky, selectStyle, th, td, tdNum, thNum } from "./styles";
import { EXPENSE_STATUS_COLORS, EXPENSE_STATUS_LABELS, GRANT_STATUS_COLORS, GRANT_STATUS_LABELS, type ExpenseStatus, type GrantStatus } from "@/lib/grantManagement/shared";

// Grant Management visual kit - builds on the portal's shared Speaker
// Requests pieces (cream background, soft cards, pill buttons, Fraunces).
export { Card, Eyebrow, Field, PageTitle, PillButton, Row, inputStyle, ink, dim, faint, emerald, gold, rose, sky, selectStyle, th, td, tdNum, thNum };


export function Pill({ label, color }: { label: string; color: string }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 text-[11px] font-bold rounded-full px-2.5 py-1 whitespace-nowrap"
      style={{ color, background: `${color}14`, border: `1px solid ${color}33` }}
    >
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: color }} />
      {label}
    </span>
  );
}
export const GrantStatusPill = ({ status }: { status: GrantStatus }) => <Pill label={GRANT_STATUS_LABELS[status] ?? status} color={GRANT_STATUS_COLORS[status] ?? "#666"} />;
export const ExpenseStatusPill = ({ status }: { status: ExpenseStatus }) => <Pill label={EXPENSE_STATUS_LABELS[status] ?? status} color={EXPENSE_STATUS_COLORS[status] ?? "#666"} />;

// Spend bar: green under 90%, gold 90-100%, rose over. A tick shows how
// much of the grant period has passed, so pace is visible at a glance.
export function SpendBar({ pct, timePct, height = 8 }: { pct: number | null; timePct?: number | null; height?: number }) {
  const p = Number(pct ?? 0);
  const color = p > 100 ? rose : p >= 90 ? gold : emerald;
  return (
    <div className="relative w-full rounded-full" style={{ height, background: "rgba(22,48,43,0.08)" }} title={`${p.toFixed(1)}% spent${timePct != null ? ` · ${Number(timePct).toFixed(0)}% of period elapsed` : ""}`}>
      <div className="absolute left-0 top-0 rounded-full" style={{ height, width: `${Math.min(100, Math.max(0, p))}%`, background: color }} />
      {timePct != null && (
        <div className="absolute top-[-3px]" style={{ left: `calc(${Math.min(100, Math.max(0, Number(timePct)))}% - 1px)`, width: 2, height: height + 6, background: ink, opacity: 0.45, borderRadius: 2 }} />
      )}
    </div>
  );
}

export function Stat({ label, value, sub, tone, href }: { label: string; value: React.ReactNode; sub?: React.ReactNode; tone?: string; href?: string }) {
  const inner = (
    <Card className="!p-4 h-full">
      <div className="text-[11px] uppercase tracking-wider" style={{ color: faint, fontFamily: "'IBM Plex Mono', monospace" }}>
        {label}
      </div>
      <div className="mt-1" style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 24, fontWeight: 600, color: tone ?? ink }}>
        {value}
      </div>
      {sub && (
        <div className="text-xs mt-0.5" style={{ color: dim }}>
          {sub}
        </div>
      )}
    </Card>
  );
  return href ? (
    <Link href={href} className="block transition-transform hover:-translate-y-0.5">
      {inner}
    </Link>
  ) : (
    inner
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-sm rounded-2xl px-5 py-8 text-center" style={{ color: dim, border: "1.5px dashed var(--portal-line)", background: "rgba(255,255,255,0.5)" }}>
      {children}
    </div>
  );
}

export function Notice({ tone = "info", children }: { tone?: "info" | "warn" | "error" | "ok"; children: React.ReactNode }) {
  const c = { info: sky, warn: "#A57420", error: rose, ok: emerald }[tone];
  return (
    <div className="text-sm rounded-xl px-4 py-3" style={{ color: c, background: `${c}10`, border: `1px solid ${c}33` }}>
      {children}
    </div>
  );
}


export async function api<T = Record<string, unknown>>(url: string, init?: RequestInit & { json?: unknown }): Promise<T & { error?: string; fields?: Record<string, string> }> {
  const res = await fetch(url, {
    ...init,
    headers: init?.json !== undefined ? { "Content-Type": "application/json", ...(init?.headers ?? {}) } : init?.headers,
    body: init?.json !== undefined ? JSON.stringify(init.json) : init?.body,
  });
  let body: Record<string, unknown> = {};
  try {
    body = await res.json();
  } catch {
    body = {};
  }
  if (!res.ok && !body.error) body.error = `Request failed (${res.status})`;
  return body as T & { error?: string; fields?: Record<string, string> };
}

// Plain <a> (not next/link) so the browser downloads the file.
export function ExportButtons({ query, print = true }: { query: string; print?: boolean }) {
  const cls = "inline-flex items-center justify-center gap-2 rounded-full px-4 py-2.5 text-sm font-bold";
  const st: React.CSSProperties = { background: "#fff", color: ink, border: "1.5px solid var(--portal-line)" };
  return (
    <div className="flex flex-wrap gap-2 print:hidden">
      <a className={cls} style={st} href={`/api/grant-management/reports?${query}&format=xlsx`}>
        Excel
      </a>
      <a className={cls} style={st} href={`/api/grant-management/reports?${query}&format=csv`}>
        CSV
      </a>
      {print && (
        <button type="button" className={cls} style={st} onClick={() => window.print()}>
          Print / PDF
        </button>
      )}
    </div>
  );
}
