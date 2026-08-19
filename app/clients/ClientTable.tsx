"use client";

import Link from "next/link";
import { type ClientRow, formatDob } from "@/lib/clientSearch";

export function ClientTable({
  results,
  loading,
  errorMsg,
  query,
  officeNames = new Map(),
}: {
  results: ClientRow[];
  loading: boolean;
  errorMsg: string | null;
  query: string;
  officeNames?: Map<string, string>;
}) {
  return (
    <div className="rounded-lg border border-[var(--color-border)] bg-white overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[var(--color-border)] text-left text-xs text-[var(--color-text-dim)] uppercase tracking-wide">
            <th className="px-4 py-2.5 font-medium">Name</th>
            <th className="px-4 py-2.5 font-medium">Client ID</th>
            <th className="px-4 py-2.5 font-medium">Office</th>
            <th className="px-4 py-2.5 font-medium">DOB</th>
            <th className="px-4 py-2.5 font-medium">Phone</th>
            <th className="px-4 py-2.5 font-medium">Location</th>
          </tr>
        </thead>
        <tbody>
          {results.length === 0 && !loading && !errorMsg && (
            <tr>
              <td colSpan={6} className="px-4 py-8 text-center text-[var(--color-text-dim)]">
                {query.trim() ? "No clients match that search" : "No clients found"}
              </td>
            </tr>
          )}
          {results.map((c) => {
            const officeName = c.office_id ? officeNames.get(c.office_id) : null;
            return (
              <tr
                key={c.id}
                className="border-b border-[var(--color-border)] last:border-0 hover:bg-[var(--color-bg)] transition-colors"
              >
                <td className="px-4 py-2.5">
                  <Link
                    href={`/clients/${c.id}`}
                    className="font-medium text-[var(--color-accent)] hover:underline"
                  >
                    {c.last_name}, {c.first_name}
                  </Link>
                </td>
                <td className="px-4 py-2.5 text-[var(--color-text-dim)]">{c.client_number}</td>
                <td className="px-4 py-2.5">
                  {officeName ? (
                    <span className="inline-flex items-center rounded-full bg-[var(--color-accent)]/10 text-[var(--color-accent)] text-xs font-medium px-2 py-0.5">
                      {officeName}
                    </span>
                  ) : (
                    <span className="text-[var(--color-text-dim)]">—</span>
                  )}
                </td>
                <td className="px-4 py-2.5 text-[var(--color-text-dim)]">{formatDob(c.dob)}</td>
                <td className="px-4 py-2.5 text-[var(--color-text-dim)]">{c.phone ?? "—"}</td>
                <td className="px-4 py-2.5 text-[var(--color-text-dim)]">
                  {[c.city, c.state].filter(Boolean).join(", ") || "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
