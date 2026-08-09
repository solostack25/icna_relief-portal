import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  ALL_DEPARTMENTS,
  DEPARTMENT_LABELS,
  LEG_STATUS_LABELS,
  getDepartmentStaff,
  type Department,
  type LegStatus,
} from "@/lib/helpdesk";

export default async function AdminHelpdeskPage({
  searchParams,
}: {
  searchParams: Promise<{ dept?: string }>;
}) {
  const { dept } = await searchParams;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/");

  const { data: me } = await supabase
    .from("employees")
    .select("role")
    .eq("auth_user_id", user.id)
    .single();
  if (me?.role !== "admin") redirect("/select-app");

  const activeDept: Department =
    dept && ALL_DEPARTMENTS.includes(dept as Department) ? (dept as Department) : "it";

  const { data: legs } = await supabase
    .from("helpdesk_request_legs")
    .select(
      "id, status, priority, category, created_at, request_id, assigned_to_employee_id, assigned_to_raw_name"
    )
    .eq("department", activeDept)
    .in("status", ["open", "in_progress", "on_hold", "quality_assurance"])
    .order("created_at", { ascending: true });

  const requestIds = [...new Set((legs ?? []).map((l) => l.request_id))];
  const { data: requests } = await supabase
    .from("helpdesk_requests")
    .select("id, title, submitted_by")
    .in("id", requestIds.length ? requestIds : ["00000000-0000-0000-0000-000000000000"]);
  const requestMap = new Map((requests ?? []).map((r) => [r.id, r]));

  const staff = await getDepartmentStaff(supabase, activeDept);
  const staffNameById = new Map(staff.map((s) => [s.id, `${s.first_name} ${s.last_name}`]));

  // Group by whichever identity we have: a real employees.id when
  // matched, otherwise the raw name preserved from import (e.g. a
  // technician who hasn't logged into the portal yet), otherwise
  // "unassigned". Prefixed so an employee id and a raw name can never
  // collide as map keys.
  function groupKeyFor(leg: { assigned_to_employee_id: string | null; assigned_to_raw_name: string | null }) {
    if (leg.assigned_to_employee_id) return `emp:${leg.assigned_to_employee_id}`;
    if (leg.assigned_to_raw_name) return `raw:${leg.assigned_to_raw_name}`;
    return "unassigned";
  }

  const byAssignee = new Map<string, typeof legs>();
  for (const s of staff) byAssignee.set(`emp:${s.id}`, []);
  byAssignee.set("unassigned", []);

  for (const leg of legs ?? []) {
    const key = groupKeyFor(leg);
    if (!byAssignee.has(key)) byAssignee.set(key, []);
    byAssignee.get(key)!.push(leg);
  }

  // Busiest first, unassigned always last regardless of count so it
  // doesn't get lost at the top when nothing's assigned yet.
  const sortedEntries = [...byAssignee.entries()].sort((a, b) => {
    if (a[0] === "unassigned") return 1;
    if (b[0] === "unassigned") return -1;
    return b[1]!.length - a[1]!.length;
  });

  const nameFor = (key: string) => {
    if (key === "unassigned") return "Unassigned";
    if (key.startsWith("emp:")) {
      const id = key.slice(4);
      return staffNameById.get(id) ?? "Former staff";
    }
    return `${key.slice(4)} (legacy)`; // raw:NAME — not yet a portal account
  };

  return (
    <main className="min-h-screen px-4 py-12">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-semibold">Help Desk — Workload</h1>
            <p className="text-sm text-[var(--color-text-dim)]">
              Open, in progress, and on-hold tickets by team member
            </p>
          </div>
          <Link href="/admin" className="text-sm text-[var(--color-text-dim)] hover:text-[var(--color-text)]">
            ← Back to Admin
          </Link>
        </div>

        <div className="flex gap-2 mb-4 flex-wrap">
          {ALL_DEPARTMENTS.map((d) => (
            <Link
              key={d}
              href={`/admin/helpdesk?dept=${d}`}
              className={`px-3 py-1.5 rounded-lg text-sm border ${
                activeDept === d
                  ? "bg-[var(--color-accent)] text-white border-[var(--color-accent)]"
                  : "border-[var(--color-border)] text-[var(--color-text-dim)] hover:border-[var(--color-accent)]"
              }`}
            >
              {DEPARTMENT_LABELS[d]}
            </Link>
          ))}
        </div>

        <form action="/api/admin/import-it-tickets" method="POST" className="mb-8">
          <button
            formTarget="_blank"
            className="text-sm px-4 py-2.5 rounded-lg border border-[var(--color-accent)]/40 text-[var(--color-accent)] hover:border-[var(--color-accent)] cursor-pointer"
          >
            Import / Sync IT Tickets from SharePoint
          </button>
          <p className="text-xs text-[var(--color-text-dim)] mt-1.5">
            Safe to run more than once — already-imported tickets are skipped.
          </p>
        </form>

        <div className="space-y-6">
          {sortedEntries.map(([groupKey, legsForPerson]) => (
            <div
              key={groupKey}
              className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] overflow-hidden"
            >
              <div className="flex items-center justify-between px-5 py-3 bg-black/[0.03] border-b border-[var(--color-border)]">
                <span className="text-sm font-semibold">{nameFor(groupKey)}</span>
                <span className="text-xs text-[var(--color-text-dim)]">
                  {legsForPerson!.length} {legsForPerson!.length === 1 ? "ticket" : "tickets"}
                </span>
              </div>
              {legsForPerson!.length === 0 ? (
                <p className="px-5 py-4 text-xs text-[var(--color-text-dim)]">No active tickets.</p>
              ) : (
                legsForPerson!.map((leg) => {
                  const req = requestMap.get(leg.request_id);
                  return (
                    <Link
                      key={leg.id}
                      href={`/helpdesk/${leg.request_id}`}
                      className="flex items-center justify-between px-5 py-3 border-b border-[var(--color-border)] last:border-b-0 hover:bg-black/5 transition-colors"
                    >
                      <div className="min-w-0">
                        <div className="text-sm truncate">{req?.title ?? "Untitled request"}</div>
                        <div className="text-xs text-[var(--color-text-dim)]">
                          {leg.category ?? "No category"} · {leg.priority}
                        </div>
                      </div>
                      <span className="text-xs whitespace-nowrap px-2 py-0.5 rounded-full bg-[var(--color-accent)]/10 text-[var(--color-accent)]">
                        {LEG_STATUS_LABELS[leg.status as LegStatus]}
                      </span>
                    </Link>
                  );
                })
              )}
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
