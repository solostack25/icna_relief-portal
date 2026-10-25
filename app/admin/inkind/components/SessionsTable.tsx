"use client";

import { useState } from "react";
import type { DashboardSession } from "@/lib/inkind/fetchSessions";
import { programBreakdownForSession } from "@/lib/inkind/fetchSessions";
import type { SessionCharges } from "@/lib/inkind/foodBankCharges";

const usd = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// Food bank invoices with charges (Orlando-style): where the grant credit
// and the amount owed were posted, with a retry for whatever's missing.
function ChargesPanel({ charges, posting, onPost, message }: { charges: SessionCharges; posting: boolean; onPost: () => void; message?: string }) {
  const pending = charges.grant_credits.some((g) => !g.gm_expense_id) || (charges.amount_owed > 0 && !charges.finance_ticket_id);
  return (
    <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50/60 p-2 text-[11px] text-gray-700 max-w-[220px] space-y-1">
      {charges.total_charges != null && <p className="text-gray-500">Billed {usd(charges.total_charges)}</p>}
      {charges.grant_credits.map((g, i) => (
        <p key={i}>
          Grant {g.ref || g.label}: {usd(g.amount)}{" "}
          {g.gm_expense_id ? (
            <a href={`/grant-management/expenses/${g.gm_expense_id}`} className="text-brand-dark font-semibold underline">
              ✓ {g.gm_grant_code ?? "posted"}
            </a>
          ) : (
            <span className="text-amber-800">— {g.error ?? "not posted"}</span>
          )}
        </p>
      ))}
      {charges.amount_owed > 0 && (
        <p>
          Owed {usd(charges.amount_owed)}{" "}
          {charges.finance_ticket_id ? (
            <a href={`/finance-tickets/${charges.finance_ticket_id}`} className="text-brand-dark font-semibold underline">
              ✓ {charges.finance_ticket_number ?? "ticket"}
            </a>
          ) : (
            <span className="text-amber-800">— {charges.ticket_error ?? "no ticket yet"}</span>
          )}
        </p>
      )}
      {pending && (
        <button onClick={onPost} disabled={posting} className="rounded-md bg-amber-600 px-2 py-1 font-semibold text-white disabled:opacity-50">
          {posting ? "Posting…" : "Post charges"}
        </button>
      )}
      {message && <p className="text-red-600">{message}</p>}
    </div>
  );
}

export default function SessionsTable({
  sessions,
  onSynced,
}: {
  sessions: DashboardSession[];
  onSynced: (sessionId: string) => void;
}) {
  const [pushingId, setPushingId] = useState<string | null>(null);
  const [errorForId, setErrorForId] = useState<Record<string, string>>({});
  const [resendingId, setResendingId] = useState<string | null>(null);
  const [resendStatusForId, setResendStatusForId] = useState<Record<string, string>>({});
  const [chargesForId, setChargesForId] = useState<Record<string, SessionCharges>>({});
  const [postingChargesId, setPostingChargesId] = useState<string | null>(null);
  const [chargeMsgForId, setChargeMsgForId] = useState<Record<string, string>>({});

  async function postCharges(sessionId: string) {
    setPostingChargesId(sessionId);
    setChargeMsgForId((prev) => ({ ...prev, [sessionId]: "" }));
    try {
      const res = await fetch("/api/inkind-admin/food-bank/post-charges", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId }),
      });
      const r = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
      if (r.charges) setChargesForId((prev) => ({ ...prev, [sessionId]: r.charges }));
      const msg = r.error ?? (r.warnings ?? []).join(" ");
      if (msg) setChargeMsgForId((prev) => ({ ...prev, [sessionId]: msg }));
    } catch (err: any) {
      setChargeMsgForId((prev) => ({ ...prev, [sessionId]: err.message ?? "Failed" }));
    } finally {
      setPostingChargesId(null);
    }
  }

  async function resendEmail(sessionId: string) {
    setResendingId(sessionId);
    setResendStatusForId((prev) => ({ ...prev, [sessionId]: "" }));
    try {
      const res = await fetch("/api/inkind-admin/invoices/resend-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId }),
      });
      const rawBody = await res.text();
      let result: any;
      try {
        result = JSON.parse(rawBody);
      } catch {
        result = { error: `Server returned HTTP ${res.status} with a non-JSON response: ${rawBody.slice(0, 150) || "(empty)"}` };
      }
      setResendStatusForId((prev) => ({
        ...prev,
        [sessionId]: result.success ? "Sent ✓" : result.error ?? "Failed",
      }));
    } catch (err: any) {
      setResendStatusForId((prev) => ({ ...prev, [sessionId]: err.message ?? "Failed" }));
    } finally {
      setResendingId(null);
    }
  }

  async function pushToSalesforce(sessionId: string) {
    setPushingId(sessionId);
    setErrorForId((prev) => ({ ...prev, [sessionId]: "" }));
    try {
      const res = await fetch("/api/inkind-admin/salesforce/push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId }),
      });
      const rawBody = await res.text();
      let result: any;
      try {
        result = JSON.parse(rawBody);
      } catch {
        result = { error: `HTTP ${res.status}: ${rawBody.slice(0, 150) || "(empty response)"}` };
      }
      if (result.charges) setChargesForId((prev) => ({ ...prev, [sessionId]: result.charges }));
      if (result.chargeWarnings?.length) setChargeMsgForId((prev) => ({ ...prev, [sessionId]: result.chargeWarnings.join(" ") }));
      if (result.success) {
        onSynced(sessionId);
        if (result.summary) setErrorForId((prev) => ({ ...prev, [sessionId]: result.summary }));
      } else {
        setErrorForId((prev) => ({ ...prev, [sessionId]: result.summary || result.error || "Push failed" }));
      }
    } catch (err: any) {
      setErrorForId((prev) => ({ ...prev, [sessionId]: err.message ?? "Push failed" }));
    } finally {
      setPushingId(null);
    }
  }

  if (sessions.length === 0) {
    return <p className="text-gray-400 text-sm py-8 text-center">No completed donations in this period yet.</p>;
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 text-gray-500 text-left">
          <tr>
            <th className="p-3">Time / Donor</th>
            <th className="p-3">Program Invoice #</th>
            <th className="p-3">Program</th>
            <th className="p-3">Items</th>
            <th className="p-3">Value</th>
            <th className="p-3">PDF</th>
            <th className="p-3">Salesforce</th>
            <th className="p-3"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-300">
          {sessions.map((s, sIndex) => {
            const breakdown = programBreakdownForSession(s);
            const rowCount = Math.max(breakdown.length, 1);
            return breakdown.length > 0 ? (
              breakdown.map((pb, i) => (
                <tr
                  key={`${s.id}-${pb.programCode}`}
                  className={i === 0 && sIndex > 0 ? "border-t-4 border-t-gray-400" : ""}
                >
                  {i === 0 && (
                    <td className="p-3 align-top" rowSpan={rowCount}>
                      <p className="whitespace-nowrap">
                        {s.completed_at ? new Date(s.completed_at).toLocaleString() : "—"}
                      </p>
                      <p className="text-gray-500">
                        {s.donor?.name || s.donor_org_name || <span className="text-gray-400">Anonymous</span>}
                      </p>
                      <p className="text-xs text-gray-400">{s.office ?? "—"}</p>
                      {s.source === "food_bank" && (
                        <span className="inline-block mt-1 text-[11px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 font-medium">
                          Food bank{s.vendor_invoice_number ? ` · #${s.vendor_invoice_number}` : ""}
                        </span>
                      )}
                      {(chargesForId[s.id] ?? s.charges) && (
                        <ChargesPanel
                          charges={(chargesForId[s.id] ?? s.charges)!}
                          posting={postingChargesId === s.id}
                          onPost={() => postCharges(s.id)}
                          message={chargeMsgForId[s.id]}
                        />
                      )}
                      <div className="flex flex-wrap gap-1 mt-1">
                        <a
                          href={`/api/inkind-admin/invoices/donor?sessionId=${s.id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-block text-xs rounded-lg bg-gray-100 px-2 py-1 font-medium text-gray-700 hover:bg-gray-200"
                        >
                          Donor Receipt
                        </a>
                        {s.donor?.email && (
                          <button
                            onClick={() => resendEmail(s.id)}
                            disabled={resendingId === s.id}
                            className="text-xs rounded-lg bg-gray-100 px-2 py-1 font-medium text-gray-700 hover:bg-gray-200 disabled:opacity-50"
                            title={`Resend to ${s.donor.email}`}
                          >
                            {resendingId === s.id ? "Sending..." : "Resend Email"}
                          </button>
                        )}
                      </div>
                      {resendStatusForId[s.id] && (
                        <p className="text-xs text-gray-500 mt-1 max-w-[160px]">{resendStatusForId[s.id]}</p>
                      )}
                    </td>
                  )}
                  <td className="p-3 whitespace-nowrap font-mono text-xs text-brand-dark font-semibold">
                    {s.invoice_id ? `${s.invoice_id}-${pb.programCode}` : "—"}
                  </td>
                  <td className="p-3 text-gray-700">{pb.program}</td>
                  <td className="p-3 font-semibold">{pb.items}</td>
                  <td className="p-3 font-semibold">${pb.value.toFixed(2)}</td>
                  <td className="p-3 whitespace-nowrap">
                    {s.invoice_id ? (
                      <a
                        href={`/api/inkind-admin/invoices/backend?sessionId=${s.id}&program=${encodeURIComponent(pb.program)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs rounded-lg bg-gray-100 px-2 py-1.5 font-medium text-gray-700 hover:bg-gray-200"
                      >
                        Download
                      </a>
                    ) : (
                      <span className="text-gray-300 text-xs">—</span>
                    )}
                  </td>
                  {i === 0 && (
                    <>
                      <td className="p-3 align-top" rowSpan={rowCount}>
                        {s.synced_to_salesforce ? (
                          <span className="text-xs px-2 py-1 rounded-full bg-brand-light text-brand-dark font-medium">
                            Synced
                          </span>
                        ) : (
                          <span className="text-xs px-2 py-1 rounded-full bg-gray-100 text-gray-500 font-medium">
                            Not synced
                          </span>
                        )}
                      </td>
                      <td className="p-3 align-top" rowSpan={rowCount}>
                        {!s.synced_to_salesforce && (
                          <button
                            onClick={() => pushToSalesforce(s.id)}
                            disabled={pushingId === s.id}
                            className="text-xs rounded-lg bg-brand px-3 py-2 font-semibold text-white disabled:opacity-50"
                          >
                            {pushingId === s.id ? "Pushing..." : "Push to Salesforce"}
                          </button>
                        )}
                        {errorForId[s.id] && (
                          <p className="text-xs text-red-600 mt-1 max-w-xs">{errorForId[s.id]}</p>
                        )}
                      </td>
                    </>
                  )}
                </tr>
              ))
            ) : (
              <tr key={s.id} className={sIndex > 0 ? "border-t-4 border-t-gray-400" : ""}>
                <td className="p-3 align-top">
                  <p className="whitespace-nowrap">
                    {s.completed_at ? new Date(s.completed_at).toLocaleString() : "—"}
                  </p>
                  <p className="text-gray-500">
                    {s.donor?.name || s.donor_org_name || <span className="text-gray-400">Anonymous</span>}
                  </p>
                </td>
                <td className="p-3 font-mono text-xs">{s.invoice_id ?? "—"}</td>
                <td className="p-3 text-gray-400" colSpan={4}>
                  No donation lines
                </td>
                <td className="p-3">—</td>
                <td className="p-3">—</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
