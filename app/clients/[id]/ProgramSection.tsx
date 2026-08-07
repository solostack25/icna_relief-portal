"use client";

import { useState, type ReactNode } from "react";

export default function ProgramSection({
  title,
  statusBadge,
  action,
  summary,
  emptyText,
  children,
  hasHistory,
}: {
  title: string;
  statusBadge?: ReactNode;
  action?: ReactNode;
  summary?: string;
  emptyText: string;
  children?: ReactNode;
  hasHistory: boolean;
}) {
  const [open, setOpen] = useState(false);

  return (
    <section className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 mb-6">
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-sm font-medium flex items-center gap-2">
          {title}
          {statusBadge}
        </h2>
        {action}
      </div>

      <p className="text-xs text-[var(--color-text-dim)] mt-2">
        {hasHistory ? summary : emptyText}
      </p>

      {hasHistory && (
        <button
          onClick={() => setOpen((v) => !v)}
          className="text-xs font-medium text-[var(--color-accent)] mt-2 hover:underline"
        >
          {open ? "Hide history ▲" : "Show history ▼"}
        </button>
      )}

      {open && <div className="mt-3 pt-3 border-t border-[var(--color-border)]">{children}</div>}
    </section>
  );
}
