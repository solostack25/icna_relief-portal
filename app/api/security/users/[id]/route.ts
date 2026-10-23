import { NextResponse } from "next/server";
import { getDeviceViewer } from "@/lib/devices/access";
import { gPatch, gPost, explainGraphError } from "@/lib/devices/graph";
import { logSecurityAction } from "@/lib/security/log";
import { createAdminClient } from "@/lib/supabase/server";

type Act = "revoke_sessions" | "block_signin" | "unblock_signin" | "dismiss_risk" | "confirm_compromised";
const PERM: Record<Act, string> = {
  revoke_sessions: "User.RevokeSessions.All",
  block_signin: "User.EnableDisableAccount.All",
  unblock_signin: "User.EnableDisableAccount.All",
  dismiss_risk: "IdentityRiskyUser.ReadWrite.All",
  confirm_compromised: "IdentityRiskyUser.ReadWrite.All",
};

// POST { action, reason } on an Entra user (id = Entra object id).
// All reversible; all logged in sec_action_log.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const viewer = await getDeviceViewer();
  if (!viewer) return NextResponse.json({ error: "IT access required" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const action = body.action as Act;
  const reason = typeof body.reason === "string" ? body.reason.trim() : "";
  if (!(action in PERM)) return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  if (reason.length < 5) return NextResponse.json({ error: "Add a short reason." }, { status: 400 });
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "Bad user id" }, { status: 400 });

  const admin = createAdminClient();
  const { data: u } = await admin.from("it_directory_users").select("upn, display_name").eq("entra_user_id", id).maybeSingle();

  // Don't let IT lock themselves out from the portal by accident.
  if (action === "block_signin" && u?.upn && u.upn.toLowerCase() === viewer.email.toLowerCase()) {
    return NextResponse.json({ error: "You can't block your own account from here." }, { status: 400 });
  }

  let error: string | null = null;
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
  } catch (e) {
    error = explainGraphError(e, PERM[action]);
  }

  await logSecurityAction({ targetType: "user", targetId: id, targetName: u?.display_name ?? u?.upn ?? null, action, actorId: viewer.employeeId, reason, ok: !error, detail: error ? { error } : null });
  if (error) return NextResponse.json({ error }, { status: 502 });
  return NextResponse.json({ ok: true });
}
