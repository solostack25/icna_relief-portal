import { NextResponse } from "next/server";
import { getDeviceViewer } from "@/lib/devices/access";
import { gPatch, gPost, explainGraphError } from "@/lib/devices/graph";
import {
  clearAuthMethods,
  deleteAuthMethod,
  explainPasswordError,
  explainTapError,
  issueTemporaryAccessPass,
  listAuthMethods,
  resetPassword,
} from "@/lib/security/identity";
import { scanUserMailboxRules } from "@/lib/security/mailboxRules";
import { logSecurityAction } from "@/lib/security/log";
import { createAdminClient } from "@/lib/supabase/server";

type Act =
  | "revoke_sessions"
  | "block_signin"
  | "unblock_signin"
  | "dismiss_risk"
  | "confirm_compromised"
  | "reset_password"
  | "clear_mfa"
  | "issue_tap"
  | "delete_method"
  | "scan_rules";

const PERM: Record<Act, string> = {
  revoke_sessions: "User.RevokeSessions.All",
  block_signin: "User.EnableDisableAccount.All",
  unblock_signin: "User.EnableDisableAccount.All",
  dismiss_risk: "IdentityRiskyUser.ReadWrite.All",
  confirm_compromised: "IdentityRiskyUser.ReadWrite.All",
  reset_password: "User-PasswordProfile.ReadWrite.All",
  clear_mfa: "UserAuthenticationMethod.ReadWrite.All",
  issue_tap: "UserAuthenticationMethod.ReadWrite.All",
  delete_method: "UserAuthenticationMethod.ReadWrite.All",
  scan_rules: "MailboxSettings.Read",
};

// Actions that would lock the person doing them out of the portal.
const NOT_ON_SELF: Act[] = ["block_signin", "reset_password", "clear_mfa", "confirm_compromised"];

// POST { action, reason, ...options } on an Entra user (id = Entra object id).
// Every call is logged in sec_action_log. Passwords and access passes are
// returned once and never stored or logged.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const viewer = await getDeviceViewer();
  if (!viewer) return NextResponse.json({ error: "IT access required" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const action = body.action as Act;
  const reason = typeof body.reason === "string" ? body.reason.trim().slice(0, 500) : "";
  if (!(action in PERM)) return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  if (action !== "scan_rules" && reason.length < 5) return NextResponse.json({ error: "Add a short reason." }, { status: 400 });
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "Bad user id" }, { status: 400 });

  const admin = createAdminClient();
  const { data: u } = await admin.from("it_directory_users").select("upn, display_name").eq("entra_user_id", id).maybeSingle();

  if (NOT_ON_SELF.includes(action) && u?.upn && u.upn.toLowerCase() === viewer.email.toLowerCase()) {
    return NextResponse.json({ error: "You can't do that to your own account from here." }, { status: 400 });
  }

  let error: string | null = null;
  let result: Record<string, unknown> = {};
  let detail: Record<string, unknown> | null = null;
  try {
    if (action === "revoke_sessions") await gPost(`/v1.0/users/${id}/revokeSignInSessions`, {});
    if (action === "block_signin" || action === "unblock_signin") {
      await gPatch(`/v1.0/users/${id}`, { accountEnabled: action === "unblock_signin" });
      await admin.from("it_directory_users").update({ account_enabled: action === "unblock_signin" }).eq("entra_user_id", id);
      // Blocking alone leaves existing sessions alive for up to an hour.
      if (action === "block_signin") await gPost(`/v1.0/users/${id}/revokeSignInSessions`, {}).catch(() => {});
    }
    if (action === "dismiss_risk" || action === "confirm_compromised") {
      await gPost(`/v1.0/identityProtection/riskyUsers/${action === "dismiss_risk" ? "dismiss" : "confirmCompromised"}`, { userIds: [id] });
      if (action === "dismiss_risk") await admin.from("sec_risky_users").delete().eq("user_id", id);
      else await admin.from("sec_risky_users").update({ risk_state: "confirmedCompromised", risk_level: "high" }).eq("user_id", id);
    }
    if (action === "reset_password") {
      try {
        const password = await resetPassword(id, { forceChange: body.forceChange !== false });
        // A new password should end every old session too.
        await gPost(`/v1.0/users/${id}/revokeSignInSessions`, {}).catch(() => {});
        result = { secret: password, secretLabel: body.forceChange !== false ? "Temporary password (they must change it at next sign-in)" : "New password" };
      } catch (e) {
        throw new Error(explainPasswordError(e));
      }
    }
    if (action === "clear_mfa") {
      const r = await clearAuthMethods(id);
      detail = { removed: r.removed, failed: r.failed };
      if (r.failed.length) error = `Removed ${r.removed}; couldn't remove ${r.failed.map((f) => `${f.label} (${f.error})`).join("; ")}`;
      else result = { message: `Removed ${r.removed} sign-in method${r.removed === 1 ? "" : "s"}. They'll be asked to set up MFA at next sign-in.` };
    }
    if (action === "issue_tap") {
      const minutes = Math.min(Math.max(Number(body.minutes) || 60, 10), 480);
      try {
        const tap = await issueTemporaryAccessPass(id, { minutes, oneTime: body.oneTime !== false });
        result = { secret: tap.pass, secretLabel: `Temporary Access Pass · ${tap.oneTime ? "one use" : "reusable"} · valid ${tap.expiresMinutes} min` };
        detail = { minutes: tap.expiresMinutes, oneTime: tap.oneTime };
      } catch (e) {
        throw new Error(explainTapError(e));
      }
    }
    if (action === "delete_method") {
      const methods = await listAuthMethods(id);
      const m = methods.find((x) => x.id === body.methodId);
      if (!m) throw new Error("That sign-in method is already gone.");
      await deleteAuthMethod(id, m);
      detail = { method: m.label, detail: m.detail };
    }
    if (action === "scan_rules") {
      const rows = await scanUserMailboxRules(id);
      result = { message: `${rows.length} inbox rule${rows.length === 1 ? "" : "s"}, ${rows.filter((r) => r.severity).length} flagged.` };
    }
  } catch (e) {
    error = e instanceof Error && !("status" in e) ? e.message : explainGraphError(e, PERM[action]);
  }

  if (action !== "scan_rules") {
    await logSecurityAction({
      targetType: "user",
      targetId: id,
      targetName: u?.display_name ?? u?.upn ?? null,
      action,
      actorId: viewer.employeeId,
      reason,
      ok: !error,
      detail: error ? { ...(detail ?? {}), error } : detail,
    });
  }
  if (error) return NextResponse.json({ error }, { status: 502 });
  return NextResponse.json({ ok: true, ...result }, { headers: { "Cache-Control": "no-store" } });
}
