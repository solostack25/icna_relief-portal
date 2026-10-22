import { allowedRecipients, logBlockedEmail } from "@/lib/emailGuard";
import { getResendClient } from "@/lib/resendClient";
import { getGraphToken } from "@/lib/msgraph";
import { getIntegrationSetting } from "@/lib/integrationSettings";

// One email sender for workflow notifications that need HTML bodies
// and file attachments (calendar invites, signed PDFs). Resend first
// (what IRFAS already uses), Microsoft Graph sendMail as a fallback
// (what Finance Tickets use). Never throws - the caller logs the
// result, so a mail outage shows up on the request's timeline instead
// of failing the approval that triggered it.

export type EmailAttachment = { filename: string; content: Buffer; contentType: string };

export type SendResult = { ok: boolean; via: "resend" | "graph" | null; error?: string };

export async function sendPortalEmail(params: {
  to: string[];
  cc?: string[];
  subject: string;
  html: string;
  attachments?: EmailAttachment[];
  replyTo?: string;
}): Promise<SendResult> {
  const requestedTo = dedupe(params.to);
  const to = allowedRecipients(requestedTo);
  const cc = allowedRecipients(dedupe(params.cc ?? []).filter((e) => !to.includes(e)));
  if (requestedTo.length === 0) return { ok: false, via: null, error: "No recipients" };
  if (to.length === 0) {
    logBlockedEmail("portal", params.subject, [...requestedTo, ...(params.cc ?? [])]);
    return { ok: true, via: null };
  }

  const errors: string[] = [];

  const resend = await getResendClient().catch(() => null);
  if (resend) {
    try {
      const { error } = await resend.client.emails.send({
        from: resend.fromAddress,
        to,
        cc: cc.length ? cc : undefined,
        replyTo: params.replyTo,
        subject: params.subject,
        html: params.html,
        attachments: params.attachments?.map((a) => ({ filename: a.filename, content: a.content, contentType: a.contentType })),
      });
      if (!error) return { ok: true, via: "resend" };
      errors.push(`Resend: ${error.message}`);
    } catch (e) {
      errors.push(`Resend: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  try {
    const fromMailbox = (await getIntegrationSetting("speaker_requests_from_mailbox", "approvals@icnarelief.org")) ?? "approvals@icnarelief.org";
    const token = await getGraphToken();
    const res = await fetch(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(fromMailbox)}/sendMail`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        message: {
          subject: params.subject,
          body: { contentType: "HTML", content: params.html },
          toRecipients: to.map((address) => ({ emailAddress: { address } })),
          ccRecipients: cc.map((address) => ({ emailAddress: { address } })),
          replyTo: params.replyTo ? [{ emailAddress: { address: params.replyTo } }] : undefined,
          attachments: params.attachments?.map((a) => ({
            "@odata.type": "#microsoft.graph.fileAttachment",
            name: a.filename,
            contentType: a.contentType,
            contentBytes: a.content.toString("base64"),
          })),
        },
        saveToSentItems: true,
      }),
    });
    if (res.ok) return { ok: true, via: "graph" };
    errors.push(`Graph: ${res.status} ${(await res.text()).slice(0, 200)}`);
  } catch (e) {
    errors.push(`Graph: ${e instanceof Error ? e.message : String(e)}`);
  }

  return { ok: false, via: null, error: errors.join(" | ") || "No email provider configured" };
}

function dedupe(list: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of list) {
    const e = (raw ?? "").trim();
    if (!e || !e.includes("@")) continue;
    const k = e.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(e);
  }
  return out;
}

export function escapeHtml(s: string | null | undefined): string {
  return (s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Simple branded shell matching the portal's emerald/cream palette.
export function emailLayout(opts: { heading: string; intro?: string; rows?: [string, string][]; button?: { label: string; href: string }; footer?: string; extraHtml?: string }) {
  const rows = (opts.rows ?? [])
    .map(
      ([k, v]) =>
        `<tr><td style="padding:6px 12px 6px 0;color:#6b7c77;font-size:13px;white-space:nowrap;vertical-align:top">${escapeHtml(k)}</td><td style="padding:6px 0;color:#16302B;font-size:14px;font-weight:600">${escapeHtml(v)}</td></tr>`
    )
    .join("");
  const button = opts.button
    ? `<p style="margin:24px 0 8px"><a href="${opts.button.href}" style="display:inline-block;background:#1F6F54;color:#fff;text-decoration:none;font-weight:700;font-size:14px;padding:12px 22px;border-radius:999px">${escapeHtml(opts.button.label)}</a></p><p style="font-size:12px;color:#8a9893;margin:0">Or paste this link: ${opts.button.href}</p>`
    : "";
  return `<!doctype html><html><body style="margin:0;background:#FBF7EF;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif">
<div style="max-width:560px;margin:0 auto;padding:28px 18px">
<div style="background:#fff;border-radius:18px;padding:28px;box-shadow:0 6px 24px rgba(22,48,43,0.08)">
<div style="font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:#1F6F54;font-weight:700;margin-bottom:10px">ICNA Relief · Speaker Requests</div>
<h1 style="font-family:Georgia,serif;font-style:italic;font-weight:500;font-size:24px;color:#16302B;margin:0 0 12px">${escapeHtml(opts.heading)}</h1>
${opts.intro ? `<p style="font-size:14px;line-height:1.55;color:#33504a;margin:0 0 16px">${opts.intro}</p>` : ""}
${rows ? `<table style="border-collapse:collapse;margin:8px 0">${rows}</table>` : ""}
${opts.extraHtml ?? ""}
${button}
</div>
<p style="font-size:11px;color:#8a9893;text-align:center;margin-top:16px">${escapeHtml(opts.footer ?? "Sent automatically by the ICNA Relief Staff Portal.")}</p>
</div></body></html>`;
}
