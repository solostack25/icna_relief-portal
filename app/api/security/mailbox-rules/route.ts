import { NextResponse } from "next/server";
import { getDeviceViewer } from "@/lib/devices/access";
import { gPatch, explainGraphError } from "@/lib/devices/graph";
import { setInboxRule } from "@/lib/security/identity";
import { logSecurityAction } from "@/lib/security/log";
import { createAdminClient } from "@/lib/supabase/server";

type Act = "disable" | "enable" | "delete" | "mark_ok";

// POST { userId, ruleId, action, reason }
// disable / enable / delete change the rule in the person's mailbox
// (MailboxSettings.ReadWrite). mark_ok only clears the flag in the portal
// until the rule's findings change. All logged.
export async function POST(req: Request) {
  const viewer = await getDeviceViewer();
  if (!viewer) return NextResponse.json({ error: "IT access required" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const action = body.action as Act;
  const userId = String(body.userId ?? "");
  const ruleId = String(body.ruleId ?? "");
  const reason = typeof body.reason === "string" ? body.reason.trim().slice(0, 500) : "";
  if (!["disable", "enable", "delete", "mark_ok"].includes(action)) return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  if (!/^[0-9a-f-]{36}$/i.test(userId) || !ruleId || ruleId.length > 300) return NextResponse.json({ error: "Bad rule" }, { status: 400 });
  if (action !== "enable" && reason.length < 5) return NextResponse.json({ error: "Add a short reason." }, { status: 400 });

  const admin = createAdminClient();
  const { data: rule } = await admin.from("sec_mailbox_rules").select("rule_name, display_name, upn, flags").eq("user_id", userId).eq("rule_id", ruleId).maybeSingle();
  if (!rule) return NextResponse.json({ error: "Rule not found. Re-scan the mailbox." }, { status: 404 });

  let error: string | null = null;
  try {
    if (action === "disable") await setInboxRule(userId, ruleId, "disable");
    if (action === "delete") await setInboxRule(userId, ruleId, "delete");
    if (action === "enable") await gPatch(`/v1.0/users/${userId}/mailFolders/inbox/messageRules/${ruleId}`, { isEnabled: true });
  } catch (e) {
    error = explainGraphError(e, "MailboxSettings.ReadWrite");
  }

  if (!error) {
    if (action === "delete") await admin.from("sec_mailbox_rules").delete().eq("user_id", userId).eq("rule_id", ruleId);
    else if (action === "mark_ok")
      await admin
        .from("sec_mailbox_rules")
        .update({ reviewed_flags: rule.flags ?? [], reviewed_by: viewer.employeeId, reviewed_at: new Date().toISOString() })
        .eq("user_id", userId)
        .eq("rule_id", ruleId);
    else await admin.from("sec_mailbox_rules").update({ enabled: action === "enable" }).eq("user_id", userId).eq("rule_id", ruleId);
  }

  await logSecurityAction({
    targetType: "user",
    targetId: userId,
    targetName: rule.display_name ?? rule.upn,
    action: `rule_${action}`,
    actorId: viewer.employeeId,
    reason: reason || null,
    ok: !error,
    detail: { rule: rule.rule_name, ...(error ? { error } : {}) },
  });
  if (error) return NextResponse.json({ error }, { status: 502 });
  return NextResponse.json({ ok: true });
}
