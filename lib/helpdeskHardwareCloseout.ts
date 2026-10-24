// Hardware Request close-out (server only). Runs once the ticket is
// closed (approved + invoice attached):
//   1. a grant purchase posts each invoice to Grant Management as an
//      expense on that grant, invoice file attached, linked to the ticket
//   2. the requester is emailed with the invoice(s) attached
// Safe to run more than once - each invoice posts at most once (unique
// index) and the email is claimed before it's sent.

import { randomUUID } from "crypto";
import { createAdminClient } from "@/lib/supabase/server";
import { GM_BUCKET } from "@/lib/grantManagement/server";
import { sendPortalEmail, emailLayout, escapeHtml, type EmailAttachment } from "@/lib/portalEmail";
import { logHardwareEvent, usd } from "@/lib/helpdeskHardware";

const INVOICE_BUCKET = "helpdesk-invoices";
const siteUrl = () => (process.env.NEXT_PUBLIC_SITE_URL ?? "").replace(/\/$/, "");
const EYEBROW = "ICNA Relief · IT Help Desk";
const MAX_ATTACH_BYTES = 30 * 1024 * 1024;

export type GrantLineOption = { id: string; label: string };

// A grant's budget lines for the "which budget line?" picker on the
// invoice upload, with a best guess for hardware first.
export async function grantLineOptions(grantId: string): Promise<{ lines: GrantLineOption[]; suggested: string | null }> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("gm_budget_lines")
    .select("id, category, subcategory, sort_order")
    .eq("grant_id", grantId)
    .eq("is_active", true)
    .order("sort_order");
  const rows = (data ?? []) as { id: string; category: string; subcategory: string | null }[];
  const label = (l: { category: string; subcategory: string | null }) => (l.subcategory ? `${l.category} › ${l.subcategory}` : l.category);
  const text = (l: { category: string; subcategory: string | null }) => `${l.category} ${l.subcategory ?? ""}`.toLowerCase();
  const pick =
    rows.find((l) => /equipment|computer|technology|\bit\b|hardware/.test(text(l))) ??
    rows.find((l) => /supplies|operational|operating/.test(text(l))) ??
    null;
  return { lines: rows.map((l) => ({ id: l.id, label: label(l) })), suggested: pick?.id ?? null };
}

type Invoice = {
  id: string;
  file_name: string;
  storage_path: string;
  content_type: string | null;
  size_bytes: number | null;
  amount: number | null;
  vendor: string | null;
  payment_method: string | null;
  gm_line_id: string | null;
  gm_expense_id: string | null;
  uploaded_by_employee_id: string | null;
  uploaded_at: string;
};

const todayChicago = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Chicago" });

export async function runHardwareCloseout(legId: string, actorEmployeeId: string | null) {
  const admin = createAdminClient();
  const { data: leg } = await admin.from("helpdesk_request_legs").select("*").eq("id", legId).maybeSingle();
  if (!leg) throw new Error("Ticket not found.");
  if (!leg.hardware_gate || leg.hardware_approval_status !== "approved") return { outcome: "not_required" as const };
  if (leg.status !== "closed") return { outcome: "not_closed" as const };

  const { data: request } = await admin
    .from("helpdesk_requests")
    .select("id, ticket_number, title, submitted_by, submitted_by_email")
    .eq("id", leg.request_id)
    .single();
  const { data: detail } = await admin.from("helpdesk_leg_details_it").select("*").eq("leg_id", legId).maybeSingle();
  const { data: invRows } = await admin.from("helpdesk_attachments").select("*").eq("leg_id", legId).eq("kind", "invoice").order("uploaded_at");
  const invoices = (invRows ?? []) as Invoice[];
  if (!invoices.length || !request) return { outcome: "no_invoice" as const };

  const ticketLabel = request.ticket_number ?? "IT ticket";
  const actor = actorEmployeeId ?? leg.closed_by_employee_id ?? invoices[0].uploaded_by_employee_id ?? null;
  const warnings: string[] = [];
  const posted: { invoice: string; expenseId: string; grant: string }[] = [];

  // ---------- 1. Grant Management ----------
  const grantId: string | null = detail?.is_grant_purchase ? detail.gm_grant_id ?? null : null;
  if (detail?.is_grant_purchase && !grantId) {
    warnings.push("Marked as a grant purchase but no grant was picked, so nothing was posted to Grant Management.");
  }
  if (grantId) {
    const { data: grant } = await admin.from("gm_grants").select("id, code, status, office_id, program, approval_required").eq("id", grantId).maybeSingle();
    if (!grant) {
      warnings.push("The grant on this ticket no longer exists in Grant Management.");
    } else {
      const { suggested } = await grantLineOptions(grantId);
      const { data: member } = actor
        ? await admin.from("gm_grant_members").select("role").eq("grant_id", grantId).eq("employee_id", actor).maybeSingle()
        : { data: null };
      // Same rule as mileage: only a named grant member gets the grant's
      // "no approval needed" shortcut; otherwise the grant team reviews it.
      const autoApprove = !grant.approval_required && !!member && member.role !== "viewer";
      const { data: items } = await admin.from("helpdesk_hardware_line_items").select("description, quantity, unit_price").eq("leg_id", legId).order("sort_order");
      const itemsText = ((items ?? []) as { description: string; quantity: number }[]).map((i) => `${i.quantity}× ${i.description}`).join(", ");

      for (const inv of invoices) {
        if (inv.gm_expense_id) continue;
        if (!(Number(inv.amount) > 0)) {
          warnings.push(`${inv.file_name} has no invoice amount, so it wasn't posted to the grant.`);
          continue;
        }
        const lineId = inv.gm_line_id ?? suggested;
        if (!lineId) {
          warnings.push(`No budget line was picked for ${inv.file_name} and ${grant.code} has no equipment or supplies line, so it wasn't posted.`);
          continue;
        }
        const now = new Date().toISOString();
        const { data: exp, error } = await admin
          .from("gm_expenses")
          .insert({
            grant_id: grantId,
            line_id: lineId,
            expense_date: todayChicago(),
            vendor: inv.vendor || null,
            amount: Number(inv.amount),
            description: `IT hardware purchase: ${request.title}${itemsText ? ` (${itemsText})` : ""}. Requested by ${request.submitted_by}.`.slice(0, 500),
            office_id: detail?.office_id ?? grant.office_id,
            program: grant.program,
            kind: "purchase",
            payment_method: inv.payment_method ?? "other",
            doc_required: true,
            status: autoApprove ? "approved" : "submitted",
            source: "manual",
            external_ref: `${ticketLabel} (IT Help Desk)`,
            helpdesk_request_id: request.id,
            helpdesk_attachment_id: inv.id,
            created_by: actor,
            submitted_by: actor,
            submitted_at: now,
            reviewed_at: autoApprove ? now : null,
            review_note: autoApprove ? "Auto-approved: this grant doesn't require approval." : null,
          })
          .select("id")
          .single();
        if (error || !exp) {
          // Unique index: another close-out run already posted this invoice.
          if (error?.code === "23505") continue;
          warnings.push(`Couldn't post ${inv.file_name} to ${grant.code}: ${error?.message ?? "unknown error"}`);
          continue;
        }

        // The invoice file goes with it, into Grant Management's own bucket.
        const file = await admin.storage.from(INVOICE_BUCKET).download(inv.storage_path);
        if (file.data) {
          const ext = (inv.storage_path.split(".").pop() ?? "pdf").slice(0, 5);
          const path = `${exp.id}/${randomUUID()}.${ext}`;
          const buf = Buffer.from(await file.data.arrayBuffer());
          const up = await admin.storage.from(GM_BUCKET).upload(path, buf, { contentType: inv.content_type ?? "application/pdf", upsert: false });
          if (!up.error) {
            await admin.from("gm_expense_documents").insert({
              expense_id: exp.id,
              storage_path: path,
              file_name: inv.file_name,
              content_type: inv.content_type,
              size_bytes: buf.length,
              doc_type: "invoice",
              uploaded_by: actor,
            });
          } else warnings.push(`Posted ${inv.file_name} to ${grant.code}, but couldn't attach the file: ${up.error.message}`);
        } else warnings.push(`Posted ${inv.file_name} to ${grant.code}, but couldn't read the file to attach it.`);

        await admin.from("helpdesk_attachments").update({ gm_expense_id: exp.id }).eq("id", inv.id);
        inv.gm_expense_id = exp.id;
        await admin.from("gm_audit_log").insert({
          entity: "expense",
          entity_id: exp.id,
          grant_id: grantId,
          action: autoApprove ? "submitted_auto_approved" : "submitted",
          actor_id: actor,
          changes: { source: "it_helpdesk", ticket: ticketLabel, amount: Number(inv.amount), vendor: inv.vendor },
          note: "Created from an IT hardware ticket",
        });
        posted.push({ invoice: inv.file_name, expenseId: exp.id, grant: grant.code });
        await logHardwareEvent(legId, "grant", `Posted ${inv.file_name} (${usd(inv.amount)}) to ${grant.code} in Grant Management${autoApprove ? "" : " for the grant team to review"}.`);
      }
    }
  }
  for (const w of warnings) await logHardwareEvent(legId, "grant", w, false);

  // ---------- 2. Email the requester, invoices attached ----------
  let emailed = false;
  const { data: claimed } = await admin
    .from("helpdesk_request_legs")
    .update({ hardware_closeout_emailed_at: new Date().toISOString() })
    .eq("id", legId)
    .is("hardware_closeout_emailed_at", null)
    .select("id")
    .maybeSingle();
  if (claimed) {
    const attachments: EmailAttachment[] = [];
    let total = 0;
    const tooBig: string[] = [];
    for (const inv of invoices) {
      const f = await admin.storage.from(INVOICE_BUCKET).download(inv.storage_path);
      if (!f.data) continue;
      const buf = Buffer.from(await f.data.arrayBuffer());
      if (total + buf.length > MAX_ATTACH_BYTES) {
        tooBig.push(inv.file_name);
        continue;
      }
      total += buf.length;
      attachments.push({ filename: inv.file_name, content: buf, contentType: inv.content_type ?? "application/octet-stream" });
    }
    const invoiced = invoices.reduce((s, i) => s + (Number(i.amount) || 0), 0);
    const rows: [string, string][] = [
      ["Ticket", ticketLabel],
      ["Request", request.title],
    ];
    if (leg.hardware_approved_amount != null) rows.push(["Approved budget", usd(leg.hardware_approved_amount)]);
    if (invoiced > 0) rows.push(["Invoiced", usd(invoiced)]);
    if (detail?.is_grant_purchase) rows.push(["Grant", detail.grant_name ?? "Yes"]);
    const res = await sendPortalEmail({
      to: [request.submitted_by_email],
      subject: `Your hardware has been purchased — ${ticketLabel} ${request.title}`.replace(/\s+/g, " "),
      html: emailLayout({
        eyebrow: EYEBROW,
        heading: "Your hardware request is complete",
        intro: `IT has purchased the equipment for your request and closed the ticket. The invoice${invoices.length > 1 ? "s are" : " is"} attached for your records${
          posted.length ? ", and the purchase has been recorded against the grant in Grant Management" : ""
        }.${tooBig.length ? ` ${escapeHtml(tooBig.join(", "))} ${tooBig.length > 1 ? "were" : "was"} too large to attach; open the ticket to download ${tooBig.length > 1 ? "them" : "it"}.` : ""}`,
        rows,
        button: { label: "Open ticket", href: `${siteUrl()}/helpdesk/${request.id}` },
      }),
      attachments,
    });
    if (res.ok) {
      emailed = true;
      await logHardwareEvent(legId, "closeout", `Emailed ${request.submitted_by} that the purchase is complete, with ${attachments.length} invoice${attachments.length === 1 ? "" : "s"} attached.`);
    } else {
      // Let a retry send it.
      await admin.from("helpdesk_request_legs").update({ hardware_closeout_emailed_at: null }).eq("id", legId);
      await logHardwareEvent(legId, "closeout", `Couldn't email the requester the invoice: ${res.error}. Use Retry close-out on the ticket.`, false);
    }
  }

  return { outcome: "done" as const, emailed, posted: posted.length, warnings };
}
