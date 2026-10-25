import { NextResponse } from "next/server";
import { audit, getDeviceViewer } from "@/lib/devices/access";
import { gPatch, gPost, explainGraphError } from "@/lib/devices/graph";
import { clearAuthMethods, explainPasswordError, resetPassword, setInboxRule } from "@/lib/security/identity";
import { scanUserMailboxRules } from "@/lib/security/mailboxRules";
import { logSecurityAction } from "@/lib/security/log";
import { mdePost, explainMdeError } from "@/lib/security/mde";
import { createAdminClient } from "@/lib/supabase/server";

export const maxDuration = 120;

export type ContainStep = { key: string; label: string; status: "ok" | "failed" | "skipped"; note?: string };

// Compromised-account playbook. POST { reason, clearMfa?, disableRules?, isolateDevices?, openTicket? }
//
// Runs every containment step in order and keeps going when one fails, so
// a missing license or permission never leaves the account half-contained.
// The password is set to a random value nobody sees; IT restores access
// later with a new password or a Temporary Access Pass from the user page.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const viewer = await getDeviceViewer();
  if (!viewer) return NextResponse.json({ error: "IT access required" }, { status: 403 });
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "Bad user id" }, { status: 400 });

  const body = await req.json().catch(() => ({}));
  const reason = typeof body.reason === "string" ? body.reason.trim().slice(0, 500) : "";
  if (reason.length < 5) return NextResponse.json({ error: "Say what happened (e.g. incident # or what the person reported)." }, { status: 400 });
  const opt = {
    clearMfa: body.clearMfa !== false,
    disableRules: body.disableRules !== false,
    isolateDevices: body.isolateDevices === true,
    openTicket: body.openTicket !== false,
  };

  const admin = createAdminClient();
  const { data: u } = await admin.from("it_directory_users").select("upn, display_name, office_location").eq("entra_user_id", id).maybeSingle();
  if (!u) return NextResponse.json({ error: "Person not found in the directory sync." }, { status: 404 });
  if (u.upn.toLowerCase() === viewer.email.toLowerCase()) return NextResponse.json({ error: "You can't run this on your own account." }, { status: 400 });

  const steps: ContainStep[] = [];
  async function step(key: string, label: string, fn: () => Promise<string | void>) {
    try {
      const note = await fn();
      steps.push({ key, label, status: "ok", ...(note ? { note } : {}) });
    } catch (e) {
      steps.push({ key, label, status: "failed", note: e instanceof Error && !("status" in e) ? e.message : explainGraphError(e) });
    }
  }
  const skip = (key: string, label: string, note: string) => steps.push({ key, label, status: "skipped", note });

  // 1-2: stop the attacker right now.
  await step("block", "Block sign-in", async () => {
    try {
      await gPatch(`/v1.0/users/${id}`, { accountEnabled: false });
    } catch (e) {
      throw new Error(explainGraphError(e, "User.EnableDisableAccount.All"));
    }
    await admin.from("it_directory_users").update({ account_enabled: false }).eq("entra_user_id", id);
  });
  await step("revoke", "Sign out of every session and app", async () => {
    try {
      await gPost(`/v1.0/users/${id}/revokeSignInSessions`, {});
    } catch (e) {
      throw new Error(explainGraphError(e, "User.RevokeSessions.All"));
    }
  });

  // 3-4: make the stolen credentials useless.
  await step("password", "Reset password to a random one nobody knows", async () => {
    try {
      await resetPassword(id, { forceChange: true });
    } catch (e) {
      throw new Error(explainPasswordError(e));
    }
  });
  if (opt.clearMfa) {
    await step("mfa", "Remove sign-in methods (attacker may have added their own)", async () => {
      const r = await clearAuthMethods(id);
      if (r.failed.length) throw new Error(`Removed ${r.removed}; couldn't remove ${r.failed.map((f) => `${f.label}: ${f.error}`).join("; ")}`);
      return `Removed ${r.removed}`;
    });
  } else skip("mfa", "Remove sign-in methods", "Left as is (unticked).");

  // 5: tell Entra ID Protection (P2). Non-fatal without the license.
  await step("risk", "Mark as compromised in Entra ID Protection", async () => {
    try {
      await gPost(`/v1.0/identityProtection/riskyUsers/confirmCompromised`, { userIds: [id] });
    } catch (e) {
      throw new Error(`${explainGraphError(e, "IdentityRiskyUser.ReadWrite.All")} (needs Entra ID P2, part of E5)`);
    }
    await admin
      .from("sec_risky_users")
      .upsert({ user_id: id, upn: u.upn, display_name: u.display_name, risk_level: "high", risk_state: "confirmedCompromised", synced_at: new Date().toISOString() });
  });

  // 6: forwarding / hiding rules the attacker set up. Disabled, not
  // deleted, so they stay as evidence.
  let flaggedRules: { rule_name: string | null; flags: string[] }[] = [];
  if (opt.disableRules) {
    await step("rules", "Check inbox rules and switch off suspicious ones", async () => {
      let rows;
      try {
        rows = await scanUserMailboxRules(id);
      } catch (e) {
        throw new Error(explainGraphError(e, "MailboxSettings.ReadWrite"));
      }
      const bad = rows.filter((r) => r.severity && r.enabled);
      flaggedRules = bad.map((r) => ({ rule_name: r.rule_name, flags: r.flags }));
      const failed: string[] = [];
      for (const r of bad) {
        try {
          await setInboxRule(id, r.rule_id, "disable");
          await admin.from("sec_mailbox_rules").update({ enabled: false }).eq("user_id", id).eq("rule_id", r.rule_id);
        } catch (e) {
          failed.push(`${r.rule_name ?? "unnamed"}: ${explainGraphError(e, "MailboxSettings.ReadWrite")}`);
        }
      }
      if (failed.length) throw new Error(`Couldn't switch off: ${failed.join("; ")}`);
      return bad.length ? `Switched off ${bad.length} of ${rows.length}: ${bad.map((r) => r.rule_name || "unnamed").join(", ")}` : `${rows.length} rule${rows.length === 1 ? "" : "s"}, none suspicious`;
    });
  } else skip("rules", "Check inbox rules", "Left as is (unticked).");

  // 7: optional, for when the device itself may be infected.
  if (opt.isolateDevices) {
    const { data: devs } = await admin
      .from("it_devices")
      .select("device_key, display_name, mde_device_id, mde_onboarding")
      .ilike("owner_upn", u.upn)
      .is("removed_at", null);
    const onboarded = ((devs ?? []) as { device_key: string; display_name: string | null; mde_device_id: string | null; mde_onboarding: string | null }[]).filter(
      (d) => d.mde_device_id && String(d.mde_onboarding ?? "").toLowerCase() === "onboarded"
    );
    if (!onboarded.length) skip("isolate", "Isolate their PCs", "None of their devices are onboarded to Defender for Endpoint.");
    for (const d of onboarded) {
      await step(`isolate:${d.device_key}`, `Isolate ${d.display_name ?? "PC"}`, async () => {
        try {
          await mdePost(`/machines/${d.mde_device_id}/isolate`, { Comment: `ICNA portal (${viewer.name}): compromised account ${u.upn}: ${reason}`.slice(0, 1000), IsolationType: "Full" });
        } catch (e) {
          throw new Error(explainMdeError(e, "Machine.Isolate"));
        }
        await admin.from("it_devices").update({ mde_isolation_state: "isolated", mde_isolation_changed_at: new Date().toISOString() }).eq("device_key", d.device_key);
        await audit({ deviceKey: d.device_key, deviceName: d.display_name, action: "isolate_full", actorId: viewer.employeeId, reason: `Compromised account playbook: ${reason}` });
      });
    }
  }

  // 8: a ticket so the follow-up (talk to the person, restore access,
  // check what was sent) doesn't get lost.
  let ticket: string | null = null;
  if (opt.openTicket) {
    await step("ticket", "Open an urgent IT ticket for follow-up", async () => {
      const lines = [
        `Compromised-account playbook run by ${viewer.name} for ${u.display_name ?? u.upn} (${u.upn}).`,
        `Reason: ${reason}`,
        "",
        "Steps:",
        ...steps.map((s) => `- ${s.status === "ok" ? "✓" : s.status === "failed" ? "✗" : "–"} ${s.label}${s.note ? ` (${s.note})` : ""}`),
        ...(flaggedRules.length ? ["", "Suspicious inbox rules:", ...flaggedRules.map((r) => `- ${r.rule_name || "unnamed"}: ${r.flags.join("; ")}`)] : []),
        "",
        "Follow-up:",
        "- Confirm with the person what happened (phishing link, shared password, etc.).",
        "- Check what was sent from their mailbox and warn anyone who got phishing from them.",
        "- Restore access from Security → their page: Unblock sign-in, then issue a Temporary Access Pass so they can set up MFA again.",
      ];
      const { data: r, error } = await admin
        .from("helpdesk_requests")
        .insert({ title: `Compromised account: ${u.display_name ?? u.upn}`.slice(0, 200), description: lines.join("\n"), submitted_by: viewer.name, submitted_by_email: viewer.email, overall_status: "open" })
        .select("id, ticket_number")
        .single();
      if (error || !r) throw new Error(error?.message ?? "Couldn't create the ticket.");
      const { error: legErr } = await admin.from("helpdesk_request_legs").insert({ request_id: r.id, department: "it", category: "Security Incident", priority: "urgent", status: "open" });
      if (legErr) {
        await admin.from("helpdesk_requests").delete().eq("id", r.id);
        throw new Error(legErr.message);
      }
      ticket = r.ticket_number ?? r.id;
      return `Ticket ${ticket}`;
    });
  }

  const failed = steps.filter((s) => s.status === "failed").length;
  const contained = steps.find((s) => s.key === "block")?.status === "ok" && steps.find((s) => s.key === "revoke")?.status === "ok";
  await logSecurityAction({
    targetType: "user",
    targetId: id,
    targetName: u.display_name ?? u.upn,
    action: "contain_account",
    actorId: viewer.employeeId,
    reason,
    ok: !!contained,
    detail: { steps, options: opt, ticket },
  });
  return NextResponse.json({ ok: true, contained, failed, steps, ticket });
}
