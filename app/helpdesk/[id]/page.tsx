import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  DEPARTMENT_LABELS,
  LEG_STATUS_LABELS,
  getManagedDepartments,
  getDepartmentStaff,
  type Department,
  type LegStatus,
} from "@/lib/helpdesk";
import LegActions from "./LegActions";

export default async function HelpdeskRequestPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/");

  const { data: me } = await supabase
    .from("employees")
    .select("id, first_name, last_name, role, email")
    .eq("auth_user_id", user.id)
    .single();
  if (!me) redirect("/select-app");

  const { data: request } = await supabase
    .from("helpdesk_requests")
    .select("*")
    .eq("id", id)
    .single();
  if (!request) notFound();

  const { data: legs } = await supabase
    .from("helpdesk_request_legs")
    .select("*")
    .eq("request_id", id)
    .order("created_at", { ascending: true });

  const managedDepartments = await getManagedDepartments(supabase, me.id, me.role);
  const isSubmitter = request.submitted_by_email === me.email;
  const managesAnyLegDepartment = (legs ?? []).some((l) =>
    managedDepartments.includes(l.department as Department)
  );

  // View access: the person who submitted this request, or anyone
  // who manages a department this request has touched (current or
  // past leg — a Marketing manager should still see a request they
  // already handed off to IT). Admins already see everything via
  // getManagedDepartments returning all four.
  if (!isSubmitter && !managesAnyLegDepartment) redirect("/helpdesk");

  const currentLegDept = [...(legs ?? [])].reverse().find((l) => l.status !== "handed_off")
    ?.department as Department | undefined;
  const departmentStaff =
    currentLegDept && managedDepartments.includes(currentLegDept)
      ? await getDepartmentStaff(supabase, currentLegDept)
      : [];

  const legIds = (legs ?? []).map((l) => l.id);

  const { data: itDetails } = await supabase
    .from("helpdesk_leg_details_it")
    .select("*")
    .in("leg_id", legIds.length ? legIds : ["00000000-0000-0000-0000-000000000000"]);
  const itDetailsMap = new Map((itDetails ?? []).map((d) => [d.leg_id, d]));

  const assigneeIds = [...new Set((legs ?? []).map((l) => l.assigned_to_employee_id).filter(Boolean))] as string[];
  const { data: assignees } = await supabase
    .from("employees")
    .select("id, first_name, last_name")
    .in("id", assigneeIds.length ? assigneeIds : ["00000000-0000-0000-0000-000000000000"]);
  const assigneeMap = new Map((assignees ?? []).map((a) => [a.id, a]));

  const { data: comments } = await supabase
    .from("helpdesk_comments")
    .select("id, body, created_at, author_employee_id")
    .eq("request_id", id)
    .order("created_at", { ascending: true });

  const commentAuthorIds = [...new Set((comments ?? []).map((c) => c.author_employee_id).filter(Boolean))] as string[];
  const { data: commentAuthors } = await supabase
    .from("employees")
    .select("id, first_name, last_name")
    .in("id", commentAuthorIds.length ? commentAuthorIds : ["00000000-0000-0000-0000-000000000000"]);
  const authorMap = new Map((commentAuthors ?? []).map((a) => [a.id, a]));

  // The most recently created non-handed-off leg is the "current"
  // owner of this request -- that's the one action buttons apply to.
  const currentLeg = [...(legs ?? [])].reverse().find((l) => l.status !== "handed_off") ?? null;

  return (
    <main className="min-h-screen px-4 py-12">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <Link href="/helpdesk" className="text-sm text-[var(--color-text-dim)] hover:text-[var(--color-text)]">
            ← Back to Help Desk
          </Link>
          <span
            className={`text-xs px-2 py-1 rounded-full ${
              request.overall_status === "closed"
                ? "bg-black/5 text-[var(--color-text-dim)]"
                : "bg-[var(--color-accent)]/10 text-[var(--color-accent)]"
            }`}
          >
            {request.overall_status === "closed" ? "Closed" : "Open"}
          </span>
        </div>

        <h1 className="text-xl font-semibold mb-1">{request.title}</h1>
        <p className="text-sm text-[var(--color-text-dim)] mb-6">
          Submitted by {request.submitted_by} ({request.submitted_by_email}) ·{" "}
          {new Date(request.created_at).toLocaleDateString()}
        </p>

        {request.description && (
          <div className="rounded-lg bg-black/[0.03] p-4 text-sm mb-8 whitespace-pre-wrap">
            {request.description}
          </div>
        )}

        <h2 className="text-sm font-semibold mb-3 text-[var(--color-text-dim)] uppercase tracking-wide">
          Department Chain
        </h2>
        <div className="space-y-3 mb-8">
          {(legs ?? []).map((leg) => {
            const assignee = leg.assigned_to_employee_id ? assigneeMap.get(leg.assigned_to_employee_id) : null;
            const itDetail = itDetailsMap.get(leg.id);
            const isCurrent = currentLeg?.id === leg.id;
            return (
              <div
                key={leg.id}
                className={`rounded-xl border p-4 ${
                  isCurrent ? "border-[var(--color-accent)]" : "border-[var(--color-border)]"
                } bg-[var(--color-surface)]`}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold uppercase tracking-wide text-[var(--color-accent)]">
                      {DEPARTMENT_LABELS[leg.department as Department]}
                    </span>
                    {leg.handed_off_from_leg_id && (
                      <span className="text-xs text-[var(--color-text-dim)]">← handed off</span>
                    )}
                  </div>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-black/5 text-[var(--color-text-dim)]">
                    {LEG_STATUS_LABELS[leg.status as LegStatus]}
                  </span>
                </div>
                <div className="text-xs text-[var(--color-text-dim)]">
                  {leg.category ?? "No category"} · Priority: {leg.priority} ·{" "}
                  {assignee
                    ? `${assignee.first_name} ${assignee.last_name}`
                    : leg.assigned_to_raw_name
                      ? `${leg.assigned_to_raw_name} (legacy)`
                      : "Unassigned"}
                </div>
                {itDetail?.solution && (
                  <div className="mt-2 text-sm">
                    <span className="text-[var(--color-text-dim)]">Solution: </span>
                    {itDetail.solution}
                  </div>
                )}
                {itDetail?.additional_notes && (
                  <div className="mt-2 text-sm whitespace-pre-wrap">{itDetail.additional_notes}</div>
                )}

                {isCurrent && managedDepartments.includes(leg.department as Department) && (
                  <LegActions
                    legId={leg.id}
                    requestId={request.id}
                    department={leg.department}
                    status={leg.status}
                    currentUserId={me.id}
                    departmentStaff={departmentStaff}
                    assignedToEmployeeId={leg.assigned_to_employee_id}
                  />
                )}
              </div>
            );
          })}
        </div>

        <h2 className="text-sm font-semibold mb-3 text-[var(--color-text-dim)] uppercase tracking-wide">
          Comments
        </h2>
        <div className="space-y-3 mb-4">
          {(comments ?? []).length === 0 && (
            <p className="text-sm text-[var(--color-text-dim)]">No comments yet.</p>
          )}
          {(comments ?? []).map((c) => {
            const author = c.author_employee_id ? authorMap.get(c.author_employee_id) : null;
            return (
              <div key={c.id} className="text-sm border-b border-[var(--color-border)] pb-3">
                <div className="text-xs text-[var(--color-text-dim)] mb-1">
                  {author ? `${author.first_name} ${author.last_name}` : "Unknown"} ·{" "}
                  {new Date(c.created_at).toLocaleString()}
                </div>
                <div className="whitespace-pre-wrap">{c.body}</div>
              </div>
            );
          })}
        </div>

        {currentLeg && (
          <LegActions
            legId={currentLeg.id}
            requestId={request.id}
            department={currentLeg.department}
            status={currentLeg.status}
            currentUserId={me.id}
            commentOnly
          />
        )}
      </div>
    </main>
  );
}
