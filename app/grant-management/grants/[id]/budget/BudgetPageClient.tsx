"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import BudgetEditor, { type EditLine, type LibraryCategory } from "@/components/grantManagement/BudgetEditor";
import { Card, Eyebrow, Field, Notice, PageTitle, PillButton, api, dim, faint, inputStyle } from "@/components/grantManagement/ui";

type Mode = "original_new" | "original_draft" | "amend_new" | "amend_draft";

export default function BudgetPageClient({
  grant,
  library,
  initial,
  mode,
  draftMeta,
  activeVersion,
}: {
  grant: { id: string; name: string; code: string; award: number; closed: boolean };
  library: LibraryCategory[];
  initial: EditLine[];
  mode: Mode;
  draftMeta: { reason: string; funder_approved_date: string; effective_date: string; version_no: number } | null;
  activeVersion: number | null;
}) {
  const router = useRouter();
  const [lines, setLines] = useState<EditLine[]>(initial);
  const [meta, setMeta] = useState({ reason: draftMeta?.reason ?? "", funder_approved_date: draftMeta?.funder_approved_date ?? "", effective_date: draftMeta?.effective_date ?? "" });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const amend = mode.startsWith("amend");
  const hasDraft = mode.endsWith("draft");

  async function send(action: "save" | "save_activate" | "discard") {
    if (action === "discard" && !confirm("Discard this draft? The current approved budget is unaffected.")) return;
    if (action === "save_activate" && !confirm(amend ? "Approve this amendment? It replaces the current budget; the previous version is kept in history." : "Approve this as the grant's original budget?")) return;
    setBusy(true);
    setMsg(null);
    const r = await api(`/api/grant-management/grants/${grant.id}/budget`, {
      method: "POST",
      json: { action, ...meta, lines: lines.map((l) => ({ line_id: l.line_id, category: l.category, subcategory: l.subcategory, amount: Number(l.amount) || 0 })) },
    });
    setBusy(false);
    if (r.error) return setMsg({ tone: "error", text: r.error });
    if (action === "save") {
      setMsg({ tone: "ok", text: "Draft saved. It doesn't affect the live budget until it's approved." });
      router.refresh();
      return;
    }
    router.push(`/grant-management/grants/${grant.id}?tab=${action === "discard" ? "budget" : "overview"}`);
    router.refresh();
  }

  return (
    <div className="max-w-4xl">
      <Link href={`/grant-management/grants/${grant.id}?tab=budget`} className="text-xs" style={{ color: faint }}>
        ← {grant.code}
      </Link>
      <PageTitle eyebrow={grant.name} title={amend ? `Budget amendment${draftMeta ? ` (draft v${draftMeta.version_no})` : ""}` : "Original approved budget"} />
      {grant.closed && <Notice tone="warn">This grant is closed. Reopen it to amend the budget.</Notice>}

      {amend && (
        <Card className="mb-4">
          <Eyebrow>Funder-approved revision</Eyebrow>
          <p className="text-xs mb-3" style={{ color: dim }}>
            You&apos;re changing the budget from version {activeVersion}. The original and every earlier version are kept, with who approved each one and when.
          </p>
          <div className="grid sm:grid-cols-3 gap-4">
            <Field label="Reason / funder reference" required>
              <input value={meta.reason} onChange={(e) => setMeta({ ...meta, reason: e.target.value })} style={inputStyle} placeholder="e.g. Budget modification #2 approved by program officer" />
            </Field>
            <Field label="Funder approved on">
              <input type="date" value={meta.funder_approved_date} onChange={(e) => setMeta({ ...meta, funder_approved_date: e.target.value })} style={inputStyle} />
            </Field>
            <Field label="Effective date">
              <input type="date" value={meta.effective_date} onChange={(e) => setMeta({ ...meta, effective_date: e.target.value })} style={inputStyle} />
            </Field>
          </div>
        </Card>
      )}

      <Card>
        <Eyebrow>Budget lines</Eyebrow>
        <p className="text-xs mb-3" style={{ color: dim }}>
          Use the structure from the funder&apos;s approved budget. Staff can only code expenses to these lines.
        </p>
        <BudgetEditor lines={lines} onChange={setLines} library={library} award={grant.award} />
      </Card>

      {msg && (
        <div className="mt-4">
          <Notice tone={msg.tone}>{msg.text}</Notice>
        </div>
      )}
      <div className="flex flex-wrap gap-2 mt-4">
        <PillButton disabled={busy || grant.closed} onClick={() => send("save_activate")}>
          {amend ? "Approve amendment" : "Approve budget"}
        </PillButton>
        <PillButton variant="ghost" disabled={busy || grant.closed} onClick={() => send("save")}>
          Save as draft
        </PillButton>
        {hasDraft && (
          <PillButton variant="danger" disabled={busy} onClick={() => send("discard")}>
            Discard draft
          </PillButton>
        )}
      </div>
    </div>
  );
}
