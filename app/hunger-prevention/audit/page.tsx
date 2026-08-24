import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getHungerPreventionAccess } from "@/lib/hungerPreventionAccess";

export default async function AuditLogPage() {
  const access = await getHungerPreventionAccess();
  if (!access.ok) redirect("/select-app");

  const supabase = await createClient();

  const { data: logRows } = await supabase
    .from("distribution_audit_log")
    .select("id, employee_id, action, entity_type, entity_id, detail, created_at")
    .order("created_at", { ascending: false })
    .limit(200);

  const employeeIds = Array.from(new Set((logRows ?? []).map((l) => l.employee_id).filter(Boolean))) as string[];
  const { data: employeeRows } = employeeIds.length
    ? await supabase.from("employees").select("id, first_name, last_name").in("id", employeeIds)
    : { data: [] };
  const employeeById = new Map((employeeRows ?? []).map((e) => [e.id, e]));

  return (
    <div className="max-w-2xl mx-auto p-6">
      <Link href="/hunger-prevention" className="text-sm" style={{ color: "rgba(22,48,43,0.45)" }}>
        ← Hunger Prevention
      </Link>
      <h1 style={{ fontFamily: "'Fraunces', serif", fontStyle: "italic", fontWeight: 500, fontSize: 26, margin: "12px 0 4px" }}>
        Audit Log
      </h1>
      <p className="text-sm mb-6" style={{ color: "rgba(22,48,43,0.5)" }}>
        Recent staff actions on distributions and check-ins, across every office.
      </p>

      <div style={{ background: "#fff", borderRadius: 24, boxShadow: "0 3px 12px rgba(22,48,43,0.06)", overflow: "hidden" }}>
        {(logRows ?? []).length === 0 ? (
          <p className="p-6 text-sm" style={{ color: "rgba(22,48,43,0.4)" }}>
            No actions logged yet.
          </p>
        ) : (
          (logRows ?? []).map((log, i) => {
            const employee = log.employee_id ? employeeById.get(log.employee_id) : null;
            return (
              <div key={log.id} className="px-5 py-3.5" style={{ borderTop: i === 0 ? "none" : "1px solid var(--portal-line, rgba(22,48,43,0.06))" }}>
                <div className="flex items-center justify-between text-sm">
                  <span className="font-bold capitalize">{log.action.replace(/_/g, " ")}</span>
                  <span className="text-xs" style={{ color: "rgba(22,48,43,0.4)" }}>
                    {new Date(log.created_at).toLocaleString()}
                  </span>
                </div>
                <div className="text-xs mt-0.5" style={{ color: "rgba(22,48,43,0.45)" }}>
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
  );
}
