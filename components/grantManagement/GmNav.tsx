"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { emerald, ink } from "@/components/speaker/ui";

export type NavItem = { href: string; label: string; badge?: number; exact?: boolean };

export default function GmNav({ items }: { items: NavItem[] }) {
  const path = usePathname();
  return (
    <nav className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1 print:hidden" aria-label="Grant Management">
      {items.map((it) => {
        const active = it.exact ? path === it.href : path === it.href || path.startsWith(`${it.href}/`);
        return (
          <Link
            key={it.href}
            href={it.href}
            className="inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold whitespace-nowrap transition-colors"
            style={active ? { background: emerald, color: "#fff" } : { background: "#fff", color: ink, border: "1px solid var(--portal-line)" }}
          >
            {it.label}
            {!!it.badge && (
              <span className="text-[11px] font-bold rounded-full px-1.5 min-w-[20px] text-center" style={active ? { background: "#fff", color: emerald } : { background: "#C99A3D", color: "#fff" }}>
                {it.badge}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
