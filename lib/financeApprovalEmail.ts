// The "approval needed" email, with Approve / Request changes / Reject
// buttons right in the message. Each button opens the no-login approval
// page with that choice pre-selected; the decision is only recorded when
// the approver taps the confirm button there (a POST). Link scanners such
// as Outlook Safe Links open every link in an email, so a plain GET must
// never approve anything.

const CATEGORY_LABELS: Record<string, string> = {
  credit_card_reimbursement: "Credit Card Reimbursement",
  honorarium: "Honorarium",
  mileage_reimbursement: "Mileage Reimbursement",
  pex_new_card_request: "PEX New Card Request",
  pex_recharge_request: "PEX Recharge Request",
  utility_payment: "Utility Payment",
  vendor_payment: "Vendor Payment",
};

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const money = (n: number) => `$${Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function button(href: string, label: string, bg: string) {
  // Table-wrapped so it renders as a button in desktop Outlook too.
  return `<td style="padding:4px"><table role="presentation" cellspacing="0" cellpadding="0" border="0"><tr><td bgcolor="${bg}" style="border-radius:999px">` +
    `<a href="${esc(href)}" style="display:inline-block;padding:11px 16px;font-family:Segoe UI,Arial,sans-serif;font-size:14px;white-space:nowrap;font-weight:600;color:#ffffff;text-decoration:none;border-radius:999px">${label}</a>` +
    `</td></tr></table></td>`;
}

export function financeApprovalEmail(p: {
  link: string; // the approval page for this step
  ticketNumber: string;
  title: string;
  total: number;
  category: string | null;
  requestorName: string | null;
  submittedAt: string | null;
  level: number;
  revision: number;
  coveringFor: string | null; // chain person's name when a delegate is approving
  reminder?: boolean;
}) {
  const sep = p.link.includes("?") ? "&" : "?";
  const rows: [string, string][] = [
    ["Ticket", p.ticketNumber],
    ["Type", p.category ? CATEGORY_LABELS[p.category] ?? p.category : ""],
    ["Requested by", p.requestorName ?? ""],
    ["Submitted", p.submittedAt ? new Date(p.submittedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : ""],
    ["Approval level", String(p.level) + (p.revision > 1 ? ` · revision ${p.revision}` : "")],
  ].filter(([, v]) => v) as [string, string][];

  const lead = p.reminder ? "Reminder: this finance ticket is still waiting on you." : "A finance ticket needs your approval.";
  const cover = p.coveringFor ? `<p style="margin:0 0 12px;color:#6b7280;font-size:13px">You're covering this approval for ${esc(p.coveringFor)}.</p>` : "";

  const html = `<!doctype html><html><body style="margin:0;padding:0;background:#f4f6f5">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#f4f6f5"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:560px;background:#ffffff;border-radius:16px;font-family:Segoe UI,Arial,sans-serif;color:#16302B">
<tr><td style="padding:24px 24px 8px">
<div style="font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#1F6F54">ICNA Relief · Finance approval</div>
<p style="margin:12px 0 4px;font-size:15px">${lead}</p>
${cover}
<div style="font-size:18px;font-weight:600;margin:8px 0 2px">${esc(p.title)}</div>
<div style="font-size:30px;font-weight:700;margin:0 0 12px">${money(p.total)}</div>
<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="font-size:14px">
${rows.map(([k, v]) => `<tr><td style="padding:3px 16px 3px 0;color:#6b7280">${k}</td><td style="padding:3px 0">${esc(v)}</td></tr>`).join("")}
</table>
</td></tr>
<tr><td style="padding:16px 18px 4px">
<table role="presentation" cellspacing="0" cellpadding="0" border="0"><tr>
${button(`${p.link}${sep}action=approve`, "Approve", "#1F6F54")}
${button(`${p.link}${sep}action=fix`, "Changes", "#B7791F")}
${button(`${p.link}${sep}action=reject`, "Reject", "#B42318")}
</tr></table>
</td></tr>
<tr><td style="padding:12px 24px 24px;font-size:13px;color:#6b7280">
Tap a button, then confirm on the next screen. No login needed. "Changes" sends it back to the requestor with your note. <a href="${esc(p.link)}" style="color:#1F6F54">See the full ticket and receipts</a> first if you want.
</td></tr>
</table>
</td></tr></table></body></html>`;

  const subject = `${p.reminder ? "Reminder — " : ""}Finance Approval Needed: ${p.title} (${money(p.total)}) — ${p.ticketNumber}`;
  return { subject, html };
}
