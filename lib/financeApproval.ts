import { createAdminClient } from "@/lib/supabase/server";
import { graphGet, sendMailAs } from "@/lib/msgraph";

// Replicates (and fixes two bugs in) the original Power Automate finance
// approval flow. Chain-climbing is done via LIVE Microsoft Graph calls,
// not the employees table's cached job_title/manager_email - those are
// only synced for employees in a mapped AD group (see ad-sync/route.ts),
// but this chain routinely reaches people (Regional Directors, the COO,
// the CEO) who may never have logged into the portal at all. Graph is
// the only reliably complete source for "who's this person's manager
// and what's their title" for someone outside the mapped-group set.

const APPROVALS_MAILBOX = "approvals@icnarelief.org";

export type FinanceTier = {
  id: string;
  tier_order: number;
  tier_name: string;
  job_titles: string[];
  max_amount: number | null;
};

async function getTiers(): Promise<FinanceTier[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("finance_approval_tiers")
    .select("*")
    .order("tier_order", { ascending: true });
  if (error) throw new Error(`Couldn't load finance_approval_tiers: ${error.message}`);
  return data ?? [];
}

// The tier required to approve this amount with NO knowledge of who's
// actually in the chain yet - the lowest-order tier whose ceiling covers
// the amount (null max_amount = unlimited/always sufficient).
function initialTierFor(amount: number, tiers: FinanceTier[]): FinanceTier {
  const sorted = [...tiers].sort((a, b) => a.tier_order - b.tier_order);
  const fit = sorted.find((t) => t.max_amount === null || amount <= t.max_amount);
  return fit ?? sorted[sorted.length - 1];
}

// Which tier does this specific job title belong to, if any? (A title
// not present in any tier's job_titles array doesn't itself satisfy
// anything - the chain just keeps climbing past them.)
function tierForJobTitle(jobTitle: string | null, tiers: FinanceTier[]): FinanceTier | null {
  if (!jobTitle) return null;
  return tiers.find((t) => t.job_titles.includes(jobTitle)) ?? null;
}

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
    // No manager set in AD, or the lookup failed - treated the same:
    // the chain can't climb further from here.
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

// Active delegate override for this email today, if any. The delegate
// stands in for approval purposes only - the chain still climbs from
// the ORIGINAL person's real manager, not the delegate's.
async function resolveDelegate(
  email: string
): Promise<{ email: string; name: string } | null> {
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

async function createStep(params: {
  financeApprovalRequestId: string;
  stepOrder: number;
  chainPersonEmail: string;
  chainPersonName: string;
  chainPersonJobTitle: string | null;
}) {
  const admin = createAdminClient();
  const delegate = await resolveDelegate(params.chainPersonEmail);

  const { data: step, error } = await admin
    .from("finance_approval_steps")
    .insert({
      finance_approval_request_id: params.financeApprovalRequestId,
      step_order: params.stepOrder,
      chain_person_email: params.chainPersonEmail,
      chain_person_name: params.chainPersonName,
      chain_person_job_title: params.chainPersonJobTitle,
      approver_email: delegate?.email ?? params.chainPersonEmail,
      approver_name: delegate?.name ?? params.chainPersonName,
      acting_as_delegate_for_email: delegate ? params.chainPersonEmail : null,
    })
    .select("*")
    .single();
  if (error || !step) throw new Error(`Couldn't create approval step: ${error?.message}`);
  return step;
}

async function sendStepEmail(step: any, requestId: string) {
  const admin = createAdminClient();
  const { data: ticket } = await admin
    .from("helpdesk_requests")
    .select("title, description, submitted_by, submitted_by_email, created_at")
    .eq("id", requestId)
    .single();
  const { data: far } = await admin
    .from("finance_approval_requests")
    .select("amount")
    .eq("request_id", requestId)
    .single();

  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? "").replace(/\/$/, "");
  const link = `${siteUrl}/finance-approvals/${step.approval_token}`;

  const delegateNote = step.acting_as_delegate_for_email
    ? `\n(You're covering this approval for ${step.chain_person_name}.)\n`
    : "";

  await sendMailAs({
    fromMailbox: APPROVALS_MAILBOX,
    to: step.approver_email,
    subject: `Finance Approval Needed: ${ticket?.title ?? "Request"} ($${far?.amount})`,
    body:
      `A finance request needs your approval.${delegateNote}\n\n` +
      `Title: ${ticket?.title}\n` +
      `Submitted by: ${ticket?.submitted_by}\n` +
      `Amount: $${far?.amount}\n` +
      `Details: ${ticket?.description ?? "(none)"}\n\n` +
      `Review and approve or deny: ${link}\n\n` +
      `This link works whether or not you've logged into the ICNA Relief Portal.`,
  });
}

async function sendFinalEmail(requestId: string, outcome: "approved" | "denied", finalTierName?: string) {
  const admin = createAdminClient();
  const { data: ticket } = await admin
    .from("helpdesk_requests")
    .select("title, submitted_by_email")
    .eq("id", requestId)
    .single();
  const { data: far } = await admin
    .from("finance_approval_requests")
    .select("amount")
    .eq("request_id", requestId)
    .single();
  if (!ticket) return;

  const subject =
    outcome === "approved"
      ? `Finance Request Approved: ${ticket.title}`
      : `Finance Request Denied: ${ticket.title}`;
  const body =
    outcome === "approved"
      ? `Your finance request "${ticket.title}" for $${far?.amount} has been fully approved` +
        (finalTierName ? ` (${finalTierName} level).` : ".")
      : `Your finance request "${ticket.title}" for $${far?.amount} was denied.`;

  await sendMailAs({
    fromMailbox: APPROVALS_MAILBOX,
    to: `${ticket.submitted_by_email}; ${APPROVALS_MAILBOX}`,
    subject,
    body,
  });
}

// Kicks off the chain for a newly-created finance ticket. Called right
// after the ticket + finance_approval_requests row are created.
export async function startFinanceApproval(params: { requestId: string; amount: number; submitterEmail: string }) {
  const admin = createAdminClient();
  const tiers = await getTiers();
  const initialTier = initialTierFor(params.amount, tiers);

  const manager = await getManagerViaGraph(params.submitterEmail);
  if (!manager) {
    // No manager on file for the submitter - can't route this
    // automatically. Flagged for a human rather than silently stuck.
    await admin
      .from("finance_approval_requests")
      .update({ status: "denied", final_tier_name: "NO_MANAGER_FOUND" })
      .eq("request_id", params.requestId);
    await sendMailAs({
      fromMailbox: APPROVALS_MAILBOX,
      to: APPROVALS_MAILBOX,
      subject: `Finance approval couldn't start: no manager found for ${params.submitterEmail}`,
      body: `Request ${params.requestId} needs manual routing - ${params.submitterEmail} has no manager set in Active Directory.`,
    });
    return;
  }

  await admin
    .from("finance_approval_requests")
    .update({ final_tier_name: initialTier.tier_name })
    .eq("request_id", params.requestId);

  const { data: far } = await admin
    .from("finance_approval_requests")
    .select("id")
    .eq("request_id", params.requestId)
    .single();
  if (!far) throw new Error("finance_approval_requests row not found after creation");

  const step = await createStep({
    financeApprovalRequestId: far.id,
    stepOrder: 1,
    chainPersonEmail: manager.email,
    chainPersonName: manager.name,
    chainPersonJobTitle: manager.jobTitle,
  });

  await sendStepEmail(step, params.requestId);
}

// Called when someone acts on a step (via the token page).
export async function decideFinanceApprovalStep(params: {
  token: string;
  decision: "approve" | "deny";
  note?: string;
}) {
  const admin = createAdminClient();

  const { data: step } = await admin
    .from("finance_approval_steps")
    .select("*")
    .eq("approval_token", params.token)
    .single();
  if (!step) return { ok: false as const, error: "Approval link not found." };
  if (step.status !== "pending") {
    return { ok: false as const, error: `This request was already ${step.status}.` };
  }

  const { data: far } = await admin
    .from("finance_approval_requests")
    .select("*")
    .eq("id", step.finance_approval_request_id)
    .single();
  if (!far) return { ok: false as const, error: "Approval request not found." };

  await admin
    .from("finance_approval_steps")
    .update({
      status: params.decision === "approve" ? "approved" : "denied",
      decided_at: new Date().toISOString(),
      decision_note: params.note ?? null,
    })
    .eq("id", step.id);

  if (params.decision === "deny") {
    await admin
      .from("finance_approval_requests")
      .update({ status: "denied", completed_at: new Date().toISOString() })
      .eq("id", far.id);
    await sendFinalEmail(far.request_id, "denied");
    return { ok: true as const, outcome: "denied" as const };
  }

  // Approved this step - is that enough, given who actually approved
  // and the amount, or does it need to climb further?
  const tiers = await getTiers();
  const approverTier = tierForJobTitle(step.chain_person_job_title, tiers);
  const sufficient = approverTier ? far.amount <= (approverTier.max_amount ?? Infinity) : false;

  if (sufficient) {
    await admin
      .from("finance_approval_requests")
      .update({
        status: "approved",
        final_tier_name: approverTier?.tier_name ?? null,
        completed_at: new Date().toISOString(),
      })
      .eq("id", far.id);
    await sendFinalEmail(far.request_id, "approved", approverTier?.tier_name);
    return { ok: true as const, outcome: "approved" as const };
  }

  // Not sufficient - climb to this chain person's own manager.
  const nextManager = await getManagerViaGraph(step.chain_person_email);
  if (!nextManager) {
    await admin
      .from("finance_approval_requests")
      .update({ status: "denied", final_tier_name: "CHAIN_EXHAUSTED", completed_at: new Date().toISOString() })
      .eq("id", far.id);
    await sendMailAs({
      fromMailbox: APPROVALS_MAILBOX,
      to: APPROVALS_MAILBOX,
      subject: `Finance approval stuck: reached the top of the reporting chain`,
      body: `Request ${far.request_id}: ${step.chain_person_name} (${step.chain_person_email}) has no manager set in AD, and their approval alone wasn't sufficient for the $${far.amount} amount. Needs manual handling.`,
    });
    return { ok: true as const, outcome: "escalation_failed" as const };
  }

  const nextStep = await createStep({
    financeApprovalRequestId: far.id,
    stepOrder: step.step_order + 1,
    chainPersonEmail: nextManager.email,
    chainPersonName: nextManager.name,
    chainPersonJobTitle: nextManager.jobTitle,
  });
  await sendStepEmail(nextStep, far.request_id);
  return { ok: true as const, outcome: "escalated" as const, escalatedTo: nextManager.name };
}
