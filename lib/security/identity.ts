import { randomInt } from "crypto";
import { GraphError, explainGraphError, gDelete, gGet, gGetAll, gPatch, gPost } from "@/lib/devices/graph";

// Live identity operations on one Entra user. Server-only; callers check
// IT access and log to sec_action_log. Nothing secret returned from here
// (passwords, access passes) is ever stored.
//
// Application permissions (Portal app registration):
//   User-PasswordProfile.ReadWrite.All     password reset
//   UserAuthenticationMethod.ReadWrite.All list/remove sign-in methods, Temporary Access Pass
//   AuditLog.Read.All                      sign-in logs (needs Entra ID P1 on the tenant)
//   MailboxSettings.ReadWrite              read / disable / delete inbox rules

// ---------- passwords ----------

export function strongTempPassword(length = 16): string {
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const lower = "abcdefghijkmnpqrstuvwxyz";
  const digits = "23456789";
  const symbols = "!@#$%^&*";
  const all = upper + lower + digits + symbols;
  const pick = (s: string) => s[randomInt(s.length)];
  const chars = [pick(upper), pick(lower), pick(digits), pick(symbols)];
  while (chars.length < length) chars.push(pick(all));
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
}

export function explainPasswordError(err: unknown): string {
  if (err instanceof GraphError) {
    if (/on-premise|directory sync|DirSync/i.test(err.message))
      return "This account is synced from on-premises Active Directory, so its password has to be reset in AD (or turn on password writeback in Entra Connect).";
    if (err.status === 403)
      return 'Microsoft denied the reset (403). Grant the "User-PasswordProfile.ReadWrite.All" application permission, and give the Portal app the "Authentication Administrator" role in Entra (or "Privileged Authentication Administrator" to reset admins).';
  }
  return explainGraphError(err, "User-PasswordProfile.ReadWrite.All");
}

// Sets a random password. With reveal=false (compromise containment) the
// password is thrown away, so nobody, including IT, knows it.
export async function resetPassword(userId: string, opts: { forceChange: boolean }): Promise<string> {
  const password = strongTempPassword();
  await gPatch(`/v1.0/users/${userId}`, { passwordProfile: { password, forceChangePasswordNextSignIn: opts.forceChange } });
  return password;
}

// ---------- sign-in methods ----------

export type AuthMethod = { id: string; kind: string; label: string; detail: string | null; created: string | null; removable: boolean; segment: string | null };

const KINDS: Record<string, { kind: string; label: string; segment: string | null }> = {
  "#microsoft.graph.passwordAuthenticationMethod": { kind: "password", label: "Password", segment: null },
  "#microsoft.graph.microsoftAuthenticatorAuthenticationMethod": { kind: "authenticator", label: "Authenticator app", segment: "microsoftAuthenticatorMethods" },
  "#microsoft.graph.phoneAuthenticationMethod": { kind: "phone", label: "Phone (text / call)", segment: "phoneMethods" },
  "#microsoft.graph.softwareOathAuthenticationMethod": { kind: "totp", label: "Code app (TOTP)", segment: "softwareOathMethods" },
  "#microsoft.graph.hardwareOathAuthenticationMethod": { kind: "hardware", label: "Hardware token", segment: "hardwareOathMethods" },
  "#microsoft.graph.fido2AuthenticationMethod": { kind: "fido2", label: "Security key / passkey", segment: "fido2Methods" },
  "#microsoft.graph.windowsHelloForBusinessAuthenticationMethod": { kind: "hello", label: "Windows Hello", segment: "windowsHelloForBusinessMethods" },
  "#microsoft.graph.emailAuthenticationMethod": { kind: "email", label: "Email (password reset)", segment: "emailMethods" },
  "#microsoft.graph.temporaryAccessPassAuthenticationMethod": { kind: "tap", label: "Temporary Access Pass", segment: "temporaryAccessPassMethods" },
  "#microsoft.graph.platformCredentialAuthenticationMethod": { kind: "platform", label: "Mac platform credential", segment: "platformCredentialMethods" },
};

const last4 = (s: string | undefined) => (s ? `•••${s.replace(/\D/g, "").slice(-4)}` : null);

export async function listAuthMethods(userId: string): Promise<AuthMethod[]> {
  const rows = await gGetAll<Record<string, any>>(`/v1.0/users/${userId}/authentication/methods`);
  return rows.map((m) => {
    const k = KINDS[m["@odata.type"]] ?? { kind: "other", label: String(m["@odata.type"] ?? "Other").replace("#microsoft.graph.", ""), segment: null };
    const detail =
      k.kind === "phone"
        ? [m.phoneType, last4(m.phoneNumber)].filter(Boolean).join(" ")
        : k.kind === "email"
          ? m.emailAddress ?? null
          : k.kind === "tap"
            ? [m.isUsable ? "usable" : "used/expired", m.lifetimeInMinutes ? `${m.lifetimeInMinutes} min` : null].filter(Boolean).join(" · ")
            : [m.displayName, m.deviceTag, m.model].filter(Boolean).join(" · ") || null;
    return { id: m.id, kind: k.kind, label: k.label, detail, created: m.createdDateTime ?? null, removable: !!k.segment, segment: k.segment };
  });
}

export async function deleteAuthMethod(userId: string, m: Pick<AuthMethod, "id" | "segment">) {
  if (!m.segment) throw new Error("That method can't be removed.");
  await gDelete(`/v1.0/users/${userId}/authentication/${m.segment}/${m.id}`);
}

// Removes every removable method so the person must register MFA again.
// Entra won't delete the default method while others remain, so failures
// get one more pass once the rest are gone.
export async function clearAuthMethods(userId: string): Promise<{ removed: number; failed: { label: string; error: string }[] }> {
  let pending = (await listAuthMethods(userId)).filter((m) => m.removable);
  let removed = 0;
  let failed: { m: AuthMethod; error: string }[] = [];
  for (let pass = 0; pass < 2 && pending.length; pass++) {
    failed = [];
    for (const m of pending) {
      try {
        await deleteAuthMethod(userId, m);
        removed++;
      } catch (e) {
        failed.push({ m, error: explainGraphError(e, "UserAuthenticationMethod.ReadWrite.All") });
      }
    }
    pending = failed.map((f) => f.m);
  }
  return { removed, failed: failed.map((f) => ({ label: f.m.label, error: f.error })) };
}

// A Temporary Access Pass lets someone sign in (and set up MFA or Windows
// Hello) without a password. Only one can exist, so any old one goes first.
export async function issueTemporaryAccessPass(userId: string, opts: { minutes: number; oneTime: boolean }) {
  const existing = (await listAuthMethods(userId)).filter((m) => m.kind === "tap");
  for (const m of existing) await deleteAuthMethod(userId, m).catch(() => {});
  const tap = await gPost(`/v1.0/users/${userId}/authentication/temporaryAccessPassMethods`, {
    lifetimeInMinutes: opts.minutes,
    isUsableOnce: opts.oneTime,
  });
  return { pass: tap?.temporaryAccessPass as string, expiresMinutes: tap?.lifetimeInMinutes ?? opts.minutes, oneTime: !!tap?.isUsableOnce, startsAt: tap?.startDateTime ?? null };
}

export function explainTapError(err: unknown) {
  if (err instanceof GraphError && err.status === 400 && /policy|not enabled|disabled/i.test(err.message))
    return "Temporary Access Pass is turned off for this tenant. Enable it in Entra → Protection → Authentication methods → Temporary Access Pass.";
  return explainGraphError(err, "UserAuthenticationMethod.ReadWrite.All");
}

// ---------- sign-ins ----------

export type SignIn = {
  id: string;
  at: string;
  app: string | null;
  ip: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  ok: boolean;
  error: string | null;
  client: string | null;
  os: string | null;
  browser: string | null;
  device: string | null;
  risk: string | null;
  ca: string | null;
  userId: string | null;
  upn: string | null;
  name: string | null;
};

export function mapSignIn(s: Record<string, any>): SignIn {
  return {
    id: s.id,
    at: s.createdDateTime,
    app: s.appDisplayName ?? null,
    ip: s.ipAddress ?? null,
    city: s.location?.city || null,
    state: s.location?.state || null,
    country: s.location?.countryOrRegion || null,
    ok: (s.status?.errorCode ?? 0) === 0,
    error: s.status?.errorCode ? s.status?.failureReason || `Error ${s.status.errorCode}` : null,
    client: s.clientAppUsed ?? null,
    os: s.deviceDetail?.operatingSystem || null,
    browser: s.deviceDetail?.browser || null,
    device: s.deviceDetail?.displayName || null,
    risk: s.riskLevelDuringSignIn && s.riskLevelDuringSignIn !== "none" && s.riskLevelDuringSignIn !== "hidden" ? s.riskLevelDuringSignIn : null,
    ca: s.conditionalAccessStatus ?? null,
    userId: s.userId ?? null,
    upn: s.userPrincipalName ?? null,
    name: s.userDisplayName ?? null,
  };
}

const iso = (d: Date) => d.toISOString().replace(/\.\d{3}Z$/, "Z");

export async function userSignIns(userId: string, days = 14): Promise<SignIn[]> {
  const since = iso(new Date(Date.now() - days * 86_400_000));
  const filter = encodeURIComponent(`userId eq '${userId}' and createdDateTime ge ${since}`);
  const data = await gGet(`/v1.0/auditLogs/signIns?$filter=${filter}&$top=60`);
  return ((data?.value ?? []) as Record<string, any>[]).map(mapSignIn);
}

// Every interactive sign-in in the window, capped so a busy tenant can't
// hang the page. Returns whether the cap was hit.
export async function tenantSignIns(hours: number, cap = 8000): Promise<{ rows: SignIn[]; capped: boolean }> {
  const since = iso(new Date(Date.now() - hours * 3_600_000));
  let next: string | null = `/v1.0/auditLogs/signIns?$filter=${encodeURIComponent(`createdDateTime ge ${since}`)}&$top=999`;
  const rows: SignIn[] = [];
  while (next && rows.length < cap) {
    const data: { value?: Record<string, any>[]; "@odata.nextLink"?: string } = await gGet(next);
    rows.push(...(data?.value ?? []).map(mapSignIn));
    next = data?.["@odata.nextLink"] ?? null;
  }
  return { rows, capped: !!next };
}

export function explainSignInError(err: unknown) {
  if (err instanceof GraphError && err.status === 403 && /premium|license|P1/i.test(err.message))
    return "Sign-in logs through the API need an Entra ID P1 license on the tenant (included in Business Premium, E3 and E5).";
  return explainGraphError(err, "AuditLog.Read.All");
}

// ---------- inbox rules ----------

export type RawRule = {
  id: string;
  displayName?: string;
  isEnabled?: boolean;
  sequence?: number;
  conditions?: Record<string, any> | null;
  actions?: Record<string, any> | null;
};

export type RuleFinding = {
  external: string[];
  forwards: string[];
  flags: string[];
  severity: "high" | "medium" | null;
};

const KEYWORDS = /invoice|payment|wire|transfer|bank|ach|payroll|w-?2|password|security|phish|hack|compromis|suspicious|verify|helpdesk|it support|donat/i;

function addresses(list: unknown): string[] {
  return ((list as { emailAddress?: { address?: string } }[] | null) ?? []).map((r) => (r.emailAddress?.address ?? "").toLowerCase()).filter(Boolean);
}

// Looks for the patterns attackers set up after taking over a mailbox:
// forwarding mail outside the org, and rules that hide or delete replies.
export function analyzeRule(rule: RawRule, internalDomains: Set<string>): RuleFinding {
  const a = rule.actions ?? {};
  const c = rule.conditions ?? {};
  const forwards = Array.from(new Set([...addresses(a.forwardTo), ...addresses(a.redirectTo), ...addresses(a.forwardAsAttachmentTo)]));
  const external = forwards.filter((addr) => !internalDomains.has(addr.split("@")[1] ?? ""));
  const flags: string[] = [];
  if (external.length) flags.push(`Forwards mail outside ICNA Relief (${external.join(", ")})`);
  if (a.permanentDelete) flags.push("Permanently deletes matching mail");
  else if (a.delete) flags.push("Deletes matching mail");
  if (a.moveToFolder && a.markAsRead) flags.push("Moves matching mail away and marks it read (hides it)");
  const words = [...(c.subjectContains ?? []), ...(c.bodyOrSubjectContains ?? []), ...(c.bodyContains ?? [])].join(" ");
  if (KEYWORDS.test(words) && (a.delete || a.permanentDelete || a.moveToFolder || forwards.length)) flags.push(`Targets sensitive words ("${words.slice(0, 60)}")`);
  const name = (rule.displayName ?? "").trim();
  if (flags.length && (name.length <= 2 || !/[a-z]/i.test(name))) flags.push("Has a meaningless name, a common attacker trick");
  const severity = external.length ? "high" : flags.length ? "medium" : null;
  return { external, forwards, flags, severity };
}

export async function listInboxRules(userId: string): Promise<RawRule[]> {
  return gGetAll<RawRule>(`/v1.0/users/${userId}/mailFolders/inbox/messageRules`);
}

export async function setInboxRule(userId: string, ruleId: string, op: "disable" | "delete") {
  const path = `/v1.0/users/${userId}/mailFolders/inbox/messageRules/${ruleId}`;
  if (op === "delete") await gDelete(path);
  else await gPatch(path, { isEnabled: false });
}
