// Hardware Request purchase approval (server only).
//
//   Stage 1  supervisor  - the requester's manager in Microsoft 365 (Entra)
//   Stage 2  executive   - the CIO and the CSO, in parallel, both required
//
// Nobody approves the same ticket twice: when the supervisor is also the
// CSO (or CIO), that one approval covers both roles and stage 2 only goes
// to whoever is left. A role the requester holds themselves counts as
// satisfied. Any denial closes the ticket. The database trigger in
// helpdesk_hardware_approvals_migration.sql is what actually stops the
// ticket being worked / closed early - this file just moves it along.

import { createAdminClient } from "@/lib/supabase/server";
import { graphGet } from "@/lib/msgraph";
import { sendPortalEmail, emailLayout, escapeHtml } from "@/lib/portalEmail";
import { wfString } from "@/lib/workflowSettings";
import { syncWorkboardCardsToLegStatus } from "@/lib/helpdesk";

export type HardwareRole = "supervisor" | "cio" | "cso";
export type HardwareStage = "supervisor" | "executive";
export type HardwareApprovalStatus = "pending" | "approved" | "denied";

export type HardwareApproval = {
  id: string;
  leg_id: string;
  request_id: string;
  stage: HardwareStage;
  roles: HardwareRole[];
  approver_name: string;
  approver_email: string;
  decision: "pending" | "approved" | "denied" | "superseded";
  notes: string | null;
  approval_token: string;
  decided_at: string | null;
  emailed_at: string | null;
  created_at: string;
  approved_amount: number | string | null;
};

export type HardwareLineItem = { description: string; quantity: number; unit_price: number };
export const usd = (n: number | string | null | undefined) =>
  n == null || n === "" ? "—" : Number(n).toLocaleString("en-US", { style: "currency", currency: "USD" });
export const lineTotal = (items: HardwareLineItem[]) => Math.round(items.reduce((s, l) => s + l.quantity * l.unit_price, 0) * 100) / 100;

export const ROLE_LABELS: Record<HardwareRole, string> = { supervisor: "Direct supervisor", cio: "CIO", cso: "CSO" };
export const rolesLabel = (roles: HardwareRole[]) => roles.map((r) => ROLE_LABELS[r]).join(" + ");

const siteUrl = () => (process.env.NEXT_PUBLIC_SITE_URL ?? "").replace(/\/$/, "");
const norm = (e: string | null | undefined) => (e ?? "").trim().toLowerCase();
const EYEBROW = "ICNA Relief · IT Help Desk";

type Ctx = {
  leg: { id: string; request_id: string; status: string; category: string | null; hardware_gate: boolean; hardware_approval_status: HardwareApprovalStatus | null };
  request: { id: string; ticket_number: string | null; title: string; description: string | null; submitted_by: string; submitted_by_email: string };
  detail: Record<string, any> | null;
  items: HardwareLineItem[];
  /** The supervisor's approved amount (what the CIO/CSO are approving). */
  proposedAmount: number | null;
  /** Final budget, set once everyone has approved. */
  budget: number | null;
};

async function loadCtx(legId: string): Promise<Ctx> {
  const admin = createAdminClient();
  const { data: leg } = await admin
    .from("helpdesk_request_legs")
    .select("*")
    .eq("id", legId)
    .maybeSingle();
  if (!leg) throw new Error("Ticket not found.");
  const { data: request } = await admin
    .from("helpdesk_requests")
    .select("id, ticket_number, title, description, submitted_by, submitted_by_email")
    .eq("id", leg.request_id)
    .single();
  const { data: detail } = await admin.from("helpdesk_leg_details_it").select("*").eq("leg_id", legId).maybeSingle();
  const { data: items } = await admin
    .from("helpdesk_hardware_line_items")
    .select("description, quantity, unit_price")
    .eq("leg_id", legId)
    .order("sort_order");
  const { data: sup } = await admin
    .from("helpdesk_hardware_approvals")
    .select("approved_amount")
    .eq("leg_id", legId)
    .eq("stage", "supervisor")
    .eq("decision", "approved")
    .not("approved_amount", "is", null)
    .order("decided_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return {
    leg: leg as Ctx["leg"],
    request: request as Ctx["request"],
    detail: detail ?? null,
    items: ((items ?? []) as any[]).map((i) => ({ description: i.description, quantity: Number(i.quantity), unit_price: Number(i.unit_price) })),
    proposedAmount: sup?.approved_amount != null ? Number(sup.approved_amount) : null,
    budget: (leg as any).hardware_approved_amount != null ? Number((leg as any).hardware_approved_amount) : null,
  };
}

export async function logHardwareEvent(legId: string, kind: string, message: string, ok = true) {
  const admin = createAdminClient();
  await admin.from("helpdesk_hardware_events").insert({ leg_id: legId, kind, message, ok });
}

async function itMailbox() {
  return wfString("wf_helpdesk_it_mailbox");
}

async function graphManager(email: string): Promise<{ name: string; email: string } | null> {
  try {
    const m = await graphGet(`/users/${encodeURIComponent(email)}/manager?$select=mail,userPrincipalName,displayName`);
    const e = m?.mail || m?.userPrincipalName;
    return e ? { name: m.displayName ?? e, email: e } : null;
  } catch {
    return null;
  }
}

async function nameForEmail(email: string): Promise<string> {
  const admin = createAdminClient();
  const { data } = await admin.from("employees").select("first_name, last_name").ilike("email", email).maybeSingle();
  const n = data ? `${data.first_name ?? ""} ${data.last_name ?? ""}`.trim() : "";
  return n || email;
}

async function executives(): Promise<{ cio: string; cso: string }> {
  const [cio, cso] = await Promise.all([wfString("wf_hardware_cio_email"), wfString("wf_hardware_cso_email")]);
  return { cio: norm(cio), cso: norm(cso) };
}

function ticketRows(c: Ctx): [string, string][] {
  const d = c.detail ?? {};
  const rows: [string, string][] = [
    ["Ticket", c.request.ticket_number ?? "—"],
    ["Request", c.request.title],
    ["Requested by", `${c.request.submitted_by} (${c.request.submitted_by_email})`],
  ];
  const city = [d.ship_city, [d.ship_state, d.ship_zip].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  if (d.ship_address_line1) rows.push(["Ship to", [d.ship_to_name, d.ship_address_line1, d.ship_address_line2, city].filter(Boolean).join(", ")]);
  rows.push(["Grant purchase", d.is_grant_purchase ? d.grant_name ?? "Yes" : "No"]);
  if (c.items.length) rows.push(["Order total (requested)", usd(lineTotal(c.items))]);
  if (c.budget != null) rows.push(["Approved budget", usd(c.budget)]);
  else if (c.proposedAmount != null) rows.push(["Amount approved by supervisor", usd(c.proposedAmount)]);
  return rows;
}

function lineItemsHtml(c: Ctx) {
  if (!c.items.length) return "";
  const cell = "padding:6px 8px;border-bottom:1px solid #ECE8DE;font-size:13px;color:#16302B";
  const rows = c.items
    .map(
      (l) =>
        `<tr><td style="${cell}">${escapeHtml(l.description)}</td><td style="${cell};text-align:right">${l.quantity}</td><td style="${cell};text-align:right">${usd(l.unit_price)}</td><td style="${cell};text-align:right;font-weight:600">${usd(l.quantity * l.unit_price)}</td></tr>`
    )
    .join("");
  const head = "padding:6px 8px;font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:#6b7c77;text-align:right";
  return `<table style="border-collapse:collapse;width:100%;margin:14px 0"><tr><th style="${head};text-align:left">Device</th><th style="${head}">Qty</th><th style="${head}">Each</th><th style="${head}">Total</th></tr>${rows}<tr><td colspan="3" style="${cell};text-align:right;font-weight:700">Order total</td><td style="${cell};text-align:right;font-weight:700">${usd(lineTotal(c.items))}</td></tr></table>`;
}

function descriptionHtml(c: Ctx) {
  if (!c.request.description) return "";
  return `<div style="margin:14px 0;padding:12px 14px;background:#F4F3EE;border-radius:12px;font-size:13px;color:#33504a"><strong>What they need</strong><br>${escapeHtml(c.request.description).replace(/\n/g, "<br>")}</div>`;
}

async function emailApprover(step: HardwareApproval, c: Ctx, isReminder = false) {
  const link = `${siteUrl()}/helpdesk/hardware-approval/${step.approval_token}`;
  const res = await sendPortalEmail({
    to: [step.approver_email],
    replyTo: c.request.submitted_by_email,
    subject: `${isReminder ? "Reminder: " : ""}Hardware purchase approval needed — ${c.request.ticket_number ?? ""} ${c.request.title}`.replace(/\s+/g, " "),
    html: emailLayout({
      eyebrow: EYEBROW,
      heading: isReminder ? "Still waiting on your decision" : "A hardware purchase needs your approval",
      intro: `${escapeHtml(c.request.submitted_by)} asked IT for hardware. You're approving as <strong>${escapeHtml(rolesLabel(step.roles))}</strong>. ${
        step.stage === "supervisor"
          ? "Please set the amount you're approving. After you, it goes to the CIO and CSO."
          : `The supervisor approved <strong>${usd(c.proposedAmount)}</strong>. The CIO and CSO both have to approve that amount before IT can buy it.`
      }`,
      rows: ticketRows(c),
      extraHtml: lineItemsHtml(c) + descriptionHtml(c),
      button: { label: "Review — Approve or Deny", href: link },
      footer: "This link works without logging in to the portal.",
    }),
  });
  const admin = createAdminClient();
  if (res.ok) await admin.from("helpdesk_hardware_approvals").update({ emailed_at: new Date().toISOString() }).eq("id", step.id);
  await logHardwareEvent(
    c.leg.id,
    isReminder ? "reminder" : "approval_requested",
    res.ok
      ? `${isReminder ? "Reminder sent" : "Approval requested"}: ${step.approver_name} (${rolesLabel(step.roles)}).`
      : `Couldn't email ${step.approver_email} (${rolesLabel(step.roles)}): ${res.error}. Use Re-send once email is working.`,
    res.ok
  );
}

async function notifyStuck(c: Ctx, why: string) {
  await logHardwareEvent(c.leg.id, "stuck", why, false);
  await sendPortalEmail({
    to: [await itMailbox()],
    subject: `Hardware approval stuck — ${c.request.ticket_number ?? ""} ${c.request.title}`.replace(/\s+/g, " "),
    html: emailLayout({
      eyebrow: EYEBROW,
      heading: "A hardware approval can't be routed",
      intro: escapeHtml(why),
      rows: ticketRows(c),
      button: { label: "Open ticket", href: `${siteUrl()}/helpdesk/${c.request.id}` },
    }),
  });
}

async function listSteps(legId: string): Promise<HardwareApproval[]> {
  const admin = createAdminClient();
  const { data } = await admin.from("helpdesk_hardware_approvals").select("*").eq("leg_id", legId).order("created_at");
  return (data ?? []) as HardwareApproval[];
}

// ---------------------------------------------------------------
// Start (called right after a hardware ticket is created)
// ---------------------------------------------------------------
export async function startHardwareApproval(legId: string) {
  const c = await loadCtx(legId);
  if (!c.leg.hardware_gate || c.leg.hardware_approval_status !== "pending") return { outcome: "not_required" as const };
  const steps = await listSteps(legId);
  if (steps.some((s) => s.stage === "supervisor" && s.decision !== "superseded")) return { outcome: "already_started" as const };

  const requester = norm(c.request.submitted_by_email);
  const mgr = await graphManager(c.request.submitted_by_email);
  if (!mgr) {
    await notifyStuck(c, `${c.request.submitted_by} has no manager set in Microsoft 365, so there's no direct supervisor to approve. Set their manager in Entra, then use Re-send approvals on the ticket.`);
    return { outcome: "stuck" as const };
  }

  const exec = await executives();
  const sup = norm(mgr.email);
  const roles: HardwareRole[] = ["supervisor"];
  if (exec.cio && sup === exec.cio) roles.push("cio");
  if (exec.cso && sup === exec.cso) roles.push("cso");
  if (sup === requester) {
    await notifyStuck(c, `${c.request.submitted_by} is listed as their own manager in Microsoft 365. Fix the manager in Entra, then use Re-send approvals.`);
    return { outcome: "stuck" as const };
  }

  const admin = createAdminClient();
  const { data: step, error } = await admin
    .from("helpdesk_hardware_approvals")
    .insert({ leg_id: legId, request_id: c.request.id, stage: "supervisor", roles, approver_name: mgr.name, approver_email: mgr.email })
    .select("*")
    .single();
  if (error || !step) throw new Error(`Couldn't create the approval step: ${error?.message}`);

  await logHardwareEvent(
    legId,
    "submitted",
    roles.length > 1
      ? `Sent to ${mgr.name}, who is both the direct supervisor and the ${roles.filter((r) => r !== "supervisor").map((r) => ROLE_LABELS[r]).join(" and ")} — one approval covers both.`
      : `Sent to the direct supervisor, ${mgr.name}. The CIO and CSO approve after them.`
  );
  await emailApprover(step as HardwareApproval, c);
  return { outcome: "started" as const };
}

// Stage 2: everyone among CIO / CSO who hasn't already been covered.
async function advanceToExecutive(legId: string) {
  const c = await loadCtx(legId);
  if (c.leg.hardware_approval_status !== "pending") return { outcome: c.leg.hardware_approval_status ?? "not_required" };
  const steps = await listSteps(legId);
  if (steps.some((s) => s.stage === "executive" && s.decision !== "superseded")) return { outcome: "already_escalated" as const };

  const covered = new Set<HardwareRole>(steps.filter((s) => s.decision === "approved").flatMap((s) => s.roles));
  const requester = norm(c.request.submitted_by_email);
  const exec = await executives();
  const notes: string[] = [];
  const missing: string[] = [];
  const byEmail = new Map<string, HardwareRole[]>();

  for (const role of ["cio", "cso"] as const) {
    if (covered.has(role)) continue;
    const email = exec[role];
    if (!email) {
      missing.push(ROLE_LABELS[role]);
      continue;
    }
    if (email === requester) {
      notes.push(`${ROLE_LABELS[role]} approval skipped — the requester is the ${ROLE_LABELS[role]}.`);
      continue;
    }
    byEmail.set(email, [...(byEmail.get(email) ?? []), role]);
  }

  for (const n of notes) await logHardwareEvent(legId, "routing", n);

  if (missing.length) {
    await notifyStuck(c, `No ${missing.join(" or ")} approver is set. An admin needs to add the email on Admin → Workflows (Hardware purchases), then use Re-send approvals on the ticket.`);
    return { outcome: "stuck" as const };
  }

  if (byEmail.size === 0) return finalizeApproval(legId);

  const admin = createAdminClient();
  const rows = await Promise.all(
    [...byEmail.entries()].map(async ([email, roles]) => ({
      leg_id: legId,
      request_id: c.request.id,
      stage: "executive",
      roles,
      approver_name: await nameForEmail(email),
      approver_email: email,
    }))
  );
  const { data: inserted, error } = await admin.from("helpdesk_hardware_approvals").insert(rows).select("*");
  if (error) throw new Error(error.message);
  await logHardwareEvent(legId, "escalated", `Supervisor approved ${usd(c.proposedAmount)}. Now with ${rows.map((r) => `${r.approver_name} (${rolesLabel(r.roles as HardwareRole[])})`).join(" and ")}.`);
  for (const s of inserted ?? []) await emailApprover(s as HardwareApproval, c);
  return { outcome: "escalated" as const };
}

async function finalizeApproval(legId: string) {
  const admin = createAdminClient();
  const now = new Date().toISOString();
  // The supervisor's approved amount becomes the ticket's budget.
  const before = await loadCtx(legId);
  const { data: moved } = await admin
    .from("helpdesk_request_legs")
    .update({ hardware_approval_status: "approved", hardware_approved_at: now, hardware_approved_amount: before.proposedAmount })
    .eq("id", legId)
    .eq("hardware_approval_status", "pending")
    .select("id")
    .maybeSingle();
  if (!moved) return { outcome: "already_final" as const };

  const c = await loadCtx(legId);
  const steps = await listSteps(legId);
  const sup = steps.find((s) => s.stage === "supervisor" && s.decision === "approved");
  // Keep the older SharePoint-era approval columns filled in too.
  if (c.detail) {
    await admin
      .from("helpdesk_leg_details_it")
      .update({ approval_required: true, supervisor_approved: true, supervisor_name: sup?.approver_name ?? null, date_of_approval: now })
      .eq("leg_id", legId);
  }

  await logHardwareEvent(legId, "approved", `Fully approved with a budget of ${usd(c.budget)}. IT can purchase; an invoice must be uploaded before the ticket can be closed.`);
  const res = await sendPortalEmail({
    to: [c.request.submitted_by_email],
    cc: [await itMailbox()],
    subject: `Approved: ${c.request.ticket_number ?? ""} ${c.request.title}`.replace(/\s+/g, " "),
    html: emailLayout({
      eyebrow: EYEBROW,
      heading: "Your hardware request is approved",
      intro: `Your supervisor, the CIO and the CSO have approved it with a budget of <strong>${usd(c.budget)}</strong>. IT will order the equipment and keep you posted on the ticket.`,
      rows: ticketRows(c),
      extraHtml: lineItemsHtml(c),
      button: { label: "View ticket", href: `${siteUrl()}/helpdesk/${c.request.id}` },
    }),
  });
  if (!res.ok) await logHardwareEvent(legId, "notified", `Couldn't email the requester about the approval: ${res.error}`, false);
  return { outcome: "approved" as const };
}

// ---------------------------------------------------------------
// Decide (from the emailed token link)
// ---------------------------------------------------------------
export async function getHardwareApprovalByToken(token: string) {
  if (!/^[0-9a-f-]{36}$/i.test(token)) return null;
  const admin = createAdminClient();
  const { data: step } = await admin.from("helpdesk_hardware_approvals").select("*").eq("approval_token", token).maybeSingle();
  if (!step) return null;
  const c = await loadCtx(step.leg_id);
  const steps = await listSteps(step.leg_id);
  return { step: step as HardwareApproval, ctx: c, steps };
}

export async function decideHardwareApproval(params: { token: string; decision: "approve" | "deny"; notes?: string; amount?: number | null }) {
  const admin = createAdminClient();
  const now = new Date().toISOString();

  // The supervisor sets the amount they're approving; the CIO/CSO
  // approve that amount as-is (deny with a note if it's wrong).
  const { data: pre } = await admin.from("helpdesk_hardware_approvals").select("stage").eq("approval_token", params.token).maybeSingle();
  let amount: number | null = null;
  if (params.decision === "approve" && pre?.stage === "supervisor") {
    amount = Math.round(Number(params.amount) * 100) / 100;
    if (!Number.isFinite(amount) || amount <= 0) throw new Error("Enter the amount you're approving.");
    if (amount > 10_000_000) throw new Error("That amount looks too large. Check it and try again.");
  }

  const { data: step } = await admin
    .from("helpdesk_hardware_approvals")
    .update({
      decision: params.decision === "approve" ? "approved" : "denied",
      notes: params.notes?.trim() || null,
      decided_at: now,
      ...(amount != null ? { approved_amount: amount } : {}),
    })
    .eq("approval_token", params.token)
    .eq("decision", "pending")
    .select("*")
    .maybeSingle();
  if (!step) {
    const { data: existing } = await admin.from("helpdesk_hardware_approvals").select("decision").eq("approval_token", params.token).maybeSingle();
    if (!existing) throw new Error("This approval link isn't valid.");
    throw new Error(existing.decision === "superseded" ? "This request was already decided by someone else." : `You already ${existing.decision} this request.`);
  }
  const s = step as HardwareApproval;
  const c = await loadCtx(s.leg_id);
  if (c.leg.hardware_approval_status !== "pending") return { outcome: "already_final" as const };

  if (params.decision === "deny") return denyHardware(s, c);

  await logHardwareEvent(
    s.leg_id,
    "decision",
    `${s.approver_name} (${rolesLabel(s.roles)}) approved${s.approved_amount != null ? ` ${usd(s.approved_amount)}` : ""}.${s.notes ? ` Note: ${s.notes}` : ""}`
  );

  if (s.stage === "supervisor") return advanceToExecutive(s.leg_id);

  const steps = await listSteps(s.leg_id);
  const exec = steps.filter((x) => x.stage === "executive" && x.decision !== "superseded");
  const waiting = exec.filter((x) => x.decision === "pending");
  if (waiting.length > 0) {
    await logHardwareEvent(s.leg_id, "waiting", `Waiting on ${waiting.map((w) => `${w.approver_name} (${rolesLabel(w.roles)})`).join(" and ")}.`);
    return { outcome: "approved_pending_others" as const };
  }
  return finalizeApproval(s.leg_id);
}

async function denyHardware(s: HardwareApproval, c: Ctx) {
  const admin = createAdminClient();
  const now = new Date().toISOString();
  // Flip approval state first (conditionally) so a concurrent final
  // approval can't also go through.
  const { data: moved } = await admin
    .from("helpdesk_request_legs")
    .update({ hardware_approval_status: "denied" })
    .eq("id", s.leg_id)
    .eq("hardware_approval_status", "pending")
    .select("id")
    .maybeSingle();
  if (!moved) return { outcome: "already_final" as const };

  await admin.from("helpdesk_hardware_approvals").update({ decision: "superseded" }).eq("leg_id", s.leg_id).eq("decision", "pending");

  // Denied = nothing to buy, so the ticket closes (no invoice needed and
  // no IT points - nobody did the work).
  await admin.from("helpdesk_request_legs").update({ status: "closed", closed_at: now }).eq("id", s.leg_id);
  if (c.detail) {
    await admin
      .from("helpdesk_leg_details_it")
      .update({ solution: `Purchase denied by ${s.approver_name} (${rolesLabel(s.roles)})${s.notes ? `: ${s.notes}` : ""}` })
      .eq("leg_id", s.leg_id);
  }
  const { data: legs } = await admin.from("helpdesk_request_legs").select("status").eq("request_id", c.request.id);
  if (!(legs ?? []).some((l: { status: string }) => ["open", "in_progress", "on_hold", "quality_assurance"].includes(l.status))) {
    await admin.from("helpdesk_requests").update({ overall_status: "closed" }).eq("id", c.request.id);
  }
  await syncWorkboardCardsToLegStatus(admin, s.leg_id, "closed").catch(() => {});

  await logHardwareEvent(s.leg_id, "denied", `${s.approver_name} (${rolesLabel(s.roles)}) denied the purchase.${s.notes ? ` Reason: ${s.notes}` : ""} Ticket closed.`);
  const res = await sendPortalEmail({
    to: [c.request.submitted_by_email],
    cc: [await itMailbox()],
    subject: `Denied: ${c.request.ticket_number ?? ""} ${c.request.title}`.replace(/\s+/g, " "),
    html: emailLayout({
      eyebrow: EYEBROW,
      heading: "Your hardware request was denied",
      intro: `${escapeHtml(s.approver_name)} (${escapeHtml(rolesLabel(s.roles))}) denied this purchase.${s.notes ? `<br><br><strong>Reason:</strong> ${escapeHtml(s.notes)}` : ""}<br><br>If something changes, submit a new request.`,
      rows: ticketRows(c),
      button: { label: "View ticket", href: `${siteUrl()}/helpdesk/${c.request.id}` },
    }),
  });
  if (!res.ok) await logHardwareEvent(s.leg_id, "notified", `Couldn't email the requester about the denial: ${res.error}`, false);
  return { outcome: "denied" as const };
}

// ---------------------------------------------------------------
// Re-send: re-emails whoever is pending, or rebuilds a stage that got
// stuck (no manager in Entra, CIO/CSO not configured yet).
// ---------------------------------------------------------------
export async function resendHardwareApprovals(legId: string) {
  const c = await loadCtx(legId);
  if (c.leg.hardware_approval_status !== "pending") throw new Error("This ticket isn't waiting on approval.");
  const steps = (await listSteps(legId)).filter((s) => s.decision !== "superseded");
  const pending = steps.filter((s) => s.decision === "pending");
  if (pending.length) {
    for (const p of pending) await emailApprover(p, c, true);
    return { outcome: "reminded" as const, count: pending.length };
  }
  const supApproved = steps.some((s) => s.stage === "supervisor" && s.decision === "approved");
  return supApproved ? advanceToExecutive(legId) : startHardwareApproval(legId);
}

export async function getHardwareState(legId: string) {
  const admin = createAdminClient();
  const [steps, events] = await Promise.all([
    listSteps(legId),
    admin.from("helpdesk_hardware_events").select("kind, message, ok, created_at").eq("leg_id", legId).order("created_at").then((r: { data: unknown[] | null }) => r.data ?? []),
  ]);
  const c = await loadCtx(legId).catch(() => null);
  return {
    steps: steps.map(({ approval_token: _t, ...rest }) => ({ ...rest, approved_amount: rest.approved_amount != null ? Number(rest.approved_amount) : null })),
    events: events as { kind: string; message: string; ok: boolean; created_at: string }[],
    items: c?.items ?? [],
    proposedAmount: c?.proposedAmount ?? null,
    budget: c?.budget ?? null,
  };
}
