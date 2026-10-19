import { createAdminClient } from "@/lib/supabase/server";
import { wfNumber, wfString } from "@/lib/workflowSettings";
import { graphGet, sendMailAs } from "@/lib/msgraph";
import { getIntegrationSetting } from "@/lib/integrationSettings";
import { financeApprovalEmail } from "@/lib/financeApprovalEmail";

// Ports the uploaded PowerApps solution's MainFinanceApproval Power
// Automate flow. The routing logic below is read directly from that
// flow's JSON (Do_until loop + Is_the_requestor_a_part_of_Csuite
// branch), not guessed:
//
//   - C-suite requestor: total <= $5,000 needs no further approval.
//     total <= $10,000 self-approves if the requestor's Graph job
//     title is exactly "COO". Otherwise, one CEO-level approval step
//     is created. (The source flow hardcodes a specific Dataverse
//     user id for the CEO step - here that's a Connectors setting
//     instead, since a hardcoded id would silently break the day
//     that person changes roles.)
//   - Everyone else: climb the REQUESTOR's own manager chain (via
//     Graph, same mechanism as the old finance_approval_* system) one
//     level at a time. At each level, that manager's own
//     monetary_limit (employees.monetary_limit) is checked BEFORE
//     they decide - if it covers the ticket total, their approval
//     alone is sufficient and the chain stops there; if not, an
//     approval this level even after being granted, moves to their
//     own manager next.
//
// Out-of-office reassignment reuses finance_approval_delegates /
// resolveDelegate as-is - that table already implements exactly what
// the source system's ir_UserOOO does, so it isn't rebuilt here.

// Sending mailbox and C-suite auto-approval limits are editable on
// Admin → Workflows (lib/workflowSettings.ts); defaults match the old flow.
const financeMailbox = () => wfString("wf_finance_mailbox");

async function getManagerViaGraph(
  emailOrUpn: string
): Promise<{ email: string; name: string; jobTitle: string | null } | null> {
  try {
    const manager = await graphGet(
      `/users/${encodeURIComponent(emailOrUpn)}/manager?$select=mail,userPrincipalName,displayName,jobTitle`
    );
    const email = manager.mail || manager.userPrincipalName;
    if (!email) return null;
    return { email, name: manager.displayName ?? email, jobTitle: manager.jobTitle ?? null };
  } catch {
    return null;
  }
}

async function getJobTitleViaGraph(emailOrUpn: string): Promise<string | null> {
  try {
    const user = await graphGet(`/users/${encodeURIComponent(emailOrUpn)}?$select=jobTitle`);
    return user.jobTitle ?? null;
  } catch {
    return null;
  }
}

async function resolveDelegate(email: string): Promise<{ email: string; name: string } | null> {
  const admin = createAdminClient();
  const today = new Date().toISOString().slice(0, 10);
  const { data } = await admin
    .from("finance_approval_delegates")
    .select("delegate_email, delegate_name")
    .ilike("original_email", email)
    .lte("starts_at", today)
    .or(`ends_at.is.null,ends_at.gte.${today}`)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) return null;
  return { email: data.delegate_email, name: data.delegate_name ?? data.delegate_email };
}

// A chain person's own monetary_limit, looked up by email in our own
// employees table (not Graph - this is a portal-native field with no
// AD equivalent). Null if we have no record of them or no limit set.
async function getMonetaryLimit(email: string): Promise<number | null> {
  const admin = createAdminClient();
  const { data } = await admin.from("employees").select("monetary_limit").ilike("email", email).maybeSingle();
  return data?.monetary_limit ?? null;
}

async function createApprovalStep(params: {
  ticketId: string;
  level: number;
  chainPersonEmail: string;
  chainPersonName: string;
  chainPersonJobTitle: string | null;
  threshold: number | null;
  isFinal: boolean;
  revisionNumber?: number;
}) {
  const admin = createAdminClient();
  const delegate = await resolveDelegate(params.chainPersonEmail);

  const { data: step, error } = await admin
    .from("finance_approvals")
    .insert({
      finance_ticket_id: params.ticketId,
      approval_level: params.level,
      sequence_status: "active",
      chain_person_email: params.chainPersonEmail,
      chain_person_name: params.chainPersonName,
      chain_person_job_title: params.chainPersonJobTitle,
      approver_email: delegate?.email ?? params.chainPersonEmail,
      approver_name: delegate?.name ?? params.chainPersonName,
      acting_as_delegate_for_email: delegate ? params.chainPersonEmail : null,
      approval_amount_threshold: params.threshold,
      is_current_step: true,
      is_final_approval: params.isFinal,
      revision_number: params.revisionNumber ?? 1,
    })
    .select("*")
    .single();
  if (error || !step) throw new Error(`Couldn't create approval step: ${error?.message}`);

  // The step being replaced (if any) is no longer the current one.
  await admin
    .from("finance_approvals")
    .update({ is_current_step: false })
    .eq("finance_ticket_id", params.ticketId)
    .neq("id", step.id);

  return step;
}

async function sendStepEmail(
  step: { finance_ticket_id: string; approval_level?: number; revision_number?: number; approver_email: string; approver_name: string; chain_person_name: string; acting_as_delegate_for_email: string | null; approval_token: string },
  ticket: { ticket_number: string; title: string; total: number },
  opts: { reminder?: boolean } = {}
) {
  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? "").replace(/\/$/, "");
  const link = `${siteUrl}/finance-ticket-approvals/${step.approval_token}`;

  const admin = createAdminClient();
  const { data: extra } = await admin
    .from("finance_tickets")
    .select("category, submitted_at, employees:requestor_id(first_name, last_name)")
    .eq("id", step.finance_ticket_id)
    .maybeSingle();
  const emp = (extra as unknown as { employees?: { first_name?: string; last_name?: string } } | null)?.employees;
  const requestorName = emp ? `${emp.first_name ?? ""} ${emp.last_name ?? ""}`.trim() || null : null;

  const { subject, html } = financeApprovalEmail({
    link,
    ticketNumber: ticket.ticket_number,
    title: ticket.title,
    total: ticket.total,
    category: (extra as { category?: string } | null)?.category ?? null,
    requestorName,
    submittedAt: (extra as { submitted_at?: string } | null)?.submitted_at ?? null,
    level: step.approval_level ?? 1,
    revision: step.revision_number ?? 1,
    coveringFor: step.acting_as_delegate_for_email ? step.chain_person_name : null,
    reminder: opts.reminder,
  });

  await sendMailAs({ fromMailbox: await financeMailbox(), to: step.approver_email, subject, body: html, html: true });
}

async function logAndNotifyOutcome(ticketId: string, outcome: "approved" | "denied" | "fixing", note?: string) {
  const admin = createAdminClient();
  await admin.from("finance_ticket_log").insert({
    finance_ticket_id: ticketId,
    comment: note ?? `Ticket ${outcome}.`,
    comment_type: "status_change",
    notify_user: true,
  });

  const { data: ticket } = await admin
    .from("finance_tickets")
    .select("ticket_number, title, total, requestor_id, employees:requestor_id(email)")
    .eq("id", ticketId)
    .single();
  if (!ticket) return;
  const requestorEmail = (ticket as unknown as { employees: { email: string } }).employees?.email;
  if (!requestorEmail) return;

  const subject =
    outcome === "approved"
      ? `Finance Ticket Approved: ${ticket.title} (${ticket.ticket_number})`
      : outcome === "denied"
        ? `Finance Ticket Denied: ${ticket.title} (${ticket.ticket_number})`
        : `Finance Ticket Needs Changes: ${ticket.title} (${ticket.ticket_number})`;
  const body =
    outcome === "approved"
      ? `Your finance ticket "${ticket.title}" for $${ticket.total.toLocaleString()} has been fully approved and is now ready for processing.`
      : outcome === "denied"
        ? `Your finance ticket "${ticket.title}" for $${ticket.total.toLocaleString()} was denied.${note ? `\n\nNote: ${note}` : ""}`
        : `Your finance ticket "${ticket.title}" needs changes before it can continue through approval.${note ? `\n\nNote: ${note}` : ""}`;

  const mailbox = await financeMailbox();
  await sendMailAs({ fromMailbox: mailbox, to: `${requestorEmail}; ${mailbox}`, subject, body });
}

// Kicks off (or restarts, after a Fix/resubmit) approval routing for
// a ticket.
export async function startFinanceTicketApproval(ticketId: string) {
  const admin = createAdminClient();
  const { data: ticket } = await admin
    .from("finance_tickets")
    .select("id, ticket_number, title, total, requestor_id, employees:requestor_id(email, first_name, last_name, is_csuite)")
    .eq("id", ticketId)
    .single();
  if (!ticket) throw new Error("Ticket not found");

  const requestor = (ticket as unknown as { employees: { email: string; first_name: string; last_name: string; is_csuite: boolean } }).employees;
  if (!requestor?.email) throw new Error("Requestor has no email on file");

  await admin.from("finance_tickets").update({ status: "pending" }).eq("id", ticketId);

  // --- C-suite special case ---
  if (requestor.is_csuite) {
    if (ticket.total <= (await wfNumber("wf_finance_csuite_auto_limit"))) {
      await admin.from("finance_tickets").update({ status: "open" }).eq("id", ticketId);
      await logAndNotifyOutcome(ticketId, "approved", "Auto-approved: C-suite requestor, at or under the $5,000 threshold.");
      return { outcome: "auto_approved" as const };
    }
    const jobTitle = await getJobTitleViaGraph(requestor.email);
    if (ticket.total <= (await wfNumber("wf_finance_coo_auto_limit")) && jobTitle === (await wfString("wf_finance_coo_title"))) {
      await admin.from("finance_tickets").update({ status: "open" }).eq("id", ticketId);
      await logAndNotifyOutcome(ticketId, "approved", "Auto-approved: COO self-approval, at or under the $10,000 threshold.");
      return { outcome: "auto_approved" as const };
    }

    const ceoEmail = await getIntegrationSetting("finance_ceo_email", "");
    if (!ceoEmail) {
      await admin.from("finance_tickets").update({ status: "on_hold" }).eq("id", ticketId);
      await sendMailAs({
        fromMailbox: await financeMailbox(),
        to: await financeMailbox(),
        subject: `Finance ticket needs manual CEO routing: ${ticket.ticket_number}`,
        body: `Ticket ${ticket.ticket_number} (${ticket.title}, $${ticket.total.toLocaleString()}) needs CEO approval, but no CEO email is configured in Connectors → IRFAS/Finance settings.`,
      });
      return { outcome: "stuck" as const };
    }
    const step = await createApprovalStep({
      ticketId,
      level: 1,
      chainPersonEmail: ceoEmail,
      chainPersonName: "CEO",
      chainPersonJobTitle: "CEO",
      threshold: null,
      isFinal: true,
    });
    await sendStepEmail(step, ticket);
    return { outcome: "routed" as const };
  }

  // --- Standard case: climb the requestor's own manager chain ---
  const manager = await getManagerViaGraph(requestor.email);
  if (!manager) {
    await admin.from("finance_tickets").update({ status: "on_hold" }).eq("id", ticketId);
    await sendMailAs({
      fromMailbox: await financeMailbox(),
      to: await financeMailbox(),
      subject: `Finance ticket couldn't start: no manager found for ${requestor.email}`,
      body: `Ticket ${ticket.ticket_number} needs manual routing - ${requestor.email} has no manager set in Active Directory.`,
    });
    return { outcome: "stuck" as const };
  }

  const threshold = await getMonetaryLimit(manager.email);
  const isFinal = threshold !== null && ticket.total <= threshold;
  const step = await createApprovalStep({
    ticketId,
    level: 1,
    chainPersonEmail: manager.email,
    chainPersonName: manager.name,
    chainPersonJobTitle: manager.jobTitle,
    threshold,
    isFinal,
  });
  await sendStepEmail(step, ticket);
  return { outcome: "routed" as const };
}

export async function decideFinanceTicketApproval(params: {
  token: string;
  decision: "approve" | "reject" | "fix";
  notes?: string;
}) {
  const admin = createAdminClient();

  const { data: step } = await admin.from("finance_approvals").select("*").eq("approval_token", params.token).single();
  if (!step) return { ok: false as const, error: "Approval link not found." };
  if (step.approval_status !== "pending") {
    return { ok: false as const, error: `This step was already decided (${step.approval_status}).` };
  }

  const { data: ticket } = await admin.from("finance_tickets").select("*").eq("id", step.finance_ticket_id).single();
  if (!ticket) return { ok: false as const, error: "Ticket not found." };

  const decisionMap = { approve: "approved", reject: "rejected", fix: "fix" } as const;
  await admin
    .from("finance_approvals")
    .update({
      approval_status: decisionMap[params.decision],
      sequence_status: "completed",
      is_current_step: false,
      decision_date: new Date().toISOString(),
      comments: params.notes ?? null,
      returned_to_requester: params.decision === "fix",
    })
    .eq("id", step.id);

  if (params.decision === "reject") {
    await admin.from("finance_tickets").update({ status: "denied" }).eq("id", ticket.id);
    await logAndNotifyOutcome(ticket.id, "denied", params.notes);
    return { ok: true as const, outcome: "denied" as const };
  }

  if (params.decision === "fix") {
    await admin.from("finance_tickets").update({ status: "fixing" }).eq("id", ticket.id);
    await logAndNotifyOutcome(ticket.id, "fixing", params.notes);
    return { ok: true as const, outcome: "returned_for_fix" as const };
  }

  // Approved this step.
  if (step.is_final_approval) {
    await admin.from("finance_tickets").update({ status: "open" }).eq("id", ticket.id);
    await logAndNotifyOutcome(ticket.id, "approved");
    return { ok: true as const, outcome: "approved" as const };
  }

  // Not sufficient on its own - climb to this chain person's own manager.
  const nextManager = await getManagerViaGraph(step.chain_person_email);
  if (!nextManager) {
    await admin.from("finance_tickets").update({ status: "on_hold" }).eq("id", ticket.id);
    await sendMailAs({
      fromMailbox: await financeMailbox(),
      to: await financeMailbox(),
      subject: `Finance ticket stuck: reached the top of the reporting chain`,
      body: `Ticket ${ticket.ticket_number}: ${step.chain_person_name} (${step.chain_person_email}) has no manager set in AD, and their approval alone wasn't sufficient for $${ticket.total.toLocaleString()}. Needs manual handling.`,
    });
    return { ok: true as const, outcome: "escalation_failed" as const };
  }

  const threshold = await getMonetaryLimit(nextManager.email);
  const isFinal = threshold !== null && ticket.total <= threshold;
  const nextStep = await createApprovalStep({
    ticketId: ticket.id,
    level: step.approval_level + 1,
    chainPersonEmail: nextManager.email,
    chainPersonName: nextManager.name,
    chainPersonJobTitle: nextManager.jobTitle,
    threshold,
    isFinal,
  });
  await sendStepEmail(nextStep, ticket);
  return { ok: true as const, outcome: "escalated" as const, escalatedTo: nextManager.name };
}

// Called after a requestor edits and resubmits a 'fixing' ticket -
// re-sends to the SAME approval level rather than restarting the
// whole chain from level 1, mirroring ir_Approvals.revision_number.
export async function resubmitFinanceTicket(ticketId: string) {
  const admin = createAdminClient();
  const { data: lastStep } = await admin
    .from("finance_approvals")
    .select("*")
    .eq("finance_ticket_id", ticketId)
    .order("approval_level", { ascending: false })
    .limit(1)
    .single();

  await admin.from("finance_tickets").update({ status: "pending" }).eq("id", ticketId);

  if (!lastStep) {
    // No prior step on record (shouldn't normally happen for a
    // 'fixing' ticket) - fall back to starting fresh.
    return startFinanceTicketApproval(ticketId);
  }

  const { data: ticket } = await admin.from("finance_tickets").select("ticket_number, title, total").eq("id", ticketId).single();
  if (!ticket) throw new Error("Ticket not found");

  const step = await createApprovalStep({
    ticketId,
    level: lastStep.approval_level,
    chainPersonEmail: lastStep.chain_person_email,
    chainPersonName: lastStep.chain_person_name,
    chainPersonJobTitle: lastStep.chain_person_job_title,
    threshold: lastStep.approval_amount_threshold,
    isFinal: lastStep.is_final_approval,
    revisionNumber: lastStep.revision_number + 1,
  });
  await sendStepEmail(step, ticket);
  return { outcome: "resubmitted" as const };
}

// Re-send the approval email for a ticket's current pending step (the
// Finance dashboard's "Remind" button) and note it on the ticket log.
export async function remindCurrentApprover(ticketId: string, byEmployeeId: string | null) {
  const admin = createAdminClient();
  const { data: step } = await admin
    .from("finance_approvals")
    .select("finance_ticket_id, approval_level, revision_number, approver_email, approver_name, chain_person_name, acting_as_delegate_for_email, approval_token")
    .eq("finance_ticket_id", ticketId)
    .eq("is_current_step", true)
    .eq("approval_status", "pending")
    .maybeSingle();
  if (!step) return { ok: false as const, error: "This ticket isn't waiting on an approver." };
  const { data: ticket } = await admin.from("finance_tickets").select("ticket_number, title, total").eq("id", ticketId).single();
  if (!ticket) return { ok: false as const, error: "Ticket not found." };
  await sendStepEmail(step, ticket, { reminder: true });
  await admin.from("finance_approvals").update({ last_reminded_at: new Date().toISOString() }).eq("approval_token", step.approval_token);
  await admin.from("finance_ticket_log").insert({
    finance_ticket_id: ticketId,
    comment: `Reminder sent to ${step.approver_name}.`,
    comment_type: "status_change",
    notify_user: false,
    created_by: byEmployeeId,
  });
  return { ok: true as const, to: step.approver_name as string };
}

// Daily cron: re-send the approval email to anyone sitting on a step
// longer than wf_finance_approval_reminder_hours (0 turns it off), at
// most once per that interval.
export async function runFinanceApprovalReminders() {
  const hours = await wfNumber("wf_finance_approval_reminder_hours");
  if (!hours || hours <= 0) return { reminded: 0, skipped: "off" };
  const admin = createAdminClient();
  const cutoff = new Date(Date.now() - hours * 3600 * 1000).toISOString();
  const { data: steps } = await admin
    .from("finance_approvals")
    .select("id, finance_ticket_id, approval_level, revision_number, approver_email, approver_name, chain_person_name, acting_as_delegate_for_email, approval_token, created_at, last_reminded_at, finance_tickets!inner(ticket_number, title, total, status)")
    .eq("is_current_step", true)
    .eq("approval_status", "pending")
    .eq("finance_tickets.status", "pending")
    .lt("created_at", cutoff)
    .limit(200);
  let reminded = 0;
  for (const s of (steps ?? []) as any[]) {
    if (s.last_reminded_at && s.last_reminded_at > cutoff) continue;
    try {
      await sendStepEmail(s, s.finance_tickets, { reminder: true });
      await admin.from("finance_approvals").update({ last_reminded_at: new Date().toISOString() }).eq("id", s.id);
      await admin.from("finance_ticket_log").insert({
        finance_ticket_id: s.finance_ticket_id,
        comment: `Automatic reminder sent to ${s.approver_name}.`,
        comment_type: "status_change",
        notify_user: false,
      });
      reminded++;
    } catch (e) {
      console.error("finance reminder failed", s.id, e);
    }
  }
  return { reminded };
}
