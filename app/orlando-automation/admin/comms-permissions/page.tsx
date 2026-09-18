"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { ORLANDO_OFFICE_ID } from "@/lib/orlandoAutomation/config";

type Employee = {
  id: string;
  first_name: string;
  last_name: string;
  role: string;
};

type Permissions = {
  employee_id: string;
  basic_calling: boolean;
  basic_texting: boolean;
  call_routing: boolean;
  queue_monitoring: boolean;
  transcript_access: boolean;
};

const ADVANCED_FLAGS: { key: keyof Permissions; label: string; hint: string }[] = [
  { key: "call_routing", label: "Call routing", hint: "Transfer calls, manage extensions" },
  { key: "queue_monitoring", label: "Queue monitoring", hint: "See live call queue across staff" },
  { key: "transcript_access", label: "Transcripts", hint: "View call transcripts" },
];

export default function CommsPermissionsPage() {
  const supabase = createClient();
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [permissions, setPermissions] = useState<Map<string, Permissions>>(new Map());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const { data: me } = await supabase
        .from("employees")
        .select("role")
        .eq("auth_user_id", user.id)
        .single();

      setIsAdmin(me?.role === "admin");

      const { data: emps } = await supabase
        .from("employees")
        .select("id, first_name, last_name, role")
        .eq("is_active", true)
        .eq("assigned_office_id", ORLANDO_OFFICE_ID)
        .order("first_name");
      setEmployees(emps ?? []);

      const { data: perms } = await supabase
        .from("comms_permissions")
        .select(
          "employee_id, basic_calling, basic_texting, call_routing, queue_monitoring, transcript_access"
        );
      const map = new Map<string, Permissions>();
      (perms ?? []).forEach((p) => map.set(p.employee_id, p));
      setPermissions(map);

      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function getPerms(employeeId: string): Permissions {
    return (
      permissions.get(employeeId) ?? {
        employee_id: employeeId,
        basic_calling: true,
        basic_texting: true,
        call_routing: false,
        queue_monitoring: false,
        transcript_access: false,
      }
    );
  }

  async function toggle(employeeId: string, key: keyof Permissions) {
    const current = getPerms(employeeId);
    const updated = { ...current, [key]: !current[key] };

    setPermissions((prev) => new Map(prev).set(employeeId, updated));

    await supabase.from("comms_permissions").upsert(
      {
        employee_id: employeeId,
        basic_calling: updated.basic_calling,
        basic_texting: updated.basic_texting,
        call_routing: updated.call_routing,
        queue_monitoring: updated.queue_monitoring,
        transcript_access: updated.transcript_access,
      },
      { onConflict: "employee_id" }
    );
  }

  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center px-4">
        <p className="text-sm text-[var(--color-text-dim)]">Loading…</p>
      </main>
    );
  }

  if (!isAdmin) {
    return (
      <main className="min-h-screen flex items-center justify-center px-4">
        <p className="text-sm text-[var(--color-text-dim)]">
          Admins only — contact your administrator for access.
        </p>
      </main>
    );
  }

  return (
    <main className="min-h-screen px-4 py-12">
      <div className="max-w-2xl mx-auto">
        <Link
          href="/orlando-automation"
          className="text-sm text-[var(--color-text-dim)] hover:text-[var(--color-text)]"
        >
          ← Back to home
        </Link>

        <div className="mt-4 mb-6">
          <h1 className="text-xl font-semibold">Comms Permissions</h1>
          <p className="text-sm text-[var(--color-text-dim)]">
            Everyone gets click-to-dial and basic texting by default. Grant advanced access —
            call routing, queue monitoring, transcripts — to staff who need it.
          </p>
        </div>

        <div className="space-y-3">
          {employees.map((emp) => {
            const perms = getPerms(emp.id);
            return (
              <div
                key={emp.id}
                className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4"
              >
                <div className="flex items-center justify-between mb-3">
                  <p className="text-sm font-medium">
                    {emp.first_name} {emp.last_name}
                  </p>
                  <span className="text-xs text-[var(--color-text-dim)] capitalize">
                    {emp.role.replace(/_/g, " ")}
                  </span>
                </div>
                <div className="flex flex-wrap gap-x-5 gap-y-2">
                  {ADVANCED_FLAGS.map((flag) => (
                    <label
                      key={flag.key}
                      className="flex items-start gap-2 text-sm cursor-pointer"
                      title={flag.hint}
                    >
                      <input
                        type="checkbox"
                        checked={perms[flag.key] as boolean}
                        onChange={() => toggle(emp.id, flag.key)}
                        className="mt-0.5"
                      />
                      <span>
                        {flag.label}
                        <span className="block text-xs text-[var(--color-text-dim)]">
                          {flag.hint}
                        </span>
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </main>
  );
}
