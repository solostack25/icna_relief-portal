"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { ORLANDO_OFFICE_ID } from "@/lib/orlandoAutomation/config";

type LogRow = {
  id: string;
  employee_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  detail: Record<string, unknown> | null;
  created_at: string;
};

type EmployeeRow = {
  id: string;
  first_name: string | null;
  last_name: string | null;
};

export default function AuditLogPage() {
  const supabase = createClient();
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [employees, setEmployees] = useState<Map<string, EmployeeRow>>(new Map());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);

      const { data: logRows } = await supabase
        .from("distribution_audit_log")
        .select("id, employee_id, action, entity_type, entity_id, detail, created_at")
        .eq("office_id", ORLANDO_OFFICE_ID)
        .order("created_at", { ascending: false })
        .limit(200);

      const employeeIds = Array.from(
        new Set((logRows ?? []).map((l) => l.employee_id).filter(Boolean))
      ) as string[];

      const { data: employeeRows } = employeeIds.length
        ? await supabase.from("employees").select("id, first_name, last_name").in("id", employeeIds)
        : { data: [] as EmployeeRow[] };

      setLogs(logRows ?? []);
      setEmployees(new Map((employeeRows ?? []).map((e) => [e.id, e])));
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <main className="min-h-screen px-4 py-12">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-semibold">Audit Log</h1>
            <p className="text-sm text-[var(--color-text-dim)]">
              Recent staff actions on distributions and check-ins
            </p>
          </div>
          <Link
            href="/orlando-automation"
            className="text-sm text-[var(--color-text-dim)] hover:text-[var(--color-text)]"
          >
            ← Home
          </Link>
        </div>

        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] overflow-hidden">
          {loading ? (
            <p className="p-6 text-sm text-[var(--color-text-dim)]">Loading…</p>
          ) : logs.length === 0 ? (
            <p className="p-6 text-sm text-[var(--color-text-dim)]">No actions logged yet.</p>
          ) : (
            logs.map((log) => {
              const employee = log.employee_id ? employees.get(log.employee_id) : null;
              return (
                <div
                  key={log.id}
                  className="px-4 py-3 border-b border-[var(--color-border)] last:border-0"
                >
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium capitalize">
                      {log.action.replace(/_/g, " ")}
                    </span>
                    <span className="text-xs text-[var(--color-text-dim)]">
                      {new Date(log.created_at).toLocaleString()}
                    </span>
                  </div>
                  <div className="text-xs text-[var(--color-text-dim)] mt-0.5">
                    {employee ? `${employee.first_name ?? ""} ${employee.last_name ?? ""}`.trim() : "Unknown staff"}
                    {" · "}
                    {log.entity_type}
                    {log.detail ? ` · ${JSON.stringify(log.detail)}` : ""}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </main>
  );
}
