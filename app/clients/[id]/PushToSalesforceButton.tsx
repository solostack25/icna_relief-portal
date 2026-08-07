"use client";

import { useState } from "react";

const TABLES = {
  backpack: "b2s_client_distributions",
  service: "client_service_log",
  housing: "th_stays",
} as const;

export default function PushToSalesforceButton({
  recordId,
  table,
  alreadySynced,
  salesforceCaseId,
}: {
  recordId: string;
  table: keyof typeof TABLES;
  alreadySynced?: boolean;
  salesforceCaseId?: string | null;
}) {
  const [showNotice, setShowNotice] = useState(false);

  if (alreadySynced) {
    return (
      <span className="text-xs font-medium text-[var(--color-accent)]">
        Synced to Salesforce{salesforceCaseId ? ` · ${salesforceCaseId}` : ""}
      </span>
    );
  }

  return (
    <span className="relative inline-block">
      <button
        onClick={() => setShowNotice(true)}
        className="text-xs font-medium rounded-md border border-[var(--color-border)] px-2 py-1 text-[var(--color-text-dim)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)]"
      >
        Push to Salesforce
      </button>
      {showNotice && (
        <span
          onClick={() => setShowNotice(false)}
          className="absolute right-0 top-full mt-1 z-10 w-56 cursor-pointer rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-2.5 text-xs text-[var(--color-text-dim)] shadow-sm"
        >
          Not connected yet — Salesforce field mapping for {TABLES[table]} is TBD.
        </span>
      )}
    </span>
  );
}
