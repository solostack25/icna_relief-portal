import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { DEPARTMENT_LABELS, LEG_STATUS_LABELS, type Department } from "@/lib/helpdesk";

export default async function HelpdeskPage({
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
    .select("id, first_name, last_name, role")
    .eq("auth_user_id", user.id)
    .single();
  if (!me) redirect("/select-app");

  let legsQuery = supabase
    .from("helpdesk_request_legs")
    .select(
      "id, department, status, priority, category, created_at, closed_at, request_id, assigned_to_employee_id, handed_off_from_leg_id"
    )
    .order("created_at", { ascending: false })
    .limit(100);

  if (dept && ["it", "hr", "marketing", "finance"].includes(dept)) {
    legsQuery = legsQuery.eq("department", dept as Department);
  }

  const { data: legs } = await legsQuery;

  const requestIds = [...new Set((legs ?? []).map((l) => l.request_id))];
  const { data: requests } = await supabase
    .from("helpdesk_requests")
    .select("id, title, submitted_by, submitted_by_email")
    .in("id", requestIds.length ? requestIds : ["00000000-0000-0000-0000-000000000000"]);
  const requestMap = new Map((requests ?? []).map((r) => [r.id, r]));

  const assigneeIds = [
    ...new Set((legs ?? []).map((l) => l.assigned_to_employee_id).filter(Boolean)),
  ] as string[];
  const { data: assignees } = await supabase
    .from("employees")
    .select("id, first_name, last_name")
    .in("id", assigneeIds.length ? assigneeIds : ["00000000-0000-0000-0000-000000000000"]);
  const assigneeMap = new Map((assignees ?? []).map((a) => [a.id, a]));

  const tabs: { key: string; label: string }[] = [
    { key: "", label: "All" },
    { key: "it", label: "IT" },
    { key: "hr", label: "HR" },
    { key: "marketing", label: "Marketing" },
    { key: "finance", label: "Finance" },
  ];

  return (
    <main className="min-h-screen px-4 py-12">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-semibold">Help Desk</h1>
            <p className="text-sm text-[var(--color-text-dim)]">
              Requests across IT, HR, Marketing, and Finance
            </p>
          </div>
          <Link
            href="/select-app"
            className="text-sm text-[var(--color-text-dim)] hover:text-[var(--color-text)]"
          >
            ← Back
          </Link>
        </div>

        <div className="flex gap-2 mb-6 flex-wrap">
          {tabs.map((t) => (
            <Link
              key={t.key}
              href={t.key ? `/helpdesk?dept=${t.key}` : "/helpdesk"}
              className={`px-3 py-1.5 rounded-lg text-sm border ${
                (dept ?? "") === t.key
                  ? "bg-[var(--color-accent)] text-white border-[var(--color-accent)]"
                  : "border-[var(--color-border)] text-[var(--color-text-dim)] hover:border-[var(--color-accent)]"
              }`}
            >
              {t.label}
            </Link>
          ))}
        </div>

        <Link
          href="/helpdesk/new"
          className="block text-center rounded-lg bg-[var(--color-accent)] text-white text-sm font-medium py-3 mb-6"
        >
          + New IT Ticket
        </Link>

        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] overflow-hidden">
          {(legs ?? []).length === 0 ? (
            <p className="p-6 text-sm text-[var(--color-text-dim)]">No tickets found.</p>
          ) : (
            (legs ?? []).map((leg) => {
              const req = requestMap.get(leg.request_id);
              const assignee = leg.assigned_to_employee_id
                ? assigneeMap.get(leg.assigned_to_employee_id)
                : null;
              return (
                <Link
                  key={leg.id}
                  href={`/helpdesk/${leg.request_id}`}
                  className="block px-5 py-4 border-b border-[var(--color-border)] last:border-b-0 hover:bg-black/5 transition-colors"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-[10px] font-bold uppercase tracking-wide text-[var(--color-accent)]">
                          {DEPARTMENT_LABELS[leg.department as Department]}
                        </span>
                        {leg.handed_off_from_leg_id && (
                          <span className="text-[10px] text-[var(--color-text-dim)]">
                            (handed off)
                          </span>
                        )}
                      </div>
                      <div className="text-sm font-medium truncate">
                        {req?.title ?? "Untitled request"}
                      </div>
                      <div className="text-xs text-[var(--color-text-dim)]">
                        {req?.submitted_by} ·{" "}
                        {assignee ? `${assignee.first_name} ${assignee.last_name}` : "Unassigned"}
                      </div>
                    </div>
                    <span className="text-xs whitespace-nowrap px-2 py-1 rounded-full bg-[var(--color-accent)]/10 text-[var(--color-accent)]">
                      {LEG_STATUS_LABELS[leg.status as keyof typeof LEG_STATUS_LABELS]}
                    </span>
                  </div>
                </Link>
              );
            })
          )}
        </div>
      </div>
    </main>
  );
}
