// Resources email notifications (per the proposal's "Automated Notification System",
// "Asset Change Notifications" and "Document Expiration Alert System").
// Department lists are editable in Resources → Settings; the office's regional director(s)
// and area manager(s) are looked up automatically. Every send is logged in res_notification_log.
import { createAdminClient } from "@/lib/supabase/server";
import { getResendClient } from "@/lib/resendClient";
import { ORG_APP_BASE_URL } from "@/lib/orgConfig";

export type ResEvent =
  | "asset_added"
  | "asset_removed"
  | "asset_updated"
  | "document_uploaded"
  | "policy_added"
  | "request_status"
  | "expiry";

type Dept = "finance" | "it" | "hr" | "marketing" | "grants" | "administration" | "coo";

export const DEPARTMENTS: { id: Dept; label: string }[] = [
  { id: "administration", label: "Administration" },
  { id: "finance", label: "Finance" },
  { id: "it", label: "Information Technology (IT)" },
  { id: "coo", label: "Chief Operating Officer (COO)" },
  { id: "hr", label: "Human Resources (HR)" },
  { id: "marketing", label: "Marketing" },
  { id: "grants", label: "Grant Management" },
];

// Who hears about what. RD = the office's regional director(s); AM = the office's area manager(s).
export const MATRIX: Record<ResEvent, { depts: Dept[]; rd: boolean; am: boolean; label: string }> = {
  asset_added: { depts: ["finance", "it", "hr", "marketing", "grants", "administration", "coo"], rd: true, am: true, label: "Vehicle, property or driver added" },
  asset_removed: { depts: ["finance", "it", "hr", "marketing", "grants", "administration", "coo"], rd: true, am: true, label: "Vehicle, property or driver removed" },
  asset_updated: { depts: ["finance", "it", "administration", "coo"], rd: true, am: true, label: "Record changed" },
  document_uploaded: { depts: ["finance", "it", "administration", "coo"], rd: true, am: true, label: "Document uploaded" },
  policy_added: { depts: ["finance", "administration", "coo"], rd: true, am: true, label: "Insurance policy added or renewed" },
  request_status: { depts: ["administration", "finance"], rd: false, am: true, label: "Insurance request status changed" },
  expiry: { depts: ["administration", "finance"], rd: true, am: true, label: "Expiration alert (90 / 60 / 30 days and on expiry)" },
};

export async function resolveRecipients(event: ResEvent, officeId: string, extra: string[] = []) {
  const admin = createAdminClient();
  const rule = MATRIX[event];
  const emails = new Set<string>(extra.filter(Boolean).map((e) => e.toLowerCase()));

  const { data: lists } = await admin.from("res_notification_recipients").select("department, emails").in("department", rule.depts);
  for (const l of lists ?? []) for (const e of l.emails ?? []) if (e) emails.add(String(e).toLowerCase());

  if (rule.rd || rule.am) {
    const { data: office } = await admin.from("b2s_offices").select("region").eq("id", officeId).maybeSingle();
    if (rule.rd && office?.region) {
      const { data: rds } = await admin.from("employees").select("email").eq("role", "regional_director").eq("assigned_region", office.region).neq("is_active", false);
      for (const r of rds ?? []) if (r.email) emails.add(r.email.toLowerCase());
    }
    if (rule.am) {
      const { data: ams } = await admin.from("employees").select("email").eq("role", "area_manager").eq("assigned_office_id", officeId).neq("is_active", false);
      for (const r of ams ?? []) if (r.email) emails.add(r.email.toLowerCase());
    }
  }
  return Array.from(emails);
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

/** Send (and log) a Resources notification. Never throws. */
export async function notifyResources(opts: {
  event: ResEvent;
  officeId: string;
  subject: string;
  heading: string;
  rows: [string, string | null | undefined][];
  path?: string; // portal path to the record
  related?: Record<string, unknown>;
  extraRecipients?: string[];
}) {
  const admin = createAdminClient();
  let status: "sent" | "skipped" | "failed" = "skipped";
  let error: string | null = null;
  let recipients: string[] = [];
  try {
    recipients = await resolveRecipients(opts.event, opts.officeId, opts.extraRecipients);
    const { data: office } = await admin.from("b2s_offices").select("field_office").eq("id", opts.officeId).maybeSingle();
    const resend = await getResendClient();
    if (!recipients.length) error = "No recipients configured for this event";
    else if (!resend) error = "Email is not configured (Resend)";
    else {
      const link = opts.path ? `${ORG_APP_BASE_URL.replace(/\/$/, "")}${opts.path}` : null;
      const rows = [["Office", office?.field_office ?? ""], ...opts.rows].filter(([, v]) => v != null && v !== "");
      const html = `<div style="font-family:Arial,sans-serif;max-width:560px;color:#16302B">
        <h2 style="font-size:18px;margin:0 0 12px">${esc(opts.heading)}</h2>
        <table style="border-collapse:collapse;width:100%;font-size:14px">${rows
          .map(([k, v]) => `<tr><td style="padding:6px 8px;color:#6b7c77;white-space:nowrap;vertical-align:top">${esc(k)}</td><td style="padding:6px 8px">${esc(String(v))}</td></tr>`)
          .join("")}</table>
        ${link ? `<p style="margin:18px 0"><a href="${esc(link)}" style="background:#1F6F54;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none">Open in the portal</a></p>` : ""}
        <p style="font-size:12px;color:#8a9894">You're receiving this because you're on the ${esc(MATRIX[opts.event].label.toLowerCase())} list for ICNA Relief Resources.</p>
      </div>`;
      const { error: sendErr } = await resend.client.emails.send({ from: resend.fromAddress, to: recipients, subject: opts.subject, html });
      if (sendErr) {
        status = "failed";
        error = sendErr.message;
      } else status = "sent";
    }
  } catch (e) {
    status = "failed";
    error = e instanceof Error ? e.message : String(e);
  }
  await admin.from("res_notification_log").insert({
    event: opts.event,
    subject: opts.subject,
    recipients,
    office_id: opts.officeId,
    related: opts.related ?? null,
    status,
    error,
  });
  return { status, recipients: recipients.length };
}
