"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/admin/inkind", label: "Today" },
  { href: "/admin/inkind/weekly", label: "Weekly" },
  { href: "/admin/inkind/monthly", label: "Monthly" },
  { href: "/admin/inkind/items", label: "Items" },
  { href: "/admin/inkind/settings", label: "Settings" },
];

export default function Nav() {
  const pathname = usePathname();

  return (
    <nav className="border-b border-[var(--color-border)] bg-[var(--color-surface)]">
      <div className="max-w-5xl mx-auto flex items-center justify-between px-6 py-4">
        <div className="flex items-center gap-6">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={`text-sm font-medium ${
                pathname === l.href
                  ? "text-[var(--color-brand-dark)]"
                  : "text-[var(--color-text-dim)] hover:text-[var(--color-text)]"
              }`}
            >
              {l.label}
            </Link>
          ))}
        </div>
        <Link
          href="/select-app"
          className="text-sm text-[var(--color-text-dim)] hover:text-[var(--color-text)]"
        >
          ← Back to apps
        </Link>
      </div>
    </nav>
  );
}
