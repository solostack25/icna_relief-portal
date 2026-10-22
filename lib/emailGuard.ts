import { Resend } from "resend";

// Global outbound-email kill switch.
//
// Every email the portal sends (Resend and Microsoft Graph sendMail) goes
// through this guard. Email is BLOCKED unless the Vercel env var
// EMAIL_SENDING_ENABLED is set to "true". While blocked, the only
// recipients that still get mail are the ones listed in EMAIL_ALLOWLIST
// (comma/semicolon separated), so demos can still be tested end-to-end
// without anything reaching real staff or donors. Blocked sends are
// logged ("[email-guard]") and reported to callers as successful no-ops
// so crons and workflows keep running instead of erroring.
//
// To turn real email back on: set EMAIL_SENDING_ENABLED=true in Vercel
// (Production) and redeploy.

export function emailSendingEnabled(): boolean {
  return (process.env.EMAIL_SENDING_ENABLED ?? "").trim().toLowerCase() === "true";
}

function allowlist(): string[] {
  return (process.env.EMAIL_ALLOWLIST ?? "")
    .split(/[,;\s]+/)
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

/** Normalizes a Resend/Graph style recipient field into a flat address list. */
export function toAddressList(value: string | string[] | null | undefined): string[] {
  if (!value) return [];
  const raw = Array.isArray(value) ? value : [value];
  return raw
    .flatMap((v) => String(v).split(/[;,]/))
    .map((e) => e.trim())
    .filter(Boolean);
}

/** Recipients allowed to receive mail right now (all of them when sending is enabled). */
export function allowedRecipients(addresses: string[]): string[] {
  if (emailSendingEnabled()) return addresses;
  const allow = allowlist();
  return addresses.filter((a) => {
    // Handles both "a@b.org" and "Name <a@b.org>".
    const m = a.match(/<([^>]+)>/);
    const addr = (m ? m[1] : a).trim().toLowerCase();
    return allow.includes(addr);
  });
}

export function logBlockedEmail(channel: string, subject: string | undefined, recipients: string[]) {
  console.warn(
    `[email-guard] BLOCKED ${channel} email "${subject ?? ""}" to ${recipients.join(", ") || "(none)"} — set EMAIL_SENDING_ENABLED=true to send`
  );
}

type SendFn = Resend["emails"]["send"];

/**
 * Drop-in replacement for `new Resend(apiKey)` whose emails.send respects
 * the kill switch above.
 */
export function createGuardedResend(apiKey: string): Resend {
  const resend = new Resend(apiKey);
  const original = resend.emails.send.bind(resend.emails) as SendFn;

  const guarded = (async (payload: Parameters<SendFn>[0], options?: Parameters<SendFn>[1]) => {
    if (emailSendingEnabled()) return original(payload, options);

    const p = payload as unknown as { to?: string | string[]; cc?: string | string[]; bcc?: string | string[]; subject?: string };
    const to = toAddressList(p.to);
    const keepTo = allowedRecipients(to);
    const keepCc = allowedRecipients(toAddressList(p.cc));
    const keepBcc = allowedRecipients(toAddressList(p.bcc));

    if (keepTo.length === 0) {
      logBlockedEmail("resend", p.subject, [...to, ...toAddressList(p.cc), ...toAddressList(p.bcc)]);
      return { data: { id: "blocked-by-email-guard" }, error: null } as unknown as Awaited<ReturnType<SendFn>>;
    }

    return original(
      {
        ...(payload as object),
        to: keepTo,
        cc: keepCc.length ? keepCc : undefined,
        bcc: keepBcc.length ? keepBcc : undefined,
      } as Parameters<SendFn>[0],
      options
    );
  }) as SendFn;

  resend.emails.send = guarded;
  return resend;
}
