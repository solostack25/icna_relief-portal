"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PillButton, api, rose } from "@/components/grantManagement/ui";

export default function GrantActions({ grantId, status, hasActiveBudget, hasDraft, isManager }: { grantId: string; status: string; hasActiveBudget: boolean; hasDraft: boolean; isManager: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function setStatus(next: string, confirmText?: string) {
    if (confirmText && !confirm(confirmText)) return;
    setBusy(true);
    setErr(null);
    let r = await api(`/api/grant-management/grants/${grantId}`, { method: "PATCH", json: { action: "status", status: next } });
    if (r.error && next === "closed" && r.error.includes("still draft")) {
      if (confirm(`${r.error}\n\nClose anyway? Those expenses stay as they are and won't count as spent.`)) {
        r = await api(`/api/grant-management/grants/${grantId}`, { method: "PATCH", json: { action: "status", status: next, force: true } });
      } else {
        setBusy(false);
        return;
      }
    }
    setBusy(false);
    if (r.error) return setErr(r.error);
    router.refresh();
  }

  return (
    <div className="flex flex-col items-end gap-2 print:hidden">
      <div className="flex flex-wrap gap-2 justify-end">
        {status !== "closed" && (
          <PillButton variant="ghost" href={`/grant-management/grants/${grantId}/budget`}>
            {hasDraft ? "Continue budget draft" : hasActiveBudget ? "Amend budget" : "Enter budget"}
          </PillButton>
        )}
        {(status === "draft" || status === "on_hold") && (
          <PillButton disabled={busy || !hasActiveBudget} onClick={() => setStatus("active")}>
            Open for spending
          </PillButton>
        )}
        {status === "active" && (
          <PillButton variant="ghost" disabled={busy} onClick={() => setStatus("on_hold", "Put this grant on hold? No new expenses can be entered until it's reopened.")}>
            Put on hold
          </PillButton>
        )}
        {status !== "closed" && status !== "draft" && (
          <PillButton variant="danger" disabled={busy} onClick={() => setStatus("closed", "Close out this grant? Budgets, expenses, documents and history are all kept, but no new spending can be entered.")}>
            Close out
          </PillButton>
        )}
        {status === "closed" && isManager && (
          <PillButton variant="ghost" disabled={busy} onClick={() => setStatus("active", "Reopen this grant for spending?")}>
            Reopen
          </PillButton>
        )}
      </div>
      {!hasActiveBudget && status === "draft" && <div className="text-xs" style={{ color: "rgba(22,48,43,0.5)" }}>Approve the budget to open it for spending.</div>}
      {err && (
        <div className="text-xs font-semibold max-w-sm text-right" style={{ color: rose }}>
          {err}
        </div>
      )}
    </div>
  );
}
