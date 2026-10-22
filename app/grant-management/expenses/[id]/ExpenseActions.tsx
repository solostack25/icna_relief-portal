"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, Eyebrow, PillButton, api, dim, inputStyle, rose } from "@/components/grantManagement/ui";

export default function ExpenseActions({ id, canSubmit, canReview, canReopen, canDelete, missingDoc }: { id: string; canSubmit: boolean; canReview: boolean; canReopen: boolean; canDelete: boolean; missingDoc: boolean }) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  if (!canSubmit && !canReview && !canReopen && !canDelete) return null;

  async function act(action: string) {
    if ((action === "reject" || action === "return" || action === "reopen") && !note.trim()) {
      setErr(action === "reject" ? "Say why it's rejected." : action === "return" ? "Say what needs fixing." : "Say why it's being reopened.");
      return;
    }
    setBusy(true);
    setErr(null);
    const r = await api(`/api/grant-management/expenses/${id}/action`, { method: "POST", json: { action, note } });
    setBusy(false);
    if (r.error) return setErr(r.error);
    setNote("");
    router.refresh();
  }
  async function del() {
    if (!confirm("Delete this expense and its documents?")) return;
    setBusy(true);
    const r = await api(`/api/grant-management/expenses/${id}`, { method: "DELETE" });
    setBusy(false);
    if (r.error) return setErr(r.error);
    router.push("/grant-management/expenses");
    router.refresh();
  }

  return (
    <Card>
      <Eyebrow>{canReview ? "Your review" : "Actions"}</Eyebrow>
      {(canReview || canReopen) && (
        <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder={canReview ? "Note (required to reject or return)" : "Reason to reopen"} style={{ ...inputStyle, minHeight: 60, marginBottom: 10 }} />
      )}
      <div className="flex flex-wrap gap-2">
        {canSubmit && (
          <PillButton disabled={busy} onClick={() => act("submit")}>
            Submit for approval
          </PillButton>
        )}
        {canReview && (
          <>
            <PillButton disabled={busy || missingDoc} onClick={() => act("approve")}>
              Approve
            </PillButton>
            <PillButton variant="ghost" disabled={busy} onClick={() => act("return")}>
              Return for correction
            </PillButton>
            <PillButton variant="danger" disabled={busy} onClick={() => act("reject")}>
              Reject
            </PillButton>
          </>
        )}
        {canReopen && (
          <PillButton variant="ghost" disabled={busy} onClick={() => act("reopen")}>
            Reopen for correction
          </PillButton>
        )}
        {canDelete && (
          <PillButton variant="danger" disabled={busy} onClick={del}>
            Delete
          </PillButton>
        )}
      </div>
      {canReview && missingDoc && (
        <div className="text-xs mt-2" style={{ color: dim }}>
          Can&apos;t approve until the receipt is attached. Return it, or add the document yourself.
        </div>
      )}
      {err && (
        <div className="text-xs font-semibold mt-2" style={{ color: rose }}>
          {err}
        </div>
      )}
    </Card>
  );
}
