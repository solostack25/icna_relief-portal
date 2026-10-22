"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api, dim, emerald, rose, selectStyle } from "@/components/grantManagement/ui";

export default function PexRowActions({ id, status, canCode, isManager, employees }: { id: string; status: string; canCode: boolean; isManager: boolean; employees: { id: string; name: string }[] }) {
  const router = useRouter();
  const [assigning, setAssigning] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  async function post(json: Record<string, unknown>) {
    setErr(null);
    const r = await api(`/api/grant-management/pex/${id}`, { method: "POST", json });
    if (r.error) return setErr(r.error);
    setAssigning(false);
    router.refresh();
  }
  return (
    <div className="flex flex-wrap items-center justify-end gap-3">
      {canCode && (
        <Link href={`/grant-management/expenses/new?pex=${id}`} className="rounded-full px-4 py-1.5 text-sm font-bold" style={{ background: emerald, color: "#fff" }}>
          Code it
        </Link>
      )}
      {isManager && status === "unmatched" && (
        <>
          {assigning ? (
            <select autoFocus defaultValue="" onChange={(e) => e.target.value && post({ action: "assign", employee_id: e.target.value })} style={{ ...selectStyle, width: 180, padding: "6px 8px", fontSize: 12 }}>
              <option value="">Assign to…</option>
              {employees.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
            </select>
          ) : (
            <button type="button" className="text-xs font-semibold" style={{ color: dim }} onClick={() => setAssigning(true)}>
              Assign
            </button>
          )}
          <button type="button" className="text-xs font-semibold" style={{ color: rose }} onClick={() => confirm("Mark as not a grant expense?") && post({ action: "ignore" })}>
            Not a grant expense
          </button>
        </>
      )}
      {isManager && status === "ignored" && (
        <button type="button" className="text-xs font-semibold" style={{ color: dim }} onClick={() => post({ action: "restore" })}>
          Restore
        </button>
      )}
      {err && (
        <span className="text-xs" style={{ color: rose }}>
          {err}
        </span>
      )}
    </div>
  );
}
