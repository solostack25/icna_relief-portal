"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { fmtDate, money } from "@/lib/grantManagement/shared";
import { Card, Notice, PillButton, api, dim, faint, gold, ink, td, tdNum, th, thNum } from "@/components/grantManagement/ui";

type Item = { id: string; grant: string; line: string; date: string; vendor: string | null; description: string; amount: number; docs: number; doc_required: boolean; by: string; own: boolean; submitted_at: string | null };

export default function ApprovalsClient({ items }: { items: Item[] }) {
  const router = useRouter();
  const ready = items.filter((i) => !(i.doc_required && !i.docs));
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const toggle = (id: string) => setSel((s) => {
    const n = new Set(s);
    if (n.has(id)) n.delete(id);
    else n.add(id);
    return n;
  });

  async function approveSelected() {
    if (!sel.size || !confirm(`Approve ${sel.size} expense(s)?`)) return;
    setBusy(true);
    setMsg(null);
    let ok = 0;
    const errors: string[] = [];
    for (const id of sel) {
      const r = await api(`/api/grant-management/expenses/${id}/action`, { method: "POST", json: { action: "approve" } });
      if (r.error) errors.push(r.error);
      else ok++;
    }
    setBusy(false);
    setSel(new Set());
    setMsg(errors.length ? { tone: "error", text: `${ok} approved. ${errors.length} couldn't be: ${[...new Set(errors)].join("; ")}` } : { tone: "ok", text: `${ok} approved.` });
    router.refresh();
  }

  const total = items.filter((i) => sel.has(i.id)).reduce((s, i) => s + i.amount, 0);
  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <div className="text-sm" style={{ color: dim }}>
          {items.length} waiting · {money(items.reduce((s, i) => s + i.amount, 0), true)}. Open one to return or reject it with a note.
        </div>
        <div className="flex items-center gap-2">
          <button type="button" className="text-xs font-semibold" style={{ color: dim }} onClick={() => setSel(sel.size ? new Set() : new Set(ready.map((i) => i.id)))}>
            {sel.size ? "Clear" : "Select all with documents"}
          </button>
          <PillButton disabled={busy || !sel.size} onClick={approveSelected}>
            {busy ? "Approving…" : `Approve selected${sel.size ? ` (${sel.size} · ${money(total, true)})` : ""}`}
          </PillButton>
        </div>
      </div>
      {msg && (
        <div className="mb-3">
          <Notice tone={msg.tone}>{msg.text}</Notice>
        </div>
      )}
      <Card className="!p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full" style={{ borderCollapse: "separate", borderSpacing: 0 }}>
            <thead>
              <tr>
                <th style={th} />
                <th style={th}>Expense</th>
                <th style={th}>Grant · category</th>
                <th style={th}>Entered by</th>
                <th style={thNum}>Amount</th>
                <th style={th}>Docs</th>
              </tr>
            </thead>
            <tbody>
              {items.map((i) => {
                const blocked = i.doc_required && !i.docs;
                return (
                  <tr key={i.id} className="hover:bg-[#FDFBF6]">
                    <td style={{ ...td, width: 36 }}>
                      <input type="checkbox" disabled={blocked} checked={sel.has(i.id)} onChange={() => toggle(i.id)} aria-label="Select" />
                    </td>
                    <td style={td}>
                      <Link href={`/grant-management/expenses/${i.id}`} className="font-semibold hover:underline" style={{ color: ink }}>
                        {i.vendor || i.description}
                      </Link>
                      <div className="text-xs" style={{ color: dim }}>
                        {fmtDate(i.date)} {i.vendor ? `· ${i.description}` : ""}
                      </div>
                    </td>
                    <td style={td}>
                      <div className="text-xs font-semibold">{i.grant}</div>
                      <div className="text-xs" style={{ color: dim }}>
                        {i.line}
                      </div>
                    </td>
                    <td style={td}>
                      {i.by}
                      {i.own && (
                        <div className="text-[11px]" style={{ color: faint }}>
                          you
                        </div>
                      )}
                    </td>
                    <td style={tdNum}>{money(i.amount, true)}</td>
                    <td style={{ ...td, color: blocked ? gold : dim }}>{i.docs ? `📎 ${i.docs}` : blocked ? "Missing" : "n/a"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
