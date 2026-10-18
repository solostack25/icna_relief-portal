import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { getFinanceAdminAccess } from "@/lib/financeAdminAccess";

export const dynamic = "force-dynamic";

const CLOSED = ["processed", "denied", "duplicate"];
const DAY = 86400000;
const days = (from: string | null, to: string | number | null = Date.now()) =>
  from && to ? Math.max(0, (new Date(to).getTime() - new Date(from).getTime()) / DAY) : null;
const ym = (d: string | null) => (d ?? "").slice(0, 7);

async function all<T>(fetchPage: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>) {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await fetchPage(from, from + 999);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if ((data ?? []).length < 1000) return out;
  }
}

// GET /api/admin/finance-tickets/dashboard?range=90d|ytd|12m|month
// Everything the Finance dashboard draws: pipeline totals, aging, approver
// bottlenecks, processing workload, spend trends and the action lists.
export async function GET(req: NextRequest) {
  const access = await getFinanceAdminAccess();
  if (!access.ok) return NextResponse.json({ error: "Not authorized" }, { status: access.status });
  const admin = createAdminClient();

  const range = req.nextUrl.searchParams.get("range") ?? "12m";
  const now = new Date();
  const rangeStart =
    range === "month"
      ? new Date(now.getFullYear(), now.getMonth(), 1)
      : range === "90d"
        ? new Date(now.getTime() - 89 * DAY)
        : range === "ytd"
          ? new Date(now.getFullYear(), 0, 1)
          : new Date(now.getFullYear(), now.getMonth() - 11, 1);
  const rangeStartIso = rangeStart.toISOString().slice(0, 10);

  try {
    const [tickets, steps, allocations, { data: offices }, { data: grants }] = await Promise.all([
      all<any>((f, t) =>
        admin
          .from("finance_tickets")
          .select(
            "id, ticket_number, title, category, total, status, priority, billing_office_id, grant_eligible, technician_id, submitted_at, created_at, technician_started_at, technician_ended_at, requestor:requestor_id(first_name, last_name), technician:technician_id(first_name, last_name)"
          )
          .order("created_at", { ascending: false })
          .range(f, t)
      ),
      all<any>((f, t) =>
        admin
          .from("finance_approvals")
          .select("finance_ticket_id, approval_level, approval_status, is_current_step, is_final_approval, chain_person_name, chain_person_job_title, approver_name, approver_email, acting_as_delegate_for_email, created_at, decision_date")
          .range(f, t)
      ),
      all<any>((f, t) => admin.from("finance_ticket_grant_allocations").select("finance_ticket_id, grant_id, allocated_amount").range(f, t)),
      admin.from("b2s_offices").select("id, field_office"),
      admin.from("grants").select("id, title, funder_name"),
    ]);
    const officeName = new Map<string, string>((offices ?? []).map((o: any) => [o.id, o.field_office]));
    const grantName = new Map<string, string>((grants ?? []).map((g: any) => [g.id, g.title ?? g.funder_name ?? "Grant"]));

    const stepsByTicket = new Map<string, any[]>();
    for (const s of steps) {
      if (!stepsByTicket.has(s.finance_ticket_id)) stepsByTicket.set(s.finance_ticket_id, []);
      stepsByTicket.get(s.finance_ticket_id)!.push(s);
    }

    const rows = tickets.map((t) => {
      const ts = stepsByTicket.get(t.id) ?? [];
      const current = CLOSED.includes(t.status) ? null : ts.find((s) => s.is_current_step && s.approval_status === "pending") ?? null;
      const finalApproved = ts.filter((s) => s.is_final_approval && s.approval_status === "approved").sort((a, b) => String(b.decision_date).localeCompare(String(a.decision_date)))[0];
      const approvedAt: string | null = finalApproved?.decision_date ?? null;
      const stage = current
        ? "approval"
        : t.status === "fixing"
          ? "fixing"
          : t.status === "on_hold"
            ? "on_hold"
            : t.status === "in_progress"
              ? "processing"
              : t.status === "open"
                ? "ready"
                : t.status === "pending"
                  ? "on_hold" // pending but no approver step: routing failed
                : t.status; // processed / denied / duplicate
      return {
        id: t.id,
        ticket_number: t.ticket_number,
        title: t.title,
        category: t.category,
        total: Number(t.total ?? 0),
        status: t.status,
        priority: t.priority,
        stage,
        grant_eligible: !!t.grant_eligible,
        office: t.billing_office_id ? officeName.get(t.billing_office_id) ?? null : null,
        requestor: t.requestor ? `${t.requestor.first_name} ${t.requestor.last_name}` : null,
        technician_id: t.technician_id,
        technician: t.technician ? `${t.technician.first_name} ${t.technician.last_name}` : null,
        submitted_at: (t.submitted_at ?? t.created_at) as string,
        approved_at: approvedAt,
        processed_at: (t.technician_ended_at ?? null) as string | null,
        waiting_on: current
          ? {
              name: current.approver_name ?? current.chain_person_name,
              title: current.chain_person_job_title,
              covering: !!current.acting_as_delegate_for_email,
              level: current.approval_level,
              since: current.created_at,
              days: Math.floor(days(current.created_at) ?? 0),
            }
          : null,
        stage_days: Math.floor(
          days(current?.created_at ?? (t.status === "in_progress" ? t.technician_started_at : approvedAt) ?? t.submitted_at ?? t.created_at) ?? 0
        ),
      };
    });

    const sum = (xs: typeof rows) => ({ count: xs.length, amount: xs.reduce((s, r) => s + r.total, 0) });
    const thisMonth = ym(now.toISOString());
    const lastMonth = ym(new Date(now.getFullYear(), now.getMonth() - 1, 15).toISOString());
    const processed = rows.filter((r) => r.status === "processed" && r.processed_at);
    const recent = (d: string | null) => !!d && Date.now() - new Date(d).getTime() <= 90 * DAY;
    const avg = (xs: (number | null)[]) => {
      const v = xs.filter((x): x is number => x != null);
      return v.length ? Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 10) / 10 : null;
    };

    const awaiting = rows.filter((r) => r.stage === "approval");
    const aging = [
      { label: "0–2 days", min: 0, max: 2 },
      { label: "3–7 days", min: 3, max: 7 },
      { label: "8–14 days", min: 8, max: 14 },
      { label: "15+ days", min: 15, max: Infinity },
    ].map((b) => {
      const xs = awaiting.filter((r) => r.waiting_on!.days >= b.min && r.waiting_on!.days <= b.max);
      return { label: b.label, ...sum(xs) };
    });

    const approvers = new Map<string, { name: string; title: string | null; count: number; amount: number; oldest: number }>();
    for (const r of awaiting) {
      const k = r.waiting_on!.name;
      const a = approvers.get(k) ?? { name: k, title: r.waiting_on!.title, count: 0, amount: 0, oldest: 0 };
      a.count++;
      a.amount += r.total;
      a.oldest = Math.max(a.oldest, r.waiting_on!.days);
      approvers.set(k, a);
    }

    const workload = new Map<string, { name: string; count: number; amount: number }>();
    for (const r of rows.filter((x) => x.stage === "processing")) {
      const k = r.technician ?? "Unassigned";
      const w = workload.get(k) ?? { name: k, count: 0, amount: 0 };
      w.count++;
      w.amount += r.total;
      workload.set(k, w);
    }

    // Spend: requested (submitted in range, not denied/duplicate) and processed by month
    const inRange = rows.filter((r) => r.submitted_at && r.submitted_at.slice(0, 10) >= rangeStartIso && !["denied", "duplicate"].includes(r.status));
    const months: string[] = [];
    for (let d = new Date(rangeStart.getFullYear(), rangeStart.getMonth(), 1); d <= now; d = new Date(d.getFullYear(), d.getMonth() + 1, 1)) months.push(ym(new Date(d.getFullYear(), d.getMonth(), 15).toISOString()));
    const monthly = months.map((m) => ({
      month: m,
      requested: inRange.filter((r) => ym(r.submitted_at) === m).reduce((s, r) => s + r.total, 0),
      processed: processed.filter((r) => ym(r.processed_at) === m).reduce((s, r) => s + r.total, 0),
    }));
    const group = (key: (r: (typeof rows)[number]) => string | null) => {
      const g = new Map<string, { label: string; count: number; amount: number }>();
      for (const r of inRange) {
        const k = key(r) ?? "Not set";
        const x = g.get(k) ?? { label: k, count: 0, amount: 0 };
        x.count++;
        x.amount += r.total;
        g.set(k, x);
      }
      return [...g.values()].sort((a, b) => b.amount - a.amount);
    };
    const inRangeIds = new Set(inRange.map((r) => r.id));
    const byGrant = new Map<string, { label: string; count: number; amount: number }>();
    for (const a of allocations) {
      if (!inRangeIds.has(a.finance_ticket_id)) continue;
      const label = grantName.get(a.grant_id) ?? "Unknown grant";
      const x = byGrant.get(label) ?? { label, count: 0, amount: 0 };
      x.count++;
      x.amount += Number(a.allocated_amount ?? 0);
      byGrant.set(label, x);
    }

    return NextResponse.json({
      range,
      range_start: rangeStartIso,
      kpis: {
        awaiting_approval: sum(awaiting),
        ready: sum(rows.filter((r) => r.stage === "ready")),
        processing: sum(rows.filter((r) => r.stage === "processing")),
        attention: sum(rows.filter((r) => r.stage === "fixing" || r.stage === "on_hold")),
        overdue_approvals: awaiting.filter((r) => r.waiting_on!.days >= 3).length,
        processed_this_month: sum(processed.filter((r) => ym(r.processed_at) === thisMonth)),
        processed_last_month: sum(processed.filter((r) => ym(r.processed_at) === lastMonth)),
        avg_days_to_approve: avg(rows.filter((r) => recent(r.approved_at)).map((r) => days(r.submitted_at, r.approved_at))),
        avg_days_to_process: avg(processed.filter((r) => recent(r.processed_at)).map((r) => days(r.approved_at ?? r.submitted_at, r.processed_at))),
      },
      aging,
      approvers: [...approvers.values()].sort((a, b) => b.oldest - a.oldest || b.count - a.count),
      workload: [...workload.values()].sort((a, b) => b.count - a.count),
      monthly,
      by_category: group((r) => r.category),
      by_office: group((r) => r.office),
      by_grant: [...byGrant.values()].sort((a, b) => b.amount - a.amount),
      tickets: rows.filter((r) => !CLOSED.includes(r.status)),
      recently_processed: processed.sort((a, b) => String(b.processed_at).localeCompare(String(a.processed_at))).slice(0, 8),
      me: access.employeeId,
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
