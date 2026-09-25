"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { CSSProperties, ReactNode } from "react";
import { statusColor, statusLabel } from "@/lib/resources/schema";

export const ink = "#16302B";
export const dim = "rgba(22,48,43,0.55)";
export const line = "rgba(22,48,43,0.12)";
export const emerald = "var(--portal-emerald, #1F6F54)";

export const card: CSSProperties = { background: "#fff", borderRadius: 16, padding: 18, boxShadow: "0 3px 12px rgba(22,48,43,0.06)" };
export const input: CSSProperties = { border: `1px solid ${line}`, borderRadius: 8, padding: "8px 10px", fontSize: 14, background: "#fff", width: "100%", color: ink };
export const labelStyle: CSSProperties = { fontSize: 12, fontWeight: 600, color: "rgba(22,48,43,0.7)", display: "block", marginBottom: 4 };
export const btn: CSSProperties = { background: emerald, color: "#fff", borderRadius: 10, padding: "9px 16px", fontSize: 14, fontWeight: 600, border: 0, cursor: "pointer" };
export const btnGhost: CSSProperties = { background: "#fff", color: ink, borderRadius: 10, padding: "8px 14px", fontSize: 14, fontWeight: 600, border: `1px solid ${line}`, cursor: "pointer" };

export function H1({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 14 }}>
      <h1 style={{ fontFamily: "'Fraunces', serif", fontStyle: "italic", fontWeight: 500, fontSize: 28, margin: 0, color: ink }}>{children}</h1>
      {right}
    </div>
  );
}

export function StatusPill({ status }: { status: string }) {
  const c = statusColor(status);
  return (
    <span style={{ fontSize: 12, fontWeight: 700, color: c, background: `${c}14`, border: `1px solid ${c}40`, borderRadius: 999, padding: "2px 10px", whiteSpace: "nowrap" }}>
      {statusLabel(status)}
    </span>
  );
}

export function DaysPill({ days }: { days: number }) {
  const [bg, fg, text] =
    days < 0 ? ["#FDE8E8", "#B91C1C", `Expired ${-days}d ago`] : days === 0 ? ["#FDE8E8", "#B91C1C", "Expires today"] : days <= 30 ? ["#FEF3C7", "#92400E", `${days} days`] : ["#EEF6F1", "#166534", `${days} days`];
  return <span style={{ fontSize: 12, fontWeight: 700, color: fg, background: bg, borderRadius: 999, padding: "2px 10px", whiteSpace: "nowrap" }}>{text}</span>;
}

const TABS = [
  { href: "/resources", label: "Dashboard", exact: true },
  { href: "/resources/vehicles", label: "Vehicles" },
  { href: "/resources/properties", label: "Properties" },
  { href: "/resources/drivers", label: "Drivers" },
  { href: "/resources/requests", label: "Insurance requests" },
  { href: "/resources/settings", label: "Settings" },
];

export function ResourcesNav() {
  const path = usePathname() ?? "";
  return (
    <nav aria-label="Resources" style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 20 }}>
      {TABS.map((t) => {
        const on = t.exact ? path === t.href : path.startsWith(t.href);
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={on ? "page" : undefined}
            style={{
              fontSize: 13,
              fontWeight: 600,
              padding: "7px 14px",
              borderRadius: 999,
              border: `1px solid ${on ? "transparent" : line}`,
              background: on ? emerald : "#fff",
              color: on ? "#fff" : ink,
            }}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div style={{ fontSize: 14, color: dim, padding: "14px 0" }}>{children}</div>;
}

export const fmtDate = (d?: string | null) => (d ? new Date(d.length === 10 ? d + "T12:00:00" : d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—");
export const money = (n?: number | null) => (n == null ? "—" : `$${Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
