import { createAdminClient } from "@/lib/supabase/server";
import { loadTargetsWithActuals } from "@/lib/insightsTargetsServer";

// Everything the home page's "My day" section shows for one employee.
// Read with the service role, always filtered to this employee's own
// email / id, because approval rows aren't covered by the RLS policies
// the home page client would otherwise read through.

export type WaitingItem = {
  kind: "finance" | "speaker" | "zakat" | "training";
  title: string;
  sub: string;
  amount: number | null;
  since: string | null;
  href: string;
};

export type RequestItem = {
  kind: "finance" | "helpdesk" | "speaker";
  ref: string;
  title: string;
  amount: number | null;
  // tracking line pieces, turned into words on the client (translated)
  state: "with_approver" | "sent_back" | "approved" | "processing" | "paid" | "denied" | "open" | "pending_am" | "pending_leadership" | "on_hold";
  who: string | null;
  since: string | null;
  typicalDays: number | null;
  href: string;
};

export type OfficeGoal = { metric: "fundraising" | "people_served" | "value_of_services" | "budget"; goal: number; actual: number; unit: "money" | "count" };
export type MyDayData = {
  waiting: WaitingItem[];
  requests: RequestItem[];
  office: { name: string; year: number; goals: OfficeGoal[] } | null;
};

const DAY = 86400000;

export async function loadMyDay(emp: { id: string; email: string; role: string | null }, opts: { trainingDue: number }): Promise<MyDayData> {
  const admin = createAdminClient();
  const email = emp.email;

  const [finApprovals, speakerApprovals, zakatApprovals, myTickets, myHelpdesk, mySpeaker, me] = await Promise.all([
    admin
      .from("finance_approvals")
      .select("approval_token, created_at, acting_as_delegate_for_email, chain_person_name, finance_tickets!inner(ticket_number, title, total, status, employees:requestor_id(first_name, last_name))")
      .eq("is_current_step", true)
      .eq("approval_status", "pending")
      .eq("finance_tickets.status", "pending")
      .ilike("approver_email", email)
      .order("created_at")
      .limit(20),
    admin
      .from("speaker_request_approvals")
      .select("approval_token, created_at, gate, speaker_requests!inner(request_number, speaker_name, event_type, total_cost, status, coordinator_name)")
      .eq("decision", "pending")
      .in("speaker_requests.status", ["pending_am", "pending_leadership"])
      .ilike("approver_email", email)
      .limit(20),
    admin
      .from("zakat_application_approvals")
      .select("approval_token, created_at, zakat_applications!inner(application_number, applicant_name, amount_requested, category, status)")
      .eq("decision", "pending")
      .not("zakat_applications.status", "in", "(approved,rejected,paid,voided)")
      .ilike("approver_email", email)
      .limit(20),
    admin
      .from("finance_tickets")
      .select("id, ticket_number, title, total, status, submitted_at, updated_at, technician_ended_at")
      .eq("requestor_id", emp.id)
      .order("created_at", { ascending: false })
      .limit(25),
    admin
      .from("helpdesk_requests")
      .select("id, ticket_number, title, created_at, overall_status")
      .ilike("submitted_by_email", email)
      .neq("overall_status", "closed")
      .order("created_at", { ascending: false })
      .limit(10),
    admin
      .from("speaker_requests")
      .select("id, request_number, speaker_name, status, created_at, total_cost")
      .eq("coordinator_id", emp.id)
      .in("status", ["pending_am", "pending_leadership"])
      .limit(10),
    admin.from("employees").select("assigned_office_id").eq("id", emp.id).maybeSingle(),
  ]);

  // ---------- waiting on you ----------
  const waiting: WaitingItem[] = [];
  for (const a of (finApprovals.data ?? []) as any[]) {
    const t = a.finance_tickets;
    const who = [t.employees?.first_name, t.employees?.last_name].filter(Boolean).join(" ");
    waiting.push({
      kind: "finance",
      title: t.title,
      sub: [t.ticket_number, who, a.acting_as_delegate_for_email ? `covering for ${a.chain_person_name}` : null].filter(Boolean).join(" · "),
      amount: Number(t.total),
      since: a.created_at,
      href: `/finance-ticket-approvals/${a.approval_token}`,
    });
  }
  for (const a of (speakerApprovals.data ?? []) as any[]) {
    const r = a.speaker_requests;
    waiting.push({
      kind: "speaker",
      title: `Speaker: ${r.speaker_name ?? "request"}`,
      sub: [r.request_number, r.coordinator_name, a.gate === "leadership" ? "leadership sign-off" : null].filter(Boolean).join(" · "),
      amount: r.total_cost != null ? Number(r.total_cost) : null,
      since: a.created_at,
      href: `/speaker-requests/approve/${a.approval_token}`,
    });
  }
  for (const a of (zakatApprovals.data ?? []) as any[]) {
    const z = a.zakat_applications;
    waiting.push({
      kind: "zakat",
      title: `Zakat: ${z.applicant_name ?? "application"}`,
      sub: [z.application_number, z.category].filter(Boolean).join(" · "),
      amount: z.amount_requested != null ? Number(z.amount_requested) : null,
      since: a.created_at,
      href: `/zakat-approval/${a.approval_token}`,
    });
  }
  waiting.sort((x, y) => (x.since ?? "").localeCompare(y.since ?? ""));
  if (opts.trainingDue > 0) {
    waiting.push({ kind: "training", title: String(opts.trainingDue), sub: "", amount: null, since: null, href: "/training" });
  }

  // ---------- your requests (package-style tracking) ----------
  const tickets = (myTickets.data ?? []) as any[];
  const recentCutoff = Date.now() - 14 * DAY;
  const shown = tickets.filter((t) => {
    if (["pending", "fixing", "open", "in_progress", "on_hold"].includes(t.status)) return true;
    const when = Date.parse(t.technician_ended_at ?? t.updated_at ?? t.submitted_at ?? "");
    return (t.status === "processed" || t.status === "denied") && when > recentCutoff;
  });

  // Current approver for each pending ticket, plus how fast they usually decide.
  const pendingIds = shown.filter((t) => t.status === "pending").map((t) => t.id);
  const current: Record<string, { name: string; email: string; since: string }> = {};
  const typical: Record<string, number> = {};
  if (pendingIds.length) {
    const { data: steps } = await admin
      .from("finance_approvals")
      .select("finance_ticket_id, approver_name, approver_email, created_at")
      .in("finance_ticket_id", pendingIds)
      .eq("is_current_step", true)
      .eq("approval_status", "pending");
    for (const s of steps ?? []) current[s.finance_ticket_id] = { name: s.approver_name, email: s.approver_email, since: s.created_at };
    const emails = Array.from(new Set(Object.values(current).map((c) => c.email.toLowerCase())));
    if (emails.length) {
      const { data: history } = await admin
        .from("finance_approvals")
        .select("approver_email, created_at, decision_date")
        .in("approver_email", emails)
        .not("decision_date", "is", null)
        .order("decision_date", { ascending: false })
        .limit(500);
      const by: Record<string, number[]> = {};
      for (const h of history ?? []) {
        const d = (Date.parse(h.decision_date) - Date.parse(h.created_at)) / DAY;
        if (d >= 0) (by[h.approver_email.toLowerCase()] ??= []).push(d);
      }
      for (const [e, ds] of Object.entries(by)) {
        if (ds.length < 3) continue; // too few to call it "usually"
        const sorted = ds.slice(0, 20).sort((a, b) => a - b);
        typical[e] = Math.max(1, Math.round(sorted[Math.floor(sorted.length / 2)]));
      }
    }
  }

  const requests: RequestItem[] = shown.map((t) => {
    const c = current[t.id];
    const state: RequestItem["state"] =
      t.status === "pending" ? (c ? "with_approver" : "on_hold")
      : t.status === "fixing" ? "sent_back"
      : t.status === "open" ? "approved"
      : t.status === "in_progress" ? "processing"
      : t.status === "processed" ? "paid"
      : t.status === "denied" ? "denied"
      : "on_hold";
    return {
      kind: "finance",
      ref: t.ticket_number,
      title: t.title,
      amount: Number(t.total),
      state,
      who: c?.name ?? null,
      since: c?.since ?? (state === "paid" ? t.technician_ended_at : t.updated_at),
      typicalDays: c ? typical[c.email.toLowerCase()] ?? null : null,
      href: `/finance-tickets/${t.id}`,
    };
  });
  for (const r of (mySpeaker.data ?? []) as any[]) {
    requests.push({ kind: "speaker", ref: r.request_number, title: `Speaker: ${r.speaker_name ?? ""}`.trim(), amount: r.total_cost != null ? Number(r.total_cost) : null, state: r.status, who: null, since: r.created_at, typicalDays: null, href: `/speaker-requests/${r.id}` });
  }
  for (const h of (myHelpdesk.data ?? []) as any[]) {
    requests.push({ kind: "helpdesk", ref: h.ticket_number ?? "", title: h.title ?? "Help desk ticket", amount: null, state: "open", who: null, since: h.created_at, typicalDays: null, href: "/helpdesk" });
  }

  // ---------- your office's goals this year ----------
  let office: MyDayData["office"] = null;
  const officeId = (me.data as { assigned_office_id?: string | null } | null)?.assigned_office_id ?? null;
  if (officeId) {
    try {
      const year = new Date().getFullYear();
      const { data: o } = await admin.from("b2s_offices").select("id, field_office, region").eq("id", officeId).maybeSingle();
      const { targets, actuals } = await loadTargetsWithActuals(year, { region: (o as any)?.region ?? null, officeId });
      const mine = targets.filter((t) => t.scope === "office" && t.scope_key === officeId && Number(t.amount) > 0);
      // Budget is shown only to the people who manage it.
      const seesBudget = ["admin", "area_manager", "regional_director", "program_director"].includes(emp.role ?? "");
      const act = (actuals as any)[`office:${officeId}`] ?? (actuals as any)[officeId] ?? {};
      const order = ["fundraising", "people_served", "value_of_services", "budget"] as const;
      const goals: OfficeGoal[] = order
        .filter((m) => m !== "budget" || seesBudget)
        .flatMap((m) => {
          const t = mine.find((x) => x.metric === m);
          return t ? [{ metric: m, goal: Number(t.amount), actual: Number(act[m] ?? 0), unit: m === "people_served" ? ("count" as const) : ("money" as const) }] : [];
        });
      if (goals.length && o) office = { name: (o as any).field_office, year, goals };
    } catch {
      office = null;
    }
  }

  return { waiting, requests, office };
}
