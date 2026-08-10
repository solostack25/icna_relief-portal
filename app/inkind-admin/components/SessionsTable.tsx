"use client";

import { useState } from "react";
import type { DashboardSession } from "@/lib/inkind/fetchSessions";
import { programBreakdownForSession } from "@/lib/inkind/fetchSessions";

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
