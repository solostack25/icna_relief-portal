"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// One finance-tickets area instead of separate sidebar screens:
// the ticket queue (with who each ticket is waiting on), out-of-office
// approval coverage, and the PEX card registry.
const TABS = [
  { href: "/admin/finance-tickets", label: "Ticket Queue" },
  { href: "/admin/finance-tickets/approvals", label: "Approval Coverage" },
  { href: "/admin/finance-tickets/pex-cards", label: "PEX Cards" },
];

export default function FinanceTabs() {
  const pathname = usePathname();
  return (
    <nav style={{ display: "flex", gap: 4, borderBottom: "1px solid rgba(22,48,43,0.1)", marginBottom: 24, flexWrap: "wrap" }} aria-label="Finance tickets">
      {TABS.map((t) => {
        const active = t.href === "/admin/finance-tickets" ? pathname === t.href : pathname.startsWith(t.href);
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={active ? "page" : undefined}
            style={{
              padding: "8px 14px",
              fontSize: 13,
              fontWeight: 600,
              marginBottom: -1,
              borderBottom: active ? "2px solid #8A5FB5" : "2px solid transparent",
              color: active ? "#8A5FB5" : "rgba(22,48,43,0.6)",
            }}
          >
            {t.label}
          </Link>
        );
      })}
      <Link href="/finance-tickets" style={{ marginLeft: "auto", padding: "8px 4px", fontSize: 12, fontWeight: 600, color: "rgba(22,48,43,0.55)" }}>
        My tickets →
      </Link>
    </nav>
  );
}
