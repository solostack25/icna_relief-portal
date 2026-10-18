import { createAdminClient } from "@/lib/supabase/server";
import { getIntegrationSetting } from "@/lib/integrationSettings";
import { startFinanceTicketApproval } from "@/lib/financeTickets";
import { graphGet } from "@/lib/msgraph";
import { sendPortalEmail, emailLayout, escapeHtml, type EmailAttachment } from "@/lib/portalEmail";
import { buildAgreementPdf, buildIcs, money, type AgreementInput } from "@/lib/speakerDocuments";
import { wfNumber } from "@/lib/workflowSettings";

// ============================================================
// Speaker Request workflow engine (Jummah Khutbah / special program
// speakers). Implements the blueprint's routing exactly:
//
//   Gate 1 - Area Manager, always. (Auto-approved and logged when the
//            submitter IS the AM.)
//   Gate 2 - Joint leadership sign-off, only when travel is required
//            AND fee + travel + hotel > $500. Approvers = the region's
//            Regional Director (employees.role/assigned_region) + the
//            admin-managed speaker_leadership_approvers list.
//            Unanimous: one denial stops the request.
//
// On final approval, auto-fulfillment runs with no further action from
// the coordinator:
//   1. Speaker saved to speaker_directory (so W-9 status is remembered)
//   2. Finance Honorarium ticket created + routed into the existing
//      finance approval chain (lib/financeTickets.ts)
//   3. Speaker emailed a secure link to e-sign the agreement and, if
//      needed, upload a W-9 + payee address; both flow back onto the
//      finance ticket automatically
//   4. Coordinator (cc AM) emailed "Approved: proceed with booking"
//      with a calendar invite
// Regional budget debit is intentionally NOT implemented (per Travis).
//
// Every step writes to speaker_request_events so the request page
// shows exactly what happened, including failures.
// ============================================================

export const LEADERSHIP_THRESHOLD = 500;
export const LOCAL_HONORARIUM_CAP = 500;

export type SpeakerRequest = {
  id: string;
  request_number: string;
  coordinator_id: string | null;
  coordinator_name: string;
  coordinator_email: string;
  region: string;
  office_id: string | null;
  area_manager_name: string;
  area_manager_email: string;
  event_type: "weekly_jummah" | "special_program";
  event_type_other: string | null;
  travel_required: boolean;
  event_at: string;
  event_timezone: string;
  speaker_id: string | null;
  speaker_name: string;
  speaker_email: string | null;
  speaker_phone: string | null;
  honorarium: number;
  w9_on_file: boolean | null;
  travel_cost: number;
  hotel_cost: number;
  justification: string | null;
  total_cost: number;
  requires_leadership: boolean;
  status: "pending_am" | "pending_leadership" | "approved" | "denied" | "cancelled";
  denied_reason: string | null;
  approved_at: string | null;
  finance_ticket_id: string | null;
  honorarium_id: string | null;
  speaker_portal_token: string;
  speaker_packet_sent_at: string | null;
  agreement_signed_at: string | null;
  agreement_signed_name: string | null;
  agreement_signed_ip: string | null;
  agreement_storage_path: string | null;
  w9_needed: boolean;
  w9_received_at: string | null;
  last_reminder_at: string | null;
  w9_storage_path: string | null;
  fulfillment_locked_at: string | null;
  coordinator_notified_at: string | null;
  payee_name: string | null;
  payee_address_line1: string | null;
  payee_address_line2: string | null;
  payee_city: string | null;
  payee_state: string | null;
  payee_zip_code: string | null;
  created_at: string;
};

type Approval = {
  id: string;
  request_id: string;
  gate: "area_manager" | "leadership";
  approver_name: string;
  approver_email: string;
  approver_role: string | null;
  decision: "pending" | "approved" | "denied" | "superseded";
  notes: string | null;
  approval_token: string;
  decided_at: string | null;
  reminded_at: string | null;
  created_at: string;
};

export const STATUS_LABELS: Record<string, string> = {
  pending_am: "Waiting on Area Manager",
  pending_leadership: "Waiting on Leadership",
  approved: "Approved",
  denied: "Denied",
  cancelled: "Cancelled",
};
export const STATUS_COLORS: Record<string, string> = {
  pending_am: "#A57420",
  pending_leadership: "#A57420",
  approved: "#1F6F54",
  denied: "#B5566B",
  cancelled: "#999",
};

const siteUrl = () => (process.env.NEXT_PUBLIC_SITE_URL ?? "").replace(/\/$/, "");
const FALLBACK_ADMIN_MAILBOX = "approvals@icnarelief.org";

// threshold: Admin → Workflows "wf_speaker_leadership_threshold" (default $500).
export function computeRequiresLeadership(
  r: { travel_required: boolean; honorarium: number; travel_cost: number; hotel_cost: number },
  threshold: number = LEADERSHIP_THRESHOLD
) {
  return r.travel_required && Number(r.honorarium) + Number(r.travel_cost) + Number(r.hotel_cost) > threshold;
}

export function formatEventWhen(r: Pick<SpeakerRequest, "event_at" | "event_timezone">) {
  const tz = r.event_timezone || "America/Chicago";
  try {
    return new Intl.DateTimeFormat("en-US", { timeZone: tz, dateStyle: "full", timeStyle: "short", timeZoneName: "short" } as Intl.DateTimeFormatOptions).format(new Date(r.event_at));
  } catch {
    return new Date(r.event_at).toUTCString();
  }
}

function eventDateOnly(r: Pick<SpeakerRequest, "event_at" | "event_timezone">) {
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone: r.event_timezone || "America/Chicago", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(r.event_at));
  } catch {
    return r.event_at.slice(0, 10);
  }
}

export function eventLabel(r: Pick<SpeakerRequest, "event_type" | "event_type_other">) {
  return r.event_type === "weekly_jummah" ? "Weekly Jummah Khutbah" : `Special Program${r.event_type_other ? `: ${r.event_type_other}` : ""}`;
}

async function locationLabel(r: SpeakerRequest) {
  if (!r.office_id) return `ICNA Relief ${r.region}`;
  const admin = createAdminClient();
  const { data } = await admin.from("b2s_offices").select("field_office, state, chapter").eq("id", r.office_id).maybeSingle();
  if (!data) return `ICNA Relief ${r.region}`;
  return `ICNA Relief ${data.field_office}${data.state ? `, ${data.state}` : ""}`;
}

export async function logEvent(requestId: string, kind: string, message: string, ok = true) {
  const admin = createAdminClient();
  await admin.from("speaker_request_events").insert({ request_id: requestId, kind, message, ok });
}

async function loadRequest(id: string): Promise<SpeakerRequest> {
  const admin = createAdminClient();
  const { data, error } = await admin.from("speaker_requests").select("*").eq("id", id).single();
  if (error || !data) throw new Error("Speaker request not found");
  return data as SpeakerRequest;
}

async function adminMailbox() {
  return (await getIntegrationSetting("speaker_requests_admin_email", FALLBACK_ADMIN_MAILBOX)) ?? FALLBACK_ADMIN_MAILBOX;
}

function costRows(r: SpeakerRequest): [string, string][] {
  const rows: [string, string][] = [
    ["Request", r.request_number],
    ["Event", eventLabel(r)],
    ["When", formatEventWhen(r)],
    ["Region", r.region],
    ["Speaker", r.speaker_name],
    ["Coordinator", `${r.coordinator_name} (${r.coordinator_email})`],
    ["Honorarium", money(r.honorarium)],
  ];
  if (r.travel_required) {
    rows.push(["Travel", money(r.travel_cost)], ["Hotel", money(r.hotel_cost)], ["Combined total", money(r.total_cost)]);
  }
  return rows;
}

// ---------------------------------------------------------------
// Approval emails
// ---------------------------------------------------------------

async function sendApprovalEmail(approval: Approval, r: SpeakerRequest, isReminder = false) {
  const link = `${siteUrl()}/speaker-requests/approve/${approval.approval_token}`;
  const gateLabel = approval.gate === "area_manager" ? "Area Manager review" : "Joint leadership sign-off";
  const extra =
    r.travel_required && r.justification
      ? `<div style="margin:14px 0;padding:12px 14px;background:#F4F3EE;border-radius:12px;font-size:13px;color:#33504a"><strong>Strategic justification</strong><br>${escapeHtml(r.justification).replace(/\n/g, "<br>")}</div>`
      : "";
  const res = await sendPortalEmail({
    to: [approval.approver_email],
    replyTo: r.coordinator_email,
    subject: `${isReminder ? "Reminder: " : ""}Speaker Request ${r.request_number} needs your approval — ${r.speaker_name} (${money(r.total_cost)})`,
    html: emailLayout({
      heading: isReminder ? "Still waiting on your decision" : "A speaker request needs your approval",
      intro: `${escapeHtml(r.coordinator_name)} submitted a speaker request. This is the <strong>${gateLabel}</strong> step${approval.gate === "leadership" ? " (travel required and combined cost over $500)" : ""}.`,
      rows: costRows(r),
      extraHtml: extra,
      button: { label: "Review — Approve or Deny", href: link },
      footer: "This link works without logging in to the portal. Approve or deny takes one click.",
    }),
  });
  await logEvent(
    r.id,
    isReminder ? "reminder" : "approval_requested",
    res.ok
      ? `${isReminder ? "Reminder sent" : "Approval request emailed"} to ${approval.approver_name} (${approval.approver_email}) — ${gateLabel}.`
      : `Couldn't email ${approval.approver_email} for ${gateLabel}: ${res.error}. They can still approve from the portal.`,
    res.ok
  );
}

// ---------------------------------------------------------------
// Submit
// ---------------------------------------------------------------

export async function submitSpeakerRequest(requestId: string) {
  const admin = createAdminClient();
  const r = await loadRequest(requestId);

  const requiresLeadership = computeRequiresLeadership(r, await wfNumber("wf_speaker_leadership_threshold"));
  if (requiresLeadership !== r.requires_leadership) {
    await admin.from("speaker_requests").update({ requires_leadership: requiresLeadership }).eq("id", r.id);
    r.requires_leadership = requiresLeadership;
  }

  await logEvent(
    r.id,
    "submitted",
    r.travel_required
      ? `Submitted (escalated pathway — travel required). Combined cost ${money(r.total_cost)}${requiresLeadership ? " exceeds $500, so leadership sign-off will follow the Area Manager." : " is within $500, so Area Manager approval is final."}`
      : "Submitted (fast-track pathway — local speaker). Area Manager approval is final."
  );

  await createAreaManagerStep(r);
  return { status: "pending_am" as const };
}

async function getGraphManager(email: string): Promise<{ name: string; email: string } | null> {
  try {
    const m = await graphGet(`/users/${encodeURIComponent(email)}/manager?$select=mail,userPrincipalName,displayName`);
    const e = m.mail || m.userPrincipalName;
    return e ? { name: m.displayName ?? e, email: e } : null;
  } catch {
    return null;
  }
}

// Gate 1. When an Area Manager submits their own request (the
// blueprint allows "Outreach Coordinator or Area Manager"), nobody
// approves their own spend: Gate 1 goes to the AM's own manager from
// Active Directory instead.
async function createAreaManagerStep(r: SpeakerRequest) {
  const admin = createAdminClient();
  let approverName = r.area_manager_name;
  let approverEmail = r.area_manager_email;
  let role = "Area Manager";
  if (r.coordinator_email.trim().toLowerCase() === r.area_manager_email.trim().toLowerCase()) {
    const mgr = await getGraphManager(r.coordinator_email);
    if (!mgr) {
      await logEvent(r.id, "stuck", `${r.coordinator_name} is listed as their own Area Manager and has no manager in Active Directory to approve instead. An admin can re-route it by re-sending approvals once AD is fixed.`, false);
      return null;
    }
    approverName = mgr.name;
    approverEmail = mgr.email;
    role = "Area Manager's manager (submitter is the AM)";
    await logEvent(r.id, "routing", `Submitted by the Area Manager, so Gate 1 goes to their manager, ${mgr.name}.`);
  }
  const { data: approval, error } = await admin
    .from("speaker_request_approvals")
    .insert({ request_id: r.id, gate: "area_manager", approver_name: approverName, approver_email: approverEmail, approver_role: role })
    .select("*")
    .single();
  if (error || !approval) throw new Error(`Couldn't create approval step: ${error?.message}`);
  await sendApprovalEmail(approval as Approval, r);
  return approval as Approval;
}

// ---------------------------------------------------------------
// Decide (from token link or the in-portal approvals list)
// ---------------------------------------------------------------

export async function getApprovalByToken(token: string) {
  const admin = createAdminClient();
  const { data: approval } = await admin.from("speaker_request_approvals").select("*").eq("approval_token", token).maybeSingle();
  if (!approval) return null;
  const r = await loadRequest(approval.request_id);
  const { data: all } = await admin
    .from("speaker_request_approvals")
    .select("gate, approver_name, approver_role, decision, decided_at, notes")
    .eq("request_id", r.id)
    .order("created_at");
  return { approval: approval as Approval, request: r, approvals: all ?? [] };
}

export async function decideSpeakerApproval(params: { token: string; decision: "approve" | "deny"; notes?: string }) {
  const admin = createAdminClient();
  const now = new Date().toISOString();

  // Atomic: only a still-pending step can be decided, so a double
  // click / two open tabs can't decide it twice.
  const { data: step } = await admin
    .from("speaker_request_approvals")
    .update({ decision: params.decision === "approve" ? "approved" : "denied", notes: params.notes?.trim() || null, decided_at: now })
    .eq("approval_token", params.token)
    .eq("decision", "pending")
    .select("*")
    .maybeSingle();
  if (!step) {
    const { data: existing } = await admin.from("speaker_request_approvals").select("decision").eq("approval_token", params.token).maybeSingle();
    if (!existing) throw new Error("Approval link not found.");
    throw new Error(`This step was already ${existing.decision}.`);
  }

  const r = await loadRequest(step.request_id);
  if (r.status === "denied" || r.status === "cancelled" || r.status === "approved") {
    return { outcome: r.status };
  }

  const gateLabel = step.gate === "area_manager" ? "Area Manager" : "Leadership";

  if (params.decision === "deny") {
    // Close the request FIRST (conditionally), so a concurrent final
    // approval can't slip in between and fulfill a denied request.
    const { data: closed } = await admin
      .from("speaker_requests")
      .update({ status: "denied", denied_reason: step.notes ?? null, updated_at: now })
      .eq("id", r.id)
      .in("status", ["pending_am", "pending_leadership"])
      .select("id")
      .maybeSingle();
    await admin.from("speaker_request_approvals").update({ decision: "superseded" }).eq("request_id", r.id).eq("decision", "pending");
    if (!closed) {
      await logEvent(r.id, "late_decision", `${gateLabel} ${step.approver_name} denied, but the request had already been finalized.`, false);
      return { outcome: "already_final" as const };
    }
    await logEvent(r.id, "denied", `${gateLabel} ${step.approver_name} denied the request.${step.notes ? ` Note: ${step.notes}` : ""}`);

    const res = await sendPortalEmail({
      to: [r.coordinator_email],
      cc: step.gate === "leadership" ? [r.area_manager_email] : [],
      subject: `Denied: Speaker Request ${r.request_number} — ${r.speaker_name}`,
      html: emailLayout({
        heading: "Speaker request denied",
        intro: `${escapeHtml(step.approver_name)} (${gateLabel}) denied this request.${step.notes ? `<br><br><strong>Note:</strong> ${escapeHtml(step.notes)}` : ""}`,
        rows: costRows(r),
        button: { label: "View request", href: `${siteUrl()}/speaker-requests/${r.id}` },
      }),
    });
    await logEvent(r.id, "notified", res.ok ? `Coordinator notified of denial.` : `Couldn't email coordinator about the denial: ${res.error}`, res.ok);
    return { outcome: "denied" as const };
  }

  await logEvent(r.id, "approved", `${gateLabel} ${step.approver_name} approved.${step.notes ? ` Note: ${step.notes}` : ""}`);

  if (step.gate === "area_manager") {
    return advanceAfterAreaManager(r.id);
  }

  // Leadership: unanimous.
  const { data: leadership } = await admin.from("speaker_request_approvals").select("decision").eq("request_id", r.id).eq("gate", "leadership");
  if ((leadership ?? []).some((s: { decision: string }) => s.decision === "denied")) return { outcome: "denied" as const };
  const remaining = (leadership ?? []).filter((s: { decision: string }) => s.decision !== "approved").length;
  if (remaining > 0) {
    await logEvent(r.id, "waiting", `Waiting on ${remaining} more leadership approval${remaining === 1 ? "" : "s"}.`);
    return { outcome: "approved_pending_others" as const };
  }
  return finalizeApproval(r.id);
}

async function advanceAfterAreaManager(requestId: string) {
  const r = await loadRequest(requestId);
  if (!r.requires_leadership) return finalizeApproval(r.id);

  const admin = createAdminClient();
  const { data: moved } = await admin
    .from("speaker_requests")
    .update({ status: "pending_leadership", updated_at: new Date().toISOString() })
    .eq("id", r.id)
    .eq("status", "pending_am")
    .select("id")
    .maybeSingle();
  if (!moved) return { outcome: r.status };

  // Region's RD(s) from the portal's own role data, plus the configured
  // leadership list. Deduped by email.
  const approvers = new Map<string, { name: string; email: string; role: string }>();
  const { data: rds } = await admin
    .from("employees")
    .select("first_name, last_name, email")
    .eq("role", "regional_director")
    .eq("assigned_region", r.region)
    .neq("is_active", false);
  for (const rd of rds ?? []) {
    if (rd.email) approvers.set(rd.email.toLowerCase(), { name: `${rd.first_name ?? ""} ${rd.last_name ?? ""}`.trim() || rd.email, email: rd.email, role: `Regional Director (${r.region})` });
  }
  const { data: configured } = await admin.from("speaker_leadership_approvers").select("full_name, email, role_label").eq("is_active", true);
  for (const c of configured ?? []) {
    if (!approvers.has(c.email.toLowerCase())) approvers.set(c.email.toLowerCase(), { name: c.full_name, email: c.email, role: c.role_label ?? "Leadership" });
  }

  if (approvers.size === 0) {
    const mailbox = await adminMailbox();
    await logEvent(r.id, "stuck", "Leadership sign-off is required but no leadership approvers are configured and no Regional Director is assigned to this region. An admin needs to add approvers under Admin → Speaker Requests.", false);
    await sendPortalEmail({
      to: [mailbox],
      subject: `Speaker Request ${r.request_number} is stuck: no leadership approvers configured`,
      html: emailLayout({
        heading: "Leadership approvers needed",
        intro: "This request needs joint leadership sign-off, but there's nobody to send it to. Add approvers in the portal (Admin → Speaker Requests) and then use “Re-send approvals” on the request.",
        rows: costRows(r),
        button: { label: "Open request", href: `${siteUrl()}/speaker-requests/${r.id}` },
      }),
    });
    return { outcome: "stuck" as const };
  }

  const { data: inserted, error } = await admin
    .from("speaker_request_approvals")
    .insert(
      [...approvers.values()].map((a) => ({ request_id: r.id, gate: "leadership", approver_name: a.name, approver_email: a.email, approver_role: a.role }))
    )
    .select("*");
  if (error) throw new Error(error.message);

  await logEvent(r.id, "escalated", `Escalated to joint leadership sign-off: ${[...approvers.values()].map((a) => `${a.name} (${a.role})`).join(", ")}.`);
  for (const step of inserted ?? []) await sendApprovalEmail(step as Approval, r);
  return { outcome: "escalated" as const };
}

// Re-sends approval emails for every still-pending step, or - if the
// leadership gate is stuck with no approvers - retries building it.
export async function resendPendingApprovals(requestId: string) {
  const admin = createAdminClient();
  const r = await loadRequest(requestId);
  const { data: pending } = await admin.from("speaker_request_approvals").select("*").eq("request_id", r.id).eq("decision", "pending");
  if ((pending ?? []).length === 0) {
    if (r.status === "pending_leadership") {
      // Leadership gate never got approvers (none configured at the time).
      await admin.from("speaker_requests").update({ status: "pending_am" }).eq("id", r.id).eq("status", "pending_leadership");
      return advanceAfterAreaManager(r.id);
    }
    if (r.status === "pending_am") {
      const { data: amSteps } = await admin.from("speaker_request_approvals").select("decision").eq("request_id", r.id).eq("gate", "area_manager");
      if ((amSteps ?? []).some((s: { decision: string }) => s.decision === "approved")) return advanceAfterAreaManager(r.id);
      // Gate 1 step was never created (e.g. a failure mid-submit).
      const step = await createAreaManagerStep(r);
      return { outcome: step ? ("resent" as const) : ("stuck" as const), count: step ? 1 : 0 };
    }
  }
  for (const step of pending ?? []) {
    await sendApprovalEmail(step as Approval, r, true);
    await admin.from("speaker_request_approvals").update({ reminded_at: new Date().toISOString() }).eq("id", step.id);
  }
  return { outcome: "resent" as const, count: pending?.length ?? 0 };
}

// ---------------------------------------------------------------
// Final approval -> auto-fulfillment
// ---------------------------------------------------------------

async function finalizeApproval(requestId: string) {
  const admin = createAdminClient();
  const now = new Date().toISOString();
  // Atomic transition - guarantees fulfillment runs exactly once even
  // if two leadership approvers click at the same moment.
  const { data: won } = await admin
    .from("speaker_requests")
    .update({ status: "approved", approved_at: now, updated_at: now })
    .eq("id", requestId)
    .in("status", ["pending_am", "pending_leadership"])
    .select("id")
    .maybeSingle();
  if (!won) return { outcome: "already_final" as const };

  await logEvent(requestId, "final_approval", "Final approval logged. Starting automatic fulfillment.");
  try {
    await fulfillSpeakerRequest(requestId);
  } catch (e) {
    await logEvent(requestId, "automation", `Automation didn't start: ${e instanceof Error ? e.message : String(e)}`, false);
  }
  return { outcome: "approved" as const };
}

// Each step is guarded by its own "already done" marker, so this is
// safe to re-run from the request page if any step failed.
export async function fulfillSpeakerRequest(requestId: string) {
  const admin = createAdminClient();
  const now = new Date();
  // Claim a lock so "Retry automation" can't race an in-flight run into
  // duplicate finance tickets. A lock older than 5 minutes is treated
  // as abandoned (function timed out).
  const staleBefore = new Date(now.getTime() - 5 * 60000).toISOString();
  const { data: claimed } = await admin
    .from("speaker_requests")
    .update({ fulfillment_locked_at: now.toISOString() })
    .eq("id", requestId)
    .eq("status", "approved")
    .or(`fulfillment_locked_at.is.null,fulfillment_locked_at.lt.${staleBefore}`)
    .select("id")
    .maybeSingle();
  if (!claimed) throw new Error("Automation is already running for this request (or it isn't approved). Try again in a few minutes.");

  try {
    let r = await loadRequest(requestId);
    await safeStep(r.id, "speaker_directory", () => upsertSpeaker(r));
    r = await loadRequest(requestId);
    if (!r.finance_ticket_id) await safeStep(r.id, "finance_ticket", () => createFinanceTicket(r));
    r = await loadRequest(requestId);
    if (!r.speaker_packet_sent_at) await safeStep(r.id, "speaker_packet", () => sendSpeakerPacket(r));
    r = await loadRequest(requestId);
    if (!r.coordinator_notified_at) await safeStep(r.id, "coordinator_notice", () => notifyCoordinatorApproved(r));
  } finally {
    await admin.from("speaker_requests").update({ fulfillment_locked_at: null }).eq("id", requestId);
  }
}

async function safeStep(requestId: string, kind: string, fn: () => Promise<void>) {
  try {
    await fn();
  } catch (e) {
    await logEvent(requestId, kind, `Automatic step failed: ${e instanceof Error ? e.message : String(e)}. Use “Retry automation” on the request page.`, false);
  }
}

// The request is linked to a directory speaker only by EMAIL, matched
// server-side at submit time - never by an id the browser sends - so
// a request can't attach itself to someone else's W-9 or payee record.
async function upsertSpeaker(r: SpeakerRequest) {
  const admin = createAdminClient();
  let speakerId = r.speaker_id;
  if (speakerId) {
    const { data: existing } = await admin.from("speaker_directory").select("phone, w9_on_file, w9_storage_path").eq("id", speakerId).single();
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (r.speaker_phone && !existing?.phone) patch.phone = r.speaker_phone;
    // The coordinator attested a W-9 is on file - remember it.
    if (r.w9_on_file === true && !existing?.w9_on_file) patch.w9_on_file = true;
    await admin.from("speaker_directory").update(patch).eq("id", speakerId);
    if (existing?.w9_storage_path && !r.w9_storage_path) {
      await admin.from("speaker_requests").update({ w9_storage_path: existing.w9_storage_path }).eq("id", r.id);
    }
  } else {
    const { data: created, error } = await admin
      .from("speaker_directory")
      .insert({ full_name: r.speaker_name, email: r.speaker_email, phone: r.speaker_phone, w9_on_file: r.w9_on_file === true })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    speakerId = created.id;
    await admin.from("speaker_requests").update({ speaker_id: speakerId }).eq("id", r.id);
  }
  await logEvent(r.id, "speaker_directory", `Speaker saved to the speaker directory. W-9 ${r.w9_needed ? "will be requested from the speaker" : "already on file"}.`);
}

export function documentUrl(requestId: string, doc: "w9" | "agreement") {
  return `${siteUrl()}/api/speaker-requests/${requestId}/documents/${doc}`;
}

async function createFinanceTicket(r: SpeakerRequest) {
  const admin = createAdminClient();
  if (!r.coordinator_id) throw new Error("Coordinator has no portal employee record, so a finance ticket can't be filed under them.");

  const { data: speaker } = r.speaker_id ? await admin.from("speaker_directory").select("*").eq("id", r.speaker_id).maybeSingle() : { data: null };
  const location = await locationLabel(r);

  const { data: approvals } = await admin
    .from("speaker_request_approvals")
    .select("gate, approver_name, approver_role, decision, decided_at")
    .eq("request_id", r.id)
    .eq("decision", "approved")
    .order("decided_at");
  const approvalSummary = (approvals ?? [])
    .map((a: { approver_name: string; approver_role: string | null; decided_at: string | null }) => `${a.approver_name} (${a.approver_role ?? "approver"}) on ${a.decided_at?.slice(0, 10)}`)
    .join("; ");

  const notes =
    `Auto-submitted from Speaker Request ${r.request_number}. ` +
    `Event: ${eventLabel(r)} — ${formatEventWhen(r)} at ${location}. ` +
    `Program approval: ${approvalSummary || "n/a"}. ` +
    (r.travel_required ? `Travel/lodging are approved estimates; actual receipts may differ. ` : "") +
    (r.justification ? `Justification: ${r.justification}` : "");

  const { data: honorarium, error: hErr } = await admin
    .from("finance_honorariums")
    .insert({
      requestor_id: r.coordinator_id,
      speaker_or_agency_name: r.speaker_name,
      is_icna_speaker_list: false,
      event_date: eventDateOnly(r),
      billing_office_id: r.office_id,
      multiple_billing_offices: false,
      grant_eligible: false,
      poc_is_icna_member: true,
      poc_user_id: r.coordinator_id,
      service_provided: `${eventLabel(r)} speaker (${r.request_number})`,
      service_is_office_location: !!r.office_id,
      service_office_id: r.office_id,
      payee_name: speaker?.payee_name || r.speaker_name,
      payee_address_line1: speaker?.payee_address_line1 ?? null,
      payee_address_line2: speaker?.payee_address_line2 ?? null,
      payee_city: speaker?.payee_city ?? null,
      payee_state: speaker?.payee_state ?? null,
      payee_zip_code: speaker?.payee_zip_code ?? null,
      service_cost: r.honorarium,
      travel_amount: r.travel_cost,
      lodging_cost: r.hotel_cost,
      total_amount: r.total_cost,
      w9_url: r.w9_storage_path || speaker?.w9_storage_path ? documentUrl(r.id, "w9") : null,
      notes,
    })
    .select("id")
    .single();
  if (hErr || !honorarium) throw new Error(`Couldn't create honorarium detail: ${hErr?.message}`);

  const { data: ticket, error: tErr } = await admin
    .from("finance_tickets")
    .insert({
      title: `Speaker Honorarium — ${r.speaker_name} — ${eventDateOnly(r)} (${r.request_number})`,
      category: "honorarium",
      detail: {},
      requestor_id: r.coordinator_id,
      billing_office_id: r.office_id,
      grant_eligible: false,
      total: r.total_cost,
      priority: "normal",
      submitted_at: new Date().toISOString(),
      honorarium_id: honorarium.id,
    })
    .select("id, ticket_number")
    .single();
  if (tErr || !ticket) throw new Error(`Couldn't create finance ticket: ${tErr?.message}`);

  const { error: linkErr } = await admin.from("speaker_requests").update({ finance_ticket_id: ticket.id, honorarium_id: honorarium.id }).eq("id", r.id);
  if (linkErr) {
    // Don't throw - a retry would create a duplicate ticket. Flag it.
    await logEvent(r.id, "finance_ticket", `Finance ticket ${ticket.ticket_number} was created but couldn't be linked to this request (${linkErr.message}). Do NOT retry; ask an admin to link it.`, false);
  }
  await admin.from("finance_ticket_log").insert({
    finance_ticket_id: ticket.id,
    comment: `Created automatically from approved Speaker Request ${r.request_number}. Program approvals: ${approvalSummary}. ${r.w9_on_file === true ? "Coordinator reports W-9 already on file." : "W-9 and signed speaker agreement will be attached here automatically when the speaker submits them."}`,
    comment_type: "approval",
    notify_user: false,
  });
  await logEvent(r.id, "finance_ticket", `Finance honorarium ticket ${ticket.ticket_number} created for ${money(r.total_cost)} (fee ${money(r.honorarium)}${r.travel_required ? `, travel ${money(r.travel_cost)}, hotel ${money(r.hotel_cost)}` : ""}).`);

  try {
    const result = await startFinanceTicketApproval(ticket.id);
    const msg =
      result.outcome === "routed"
        ? `Finance ticket ${ticket.ticket_number} submitted into the finance approval chain.`
        : result.outcome === "auto_approved"
          ? `Finance ticket ${ticket.ticket_number} auto-approved by finance rules and is awaiting payment.`
          : `Finance ticket ${ticket.ticket_number} needs manual routing by Finance (flagged to the finance mailbox).`;
    await logEvent(r.id, "finance_routing", msg, result.outcome !== "stuck");
  } catch (e) {
    await logEvent(r.id, "finance_routing", `Finance ticket ${ticket.ticket_number} was created but routing failed: ${e instanceof Error ? e.message : String(e)}. Finance can route it from their queue.`, false);
  }
}

async function agreementInput(r: SpeakerRequest): Promise<AgreementInput> {
  return {
    requestNumber: r.request_number,
    speakerName: r.speaker_name,
    eventLabel: eventLabel(r),
    eventWhen: formatEventWhen(r),
    location: await locationLabel(r),
    honorarium: Number(r.honorarium),
    travelRequired: r.travel_required,
    travelCost: Number(r.travel_cost),
    hotelCost: Number(r.hotel_cost),
    coordinatorName: r.coordinator_name,
    coordinatorEmail: r.coordinator_email,
  };
}

async function eventIcs(r: SpeakerRequest): Promise<EmailAttachment> {
  return {
    filename: `${r.request_number}.ics`,
    contentType: "text/calendar; charset=utf-8; method=PUBLISH",
    content: buildIcs({
      uid: r.id,
      start: new Date(r.event_at),
      durationMinutes: r.event_type === "weekly_jummah" ? 90 : 120,
      summary: `${eventLabel(r)} — ${r.speaker_name}`,
      description: `Speaker: ${r.speaker_name}\nCoordinator: ${r.coordinator_name} (${r.coordinator_email})\nRequest: ${r.request_number}\n${siteUrl()}/speaker-requests/${r.id}`,
      location: await locationLabel(r),
    }),
  };
}

function portalLink(r: SpeakerRequest) {
  return `${siteUrl()}/speaker-portal/${r.speaker_portal_token}`;
}

async function sendSpeakerPacket(r: SpeakerRequest, isReminder = false) {
  const admin = createAdminClient();
  const link = portalLink(r);
  const ics = await eventIcs(r);
  const todo = r.w9_needed ? "review and sign your speaker agreement and securely upload your W-9" : "review and sign your speaker agreement";

  if (r.speaker_email) {
    const res = await sendPortalEmail({
      to: [r.speaker_email],
      cc: isReminder ? [] : [r.coordinator_email],
      replyTo: r.coordinator_email,
      subject: `${isReminder ? "Reminder: " : ""}ICNA Relief speaker confirmation — ${eventLabel(r)}, ${eventDateOnly(r)}`,
      html: emailLayout({
        heading: `Assalamu alaikum ${r.speaker_name},`,
        intro: `JazakAllahu khairan for speaking with ICNA Relief. Your engagement is confirmed. Please take two minutes to ${todo} so we can process your honorarium.`,
        rows: [
          ["Event", eventLabel(r)],
          ["When", formatEventWhen(r)],
          ["Where", await locationLabel(r)],
          ["Honorarium", money(r.honorarium)],
          ["Point of contact", `${r.coordinator_name} (${r.coordinator_email})`],
        ],
        button: { label: r.w9_needed ? "Sign agreement & upload W-9" : "Review & sign agreement", href: link },
        footer: "This secure link is unique to you. A calendar invite is attached.",
      }),
      attachments: isReminder ? [] : [ics],
    });
    await logEvent(r.id, isReminder ? "reminder" : "speaker_packet", res.ok ? `${isReminder ? "Reminder" : "Agreement"}${r.w9_needed ? " + W-9 request" : ""} emailed to the speaker (${r.speaker_email}).` : `Couldn't email the speaker: ${res.error}`, res.ok);
    if (!res.ok) throw new Error(res.error);
  } else {
    // Speaker contact info is optional on the local branch - hand the
    // secure link to the coordinator to pass along.
    const res = await sendPortalEmail({
      to: [r.coordinator_email],
      subject: `Forward to your speaker: agreement${r.w9_needed ? " + W-9" : ""} link for ${r.speaker_name} (${r.request_number})`,
      html: emailLayout({
        heading: "Please forward this link to your speaker",
        intro: `No email was given for ${escapeHtml(r.speaker_name)}, so the speaker's secure link is below. Send it to them (text or WhatsApp is fine). They'll ${todo}; everything flows to Finance automatically.`,
        rows: [["Speaker link", link]],
        button: { label: "Open speaker link", href: link },
      }),
    });
    await logEvent(r.id, "speaker_packet", res.ok ? "No speaker email on file — the speaker's secure link was sent to the coordinator to forward." : `Couldn't send the speaker link to the coordinator: ${res.error}`, res.ok);
    if (!res.ok) throw new Error(res.error);
  }
  const now = new Date().toISOString();
  await admin
    .from("speaker_requests")
    .update(isReminder ? { last_reminder_at: now } : { speaker_packet_sent_at: now, last_reminder_at: now })
    .eq("id", r.id);
}

async function notifyCoordinatorApproved(r: SpeakerRequest) {
  const admin = createAdminClient();
  const { data: ticket } = r.finance_ticket_id
    ? await admin.from("finance_tickets").select("ticket_number").eq("id", r.finance_ticket_id).maybeSingle()
    : { data: null };
  const ics = await eventIcs(r);
  const res = await sendPortalEmail({
    to: [r.coordinator_email],
    cc: [r.area_manager_email],
    subject: `Approved: Proceed with booking ${r.speaker_name} (${r.request_number})`,
    html: emailLayout({
      heading: `Approved: proceed with booking ${r.speaker_name}`,
      intro: "You're all set — nothing else to submit. The portal has already handled the paperwork:",
      rows: costRows(r),
      extraHtml: `<ul style="font-size:13px;color:#33504a;line-height:1.7;padding-left:18px;margin:12px 0">
<li>Finance honorarium ticket ${ticket ? `<strong>${escapeHtml(ticket.ticket_number)}</strong> ` : ""}submitted for ${money(r.total_cost)}</li>
<li>Speaker agreement${r.w9_needed ? " and W-9 request" : ""} sent ${r.speaker_email ? `to ${escapeHtml(r.speaker_email)}` : "to you to forward"}</li>
<li>Calendar invite attached</li></ul>`,
      button: { label: "Track this request", href: `${siteUrl()}/speaker-requests/${r.id}` },
    }),
    attachments: [ics],
  });
  if (res.ok) await admin.from("speaker_requests").update({ coordinator_notified_at: new Date().toISOString() }).eq("id", r.id);
  await logEvent(r.id, "coordinator_notice", res.ok ? `Coordinator notified "Approved: proceed with booking" with calendar invite (cc Area Manager).` : `Couldn't email the coordinator: ${res.error}`, res.ok);
}

// ---------------------------------------------------------------
// Speaker portal (public, token-scoped)
// ---------------------------------------------------------------

export async function getSpeakerPortal(token: string) {
  const admin = createAdminClient();
  const { data } = await admin.from("speaker_requests").select("*").eq("speaker_portal_token", token).maybeSingle();
  if (!data) return null;
  const r = data as SpeakerRequest;
  if (r.status !== "approved") return { unavailable: true as const };
  const input = await agreementInput(r);
  return {
    unavailable: false as const,
    request: {
      request_number: r.request_number,
      speaker_name: r.speaker_name,
      event: input.eventLabel,
      when: input.eventWhen,
      location: input.location,
      honorarium: Number(r.honorarium),
      coordinator_name: r.coordinator_name,
      coordinator_email: r.coordinator_email,
      w9_needed: r.w9_needed,
      w9_received_at: r.w9_received_at,
      agreement_signed_at: r.agreement_signed_at,
      agreement_signed_name: r.agreement_signed_name,
    },
    agreement: input,
    // Prefilled only from THIS request - never from the shared
    // directory - so the link can't be used to read a stored address.
    payee: {
      payee_name: r.payee_name ?? r.speaker_name,
      payee_address_line1: r.payee_address_line1 ?? "",
      payee_address_line2: r.payee_address_line2 ?? "",
      payee_city: r.payee_city ?? "",
      payee_state: r.payee_state ?? "",
      payee_zip_code: r.payee_zip_code ?? "",
    },
  };
}

export type PortalSubmission = {
  signatureName: string;
  payee: { payee_name: string; payee_address_line1: string; payee_address_line2?: string; payee_city: string; payee_state: string; payee_zip_code: string };
  w9?: { buffer: Buffer; filename: string; contentType: string };
  ip: string | null;
};

export async function completeSpeakerPortal(token: string, sub: PortalSubmission) {
  const admin = createAdminClient();
  const { data } = await admin.from("speaker_requests").select("*").eq("speaker_portal_token", token).maybeSingle();
  if (!data) throw new Error("This link isn't valid.");
  const r = data as SpeakerRequest;
  if (r.status !== "approved") throw new Error("This engagement is no longer active. Please contact your ICNA Relief point of contact.");

  const needsSignature = !r.agreement_signed_at;
  const needsW9 = r.w9_needed && !r.w9_received_at;
  if (!needsSignature && !needsW9) return { alreadyComplete: true };

  if (needsSignature && sub.signatureName.trim().length < 3) throw new Error("Please type your full name to sign.");
  if (needsW9 && !sub.w9) throw new Error("Please attach your completed W-9.");
  for (const k of ["payee_name", "payee_address_line1", "payee_city", "payee_state", "payee_zip_code"] as const) {
    if (!sub.payee[k]?.trim()) throw new Error("Please complete the payment mailing address.");
  }

  const now = new Date();
  const updates: Record<string, unknown> = { updated_at: now.toISOString() };
  const attachments: EmailAttachment[] = [];
  const done: string[] = [];

  if (needsW9 && sub.w9) {
    const ext = (sub.w9.filename.split(".").pop() || "pdf").toLowerCase().replace(/[^a-z0-9]/g, "");
    const path = `w9/${r.speaker_id ?? r.id}/${now.getTime()}.${ext}`;
    const { error } = await admin.storage.from("speaker-documents").upload(path, sub.w9.buffer, { contentType: sub.w9.contentType, upsert: false });
    if (error) throw new Error(`Upload failed: ${error.message}`);
    updates.w9_received_at = now.toISOString();
    updates.w9_storage_path = path;
    // Only update the shared directory when the link was delivered to
    // the speaker's own email (the request is linked by that email).
    if (r.speaker_id && r.speaker_email) {
      await admin
        .from("speaker_directory")
        .update({ w9_on_file: true, w9_storage_path: path, w9_received_at: now.toISOString(), updated_at: now.toISOString() })
        .eq("id", r.speaker_id);
    }
    done.push("W-9");
  }

  if (needsSignature) {
    const pdf = await buildAgreementPdf(await agreementInput(r), { name: sub.signatureName.trim(), signedAt: now, ip: sub.ip });
    const path = `agreements/${r.id}/${r.request_number}-signed.pdf`;
    const { error } = await admin.storage.from("speaker-documents").upload(path, pdf, { contentType: "application/pdf", upsert: true });
    if (error) throw new Error(`Couldn't save signed agreement: ${error.message}`);
    Object.assign(updates, {
      agreement_signed_at: now.toISOString(),
      agreement_signed_name: sub.signatureName.trim(),
      agreement_signed_ip: sub.ip,
      agreement_storage_path: path,
    });
    attachments.push({ filename: `${r.request_number}-speaker-agreement.pdf`, content: pdf, contentType: "application/pdf" });
    done.push("signed agreement");
  }

  const payee = {
    payee_name: sub.payee.payee_name.trim(),
    payee_address_line1: sub.payee.payee_address_line1.trim(),
    payee_address_line2: sub.payee.payee_address_line2?.trim() || null,
    payee_city: sub.payee.payee_city.trim(),
    payee_state: sub.payee.payee_state.trim(),
    payee_zip_code: sub.payee.payee_zip_code.trim(),
  };
  if (r.speaker_id && r.speaker_email) await admin.from("speaker_directory").update(payee).eq("id", r.speaker_id);

  Object.assign(updates, payee);
  await admin.from("speaker_requests").update(updates).eq("id", r.id);

  // Push everything onto the finance ticket so Finance never has to
  // chase paperwork.
  if (r.honorarium_id) {
    const hPatch: Record<string, unknown> = { ...payee };
    if (updates.w9_storage_path || r.w9_storage_path) hPatch.w9_url = documentUrl(r.id, "w9");
    if (updates.agreement_storage_path) hPatch.invoice_url = documentUrl(r.id, "agreement");
    await admin.from("finance_honorariums").update(hPatch).eq("id", r.honorarium_id);
  }
  if (r.finance_ticket_id) {
    await admin.from("finance_ticket_log").insert({
      finance_ticket_id: r.finance_ticket_id,
      comment:
        `Speaker submitted: ${done.join(" + ")} and payee mailing address (${payee.payee_name}, ${payee.payee_address_line1}, ${payee.payee_city}, ${payee.payee_state} ${payee.payee_zip_code}).` +
        (updates.w9_received_at ? ` W-9: ${documentUrl(r.id, "w9")}` : "") +
        (updates.agreement_storage_path ? ` Signed agreement: ${documentUrl(r.id, "agreement")}` : ""),
      comment_type: "comment",
      notify_user: false,
    });
  }

  await logEvent(r.id, "speaker_submitted", `Speaker submitted ${done.join(" + ")} and payee address. Attached to the finance ticket automatically.`);

  const res = await sendPortalEmail({
    to: [r.coordinator_email],
    cc: r.speaker_email ? [r.speaker_email] : [],
    subject: `Speaker paperwork complete — ${r.speaker_name} (${r.request_number})`,
    html: emailLayout({
      heading: "Speaker paperwork received",
      intro: `${escapeHtml(r.speaker_name)} submitted their ${done.join(" and ")}. It's been attached to the finance ticket — no action needed.`,
      rows: [
        ["Request", r.request_number],
        ["Event", `${eventLabel(r)} — ${formatEventWhen(r)}`],
      ],
    }),
    attachments,
  });
  await logEvent(r.id, "notified", res.ok ? "Signed agreement copy sent to coordinator and speaker." : `Couldn't send confirmation email: ${res.error}`, res.ok);

  return { alreadyComplete: false, done };
}

// ---------------------------------------------------------------
// Daily reminders (vercel.json cron)
// ---------------------------------------------------------------

export async function runSpeakerRequestReminders() {
  const admin = createAdminClient();
  const cutoff = new Date(Date.now() - (await wfNumber("wf_speaker_approval_reminder_hours")) * 3600 * 1000).toISOString();
  let approvalReminders = 0;
  let speakerReminders = 0;

  const { data: staleSteps } = await admin
    .from("speaker_request_approvals")
    .select("*")
    .eq("decision", "pending")
    .lt("created_at", cutoff)
    .or(`reminded_at.is.null,reminded_at.lt.${cutoff}`)
    .limit(100);
  for (const step of staleSteps ?? []) {
    const r = await loadRequest(step.request_id);
    if (r.status !== "pending_am" && r.status !== "pending_leadership") continue;
    if (new Date(r.event_at).getTime() < Date.now()) continue;
    await sendApprovalEmail(step as Approval, r, true);
    await admin.from("speaker_request_approvals").update({ reminded_at: new Date().toISOString() }).eq("id", step.id);
    approvalReminders++;
  }

  const speakerCutoff = new Date(Date.now() - (await wfNumber("wf_speaker_packet_reminder_hours")) * 3600 * 1000).toISOString();
  const { data: openPackets } = await admin
    .from("speaker_requests")
    .select("*")
    .eq("status", "approved")
    .not("speaker_packet_sent_at", "is", null)
    .lt("last_reminder_at", speakerCutoff)
    .limit(100);
  for (const row of openPackets ?? []) {
    const r = row as SpeakerRequest;
    const incomplete = !r.agreement_signed_at || (r.w9_needed && !r.w9_received_at);
    if (!incomplete || !r.speaker_email) continue;
    // Keep nudging until 14 days after the event - Finance still needs
    // the W-9 to pay after the khutbah has happened.
    if (new Date(r.event_at).getTime() + 14 * 86400000 < Date.now()) continue;
    try {
      await sendSpeakerPacket(r, true);
      speakerReminders++;
    } catch {
      /* logged inside */
    }
  }

  return { approvalReminders, speakerReminders };
}
