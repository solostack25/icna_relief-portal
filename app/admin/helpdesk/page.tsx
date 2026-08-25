import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  ALL_DEPARTMENTS,
  getDepartmentStaff,
  type Department,
} from "@/lib/helpdesk";
import HelpdeskWorkloadView from "./HelpdeskWorkloadView";

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
  const requestMap: Record<string, { title: string | null }> = {};
  for (const r of requests ?? []) requestMap[r.id] = { title: r.title };

  const staff = await getDepartmentStaff(supabase, activeDept);
  const staffNameById = new Map(staff.map((s) => [s.id, `${s.first_name} ${s.last_name}`]));

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

  const sortedEntries = [...byAssignee.entries()].sort((a, b) => {
    if (a[0] === "unassigned") return 1;
    if (b[0] === "unassigned") return -1;
    return b[1]!.length - a[1]!.length;
  });

  const groups = sortedEntries.map(([key, legsForPerson]) => {
    let displayNameKind: "unassigned" | "employee" | "legacy" = "unassigned";
    let displayName = "";
    if (key === "unassigned") {
      displayNameKind = "unassigned";
    } else if (key.startsWith("emp:")) {
      displayNameKind = "employee";
      displayName = staffNameById.get(key.slice(4)) ?? "";
    } else {
      displayNameKind = "legacy";
      displayName = key.slice(4);
    }
    return {
      key,
      displayNameKind,
      displayName,
      legs: (legsForPerson ?? []).map((l) => ({
        id: l.id,
        status: l.status,
        priority: l.priority,
        category: l.category,
        request_id: l.request_id,
      })),
    };
  });

  return (
    <HelpdeskWorkloadView
      allDepartments={ALL_DEPARTMENTS}
      activeDept={activeDept}
      groups={groups}
      requestMap={requestMap}
    />
  );
}
