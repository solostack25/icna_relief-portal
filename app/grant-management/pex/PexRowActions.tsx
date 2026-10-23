"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api, dim, emerald, rose, selectStyle } from "@/components/grantManagement/ui";

export default function PexRowActions({
  id,
  status,
  pending,
  canCode,
  isManager,
  employees,
  allocated,
}: {
  id: string;
  status: string;
  pending: boolean;
  canCode: boolean;
  isManager: boolean;
  employees: { id: string; name: string }[];
  allocated: number;
}) {
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
  const open = ["unmatched", "partial"].includes(status) && !pending;
  return (
    <div className="flex flex-wrap items-center justify-end gap-3">
      {canCode ? (
        <Link href={`/grant-management/pex/${id}`} className="rounded-full px-4 py-1.5 text-sm font-bold whitespace-nowrap" style={{ background: emerald, color: "#fff" }}>
          {status === "partial" ? "Finish coding" : "Code it"}
        </Link>
      ) : (
        <Link href={`/grant-management/pex/${id}`} className="text-sm font-semibold whitespace-nowrap" style={{ color: emerald }}>
          View →
        </Link>
      )}
      {isManager && open && (
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
          {allocated === 0 && (
            <button
              type="button"
              className="text-xs font-semibold whitespace-nowrap"
              style={{ color: rose }}
              onClick={() => {
                const note = prompt("Not a grant expense. Reason (optional):");
                if (note !== null) post({ action: "ignore", note });
              }}
            >
              Not grant
            </button>
          )}
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
