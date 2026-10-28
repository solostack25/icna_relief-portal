import { createAdminClient } from "@/lib/supabase/server";
import { gGet } from "@/lib/devices/graph";
import { userSignIns } from "@/lib/security/identity";

// Self-service diagnostics for the Portal Assistant's "troubleshoot before
// a ticket" flow. Always about the REQUESTER only (their account, their
// devices, their office) - the route never accepts a target user.
//
// Everything is best-effort: each check that can't run (missing Graph
// permission, no Entra P1 for sign-in logs, device not enrolled) is
// reported as unavailable rather than failing the whole run. The output
// is plain-English `findings` the assistant can act on, plus the raw facts.

export type Area = "sign-in" | "email" | "teams" | "device" | "printer" | "network" | "onedrive" | "phone" | "software" | "security" | "general";

type Finding = { level: "problem" | "warning" | "ok" | "info"; text: string };

// Entra sign-in error codes staff actually hit, in plain language.
const SIGNIN_ERRORS: Record<string, string> = {
  "50126": "wrong password",
  "50053": "account temporarily locked after too many attempts",
  "50055": "password expired",
  "50057": "account is disabled",
  "50074": "MFA was required but not completed",
  "50076": "MFA was required but not completed",
  "500121": "MFA prompt failed or was denied",
  "50072": "needs to finish setting up MFA",
  "53003": "blocked by a sign-in policy (Conditional Access)",
  "530032": "blocked by a security policy",
  "50158": "an extra security check wasn't completed",
  "70044": "session expired, needs to sign in again",
  "50133": "session expired after a password change",
  "65001": "an app needs consent",
};

const SERVICE_FOR_AREA: Partial<Record<Area, string[]>> = {
  email: ["Exchange Online", "Microsoft 365 suite"],
  teams: ["Microsoft Teams", "Microsoft 365 suite"],
  onedrive: ["OneDrive for Business", "SharePoint Online", "Microsoft 365 suite"],
  "sign-in": ["Microsoft Entra", "Azure Active Directory", "Microsoft 365 suite"],
  software: ["Microsoft 365 apps", "Microsoft 365 suite"],
  general: ["Exchange Online", "Microsoft Teams", "SharePoint Online", "OneDrive for Business", "Microsoft 365 suite", "Microsoft Entra"],
};

function daysAgo(iso: string | null | undefined) {
  if (!iso) return null;
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
}

export async function runDiagnostics(employeeId: string, area: Area) {
  const admin = createAdminClient();
  const { data: emp } = await admin.from("employees").select("id, email, ad_object_id, assigned_office_id, first_name").eq("id", employeeId).maybeSingle();
  if (!emp) throw new Error("No employee record.");
  const email = emp.email.toLowerCase();
  const findings: Finding[] = [];
  const unavailable: string[] = [];

  // ---------- account ----------
  const [dirUser, mfa] = await Promise.all([
    admin.from("it_directory_users").select("entra_user_id, account_enabled, sku_ids, last_sign_in, synced_at").ilike("upn", email).maybeSingle(),
    admin.from("sec_mfa_registration").select("is_mfa_registered, is_sspr_registered, methods, default_method, synced_at").ilike("upn", email).maybeSingle(),
  ]);
  const entraId = emp.ad_object_id ?? dirUser.data?.entra_user_id ?? null;

  let licenses: string[] = [];
  if (dirUser.data?.sku_ids?.length) {
    const { data: skus } = await admin.from("it_license_skus").select("sku_id, friendly_name, sku_part_number").in("sku_id", dirUser.data.sku_ids);
    licenses = (skus ?? []).map((s: any) => s.friendly_name || s.sku_part_number);
  }
  const account = {
    enabled: dirUser.data?.account_enabled ?? null,
    licenses,
    lastSignIn: dirUser.data?.last_sign_in ?? null,
    mfaRegistered: mfa.data?.is_mfa_registered ?? null,
    canSelfResetPassword: mfa.data?.is_sspr_registered ?? null,
    mfaMethods: mfa.data?.methods ?? [],
  };
  if (account.enabled === false) findings.push({ level: "problem", text: "Your Microsoft account is disabled - only IT can turn it back on." });
  if (["email", "teams", "onedrive", "software"].includes(area) && dirUser.data && licenses.length === 0) findings.push({ level: "problem", text: "Your account has no Microsoft 365 license assigned, so Outlook/Teams/OneDrive won't work until IT assigns one." });
  if (area === "sign-in" || area === "security") {
    if (account.mfaRegistered === false) findings.push({ level: "warning", text: "You don't have MFA (Authenticator) set up yet." });
    if (account.canSelfResetPassword === false) findings.push({ level: "warning", text: "You can't reset your own password yet (no recovery method registered) - IT will need to reset it." });
    else if (account.canSelfResetPassword === true) findings.push({ level: "info", text: "You can reset your own password at https://aka.ms/sspr." });
  }

  // Recent sign-in failures (live; needs Entra ID P1 + AuditLog.Read.All).
  let recentFailures: { when: string; app: string | null; reason: string; location: string | null; country: string | null }[] | null = null;
  if (entraId && (area === "sign-in" || area === "security" || area === "general" || area === "email" || area === "teams")) {
    try {
      const rows = await userSignIns(entraId, 3);
      recentFailures = rows
        .filter((r) => !r.ok)
        .slice(0, 8)
        .map((r) => {
          const code = (r.error ?? "").match(/\b(\d{5,6})\b/)?.[1];
          return {
            when: r.at,
            app: r.app,
            reason: (code && SIGNIN_ERRORS[code]) || r.error || "unknown error",
            location: [r.city, r.state, r.country].filter(Boolean).join(", ") || null,
            country: r.country,
          };
        });
      const reasons = [...new Set(recentFailures.map((f) => f.reason))];
      if (recentFailures.length > 0) findings.push({ level: "problem", text: `${recentFailures.length} failed sign-in${recentFailures.length > 1 ? "s" : ""} in the last 3 days: ${reasons.slice(0, 3).join("; ")}.` });
      const locked = reasons.some((r) => /locked/.test(r));
      if (locked) findings.push({ level: "info", text: "The account lock clears on its own after about 15 minutes - stop retrying until then." });
      const foreign = recentFailures.filter((f) => f.country && f.country.toUpperCase() !== "US");
      if (foreign.length) findings.push({ level: "problem", text: `Failed sign-ins came from outside the US (${[...new Set(foreign.map((f) => f.location))].slice(0, 2).join(", ")}) - this could be someone else trying your password. Treat as a security issue.` });
    } catch {
      unavailable.push("sign-in history (needs Entra ID P1 and the AuditLog.Read.All permission)");
    }
  }

  // ---------- devices ----------
  const { data: devRows } = await admin
    .from("it_devices")
    .select("device_key, display_name, model, manufacturer, operating_system, os_version, compliance_state, is_encrypted, intune_last_sync, free_storage_bytes, total_storage_bytes, coverage, intune_id")
    .or(`employee_id.eq.${emp.id},owner_upn.ilike.${email},primary_user_upn.ilike.${email}`)
    .is("removed_at", null)
    .limit(6);
  const devices = (devRows ?? []).map((d: any) => {
    const freePct = d.total_storage_bytes ? Math.round(((d.free_storage_bytes ?? 0) / d.total_storage_bytes) * 100) : null;
    const lastSyncDays = daysAgo(d.intune_last_sync);
    return {
      key: d.device_key,
      name: d.display_name,
      model: [d.manufacturer, d.model].filter(Boolean).join(" ") || null,
      os: [d.operating_system, d.os_version].filter(Boolean).join(" ") || null,
      compliance: d.compliance_state,
      encrypted: d.is_encrypted,
      freeStoragePercent: freePct,
      freeStorageGB: d.free_storage_bytes != null ? Math.round(d.free_storage_bytes / 1e9) : null,
      lastCheckInDays: lastSyncDays,
      managed: !!d.intune_id,
    };
  });
  if (["device", "general", "software", "network", "printer", "onedrive"].includes(area)) {
    for (const d of devices) {
      if (d.freeStoragePercent != null && d.freeStoragePercent < 10) findings.push({ level: "problem", text: `${d.name} is almost out of disk space (${d.freeStorageGB} GB free, ${d.freeStoragePercent}%). That alone makes a computer slow and breaks updates and OneDrive.` });
      if (d.compliance === "noncompliant") findings.push({ level: "warning", text: `${d.name} is out of compliance with ICNA Relief's device policy, which can block email/Teams on it.` });
      if (d.lastCheckInDays != null && d.lastCheckInDays > 7) findings.push({ level: "warning", text: `${d.name} hasn't checked in with IT management for ${d.lastCheckInDays} days - it may be missing updates.` });
      if (d.encrypted === false) findings.push({ level: "info", text: `${d.name} isn't encrypted (BitLocker off).` });
    }
    if (devices.length === 0) findings.push({ level: "info", text: "No company-managed device is registered to you, so I can't check your computer remotely." });
  }

  // ---------- Microsoft 365 service health ----------
  let serviceIssues: { service: string; title: string; status: string; since: string | null }[] | null = null;
  const services = SERVICE_FOR_AREA[area];
  if (services) {
    try {
      const data = await gGet(`/v1.0/admin/serviceAnnouncement/issues?$filter=${encodeURIComponent("isResolved eq false")}&$top=50`);
      serviceIssues = ((data?.value ?? []) as any[])
        .filter((i) => services.some((s) => (i.service ?? "").toLowerCase().includes(s.toLowerCase())))
        .filter((i) => /incident/i.test(i.classification ?? "") || /serviceDegradation|serviceInterruption|investigating/i.test(i.status ?? ""))
        .slice(0, 4)
        .map((i) => ({ service: i.service, title: i.title, status: i.status, since: i.startDateTime ?? null }));
      if (serviceIssues.length) findings.push({ level: "problem", text: `Microsoft is reporting an active problem: ${serviceIssues.map((i) => `${i.service} - ${i.title}`).join("; ")}. Nothing on your end will fix this; it should clear when Microsoft resolves it.` });
    } catch {
      unavailable.push("Microsoft 365 service health (needs the ServiceHealth.Read.All permission)");
    }
  }

  // ---------- office pulse: is it just me? ----------
  let officeReports: { count: number; recentTitles: string[] } | null = null;
  if (emp.assigned_office_id && ["network", "printer", "phone", "email", "teams", "general"].includes(area)) {
    const since = new Date(Date.now() - 24 * 3_600_000).toISOString();
    const { data: officeEmps } = await admin.from("employees").select("email").eq("assigned_office_id", emp.assigned_office_id).neq("id", emp.id);
    const emails = (officeEmps ?? []).map((e: any) => e.email).filter(Boolean);
    if (emails.length) {
      const { data: reqs } = await admin.from("helpdesk_requests").select("title, created_at").in("submitted_by_email", emails).gte("created_at", since).order("created_at", { ascending: false }).limit(15);
      const kw: Record<string, RegExp> = {
        network: /internet|wi-?fi|network|connect|offline/i,
        printer: /print/i,
        phone: /phone|3cx|call/i,
        email: /outlook|email|mail/i,
        teams: /teams|call|meeting/i,
        general: /./,
      };
      const rel = (reqs ?? []).filter((r: any) => kw[area]?.test(r.title));
      officeReports = { count: rel.length, recentTitles: rel.slice(0, 4).map((r: any) => r.title) };
      if (rel.length >= 2) findings.push({ level: "problem", text: `${rel.length} other people in your office reported a similar problem in the last 24 hours - this is likely an office-wide issue, not your computer.` });
    }
  }

  if (findings.filter((f) => f.level === "problem" || f.level === "warning").length === 0) findings.push({ level: "ok", text: "Nothing wrong showed up on your account, devices, or Microsoft's service status, so we'll work through the usual fixes." });

  return { area, findings, account, recentFailures, devices, serviceIssues, officeReports, unavailable };
}

// Safe self-service action: ask Intune to sync the requester's OWN managed
// device (pulls pending policies/apps/updates). Never wipe/lock/restart.
export async function syncMyDevice(employeeId: string, deviceKey: string) {
  const admin = createAdminClient();
  const { data: emp } = await admin.from("employees").select("id, email").eq("id", employeeId).maybeSingle();
  if (!emp) throw new Error("No employee record.");
  const { data: d } = await admin.from("it_devices").select("device_key, display_name, intune_id, employee_id, owner_upn, primary_user_upn").eq("device_key", deviceKey).maybeSingle();
  const email = emp.email.toLowerCase();
  const mine = d && (d.employee_id === emp.id || (d.owner_upn ?? "").toLowerCase() === email || (d.primary_user_upn ?? "").toLowerCase() === email);
  if (!d || !mine) throw new Error("That device isn't registered to you.");
  if (!d.intune_id) throw new Error("That device isn't managed by Intune, so it can't be synced remotely.");
  const { gPost } = await import("@/lib/devices/graph");
  let ok = true;
  let error: string | undefined;
  try {
    await gPost(`/v1.0/deviceManagement/managedDevices/${d.intune_id}/syncDevice`, {});
  } catch (e) {
    ok = false;
    error = e instanceof Error ? e.message : "Sync failed";
  }
  await admin.from("it_device_audit").insert({ device_key: d.device_key, device_name: d.display_name, action: "sync", actor_id: emp.id, reason: "Self-service sync from Portal Assistant troubleshooting", ok, detail: error ? { error } : null });
  if (!ok) throw new Error(error);
  return { device: d.display_name };
}
