import { createAdminClient } from "@/lib/supabase/server";
import { gGetAll, gPost, explainGraphError } from "@/lib/devices/graph";
import { scanAllMailboxRules } from "./mailboxRules";

// Pulls security data from Microsoft Graph into the sec_* tables (and
// Defender columns on it_devices). Each source is independent: a
// missing permission or license blanks that source only, and the run
// records why.
//
// Application permissions:
//   SecurityEvents.Read.All      Secure Score + recommendations
//   SecurityIncident.Read.All    Defender XDR incidents
//   SecurityAlert.Read.All       alerts inside incidents (devices/users)
//   AuditLog.Read.All            MFA registration report
//   IdentityRiskyUser.Read.All   Entra ID Protection risky users
//   ThreatHunting.Read.All       Defender for Endpoint device data (advanced hunting)
//   MailboxSettings.Read         inbox rules (forwarding / hiding rules)

type Admin = ReturnType<typeof createAdminClient>;

function chunk<T>(xs: T[], n: number) {
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += n) out.push(xs.slice(i, i + n));
  return out;
}
const iso = (d: Date) => d.toISOString().replace(/\.\d{3}Z$/, "Z");

async function secureScore(admin: Admin, now: string, counts: Record<string, number>) {
  const scores = await gGetAll<{
    id: string;
    createdDateTime: string;
    currentScore: number;
    maxScore: number;
    licensedUserCount?: number;
    activeUserCount?: number;
    averageComparativeScores?: unknown;
    controlScores?: { controlName: string; score?: number; implementationStatus?: string }[];
  }>("/v1.0/security/secureScores?$top=90");
  if (scores.length) {
    await admin.from("sec_secure_scores").upsert(
      scores.map((s) => ({
        id: s.id,
        created_at: s.createdDateTime,
        current_score: s.currentScore,
        max_score: s.maxScore,
        licensed_users: s.licensedUserCount ?? null,
        active_users: s.activeUserCount ?? null,
        comparative: s.averageComparativeScores ?? null,
        synced_at: now,
      }))
    );
  }
  counts.secure_scores = scores.length;

  const latest = scores.sort((a, b) => b.createdDateTime.localeCompare(a.createdDateTime))[0];
  const current = new Map((latest?.controlScores ?? []).map((c) => [c.controlName, c]));
  const profiles = await gGetAll<{
    id: string;
    title: string;
    controlCategory?: string;
    service?: string;
    maxScore?: number;
    implementationCost?: string;
    userImpact?: string;
    tier?: string;
    threats?: string[];
    remediation?: string;
    remediationImpact?: string;
    actionUrl?: string;
    rank?: number;
    deprecated?: boolean;
  }>("/v1.0/security/secureScoreControlProfiles");
  const rows = profiles.map((p) => {
    const c = current.get(p.id);
    return {
      id: p.id,
      title: p.title,
      category: p.controlCategory ?? null,
      service: p.service ?? null,
      max_score: p.maxScore ?? null,
      current_score: c?.score ?? null,
      implementation_status: c?.implementationStatus ?? null,
      implementation_cost: p.implementationCost ?? null,
      user_impact: p.userImpact ?? null,
      tier: p.tier ?? null,
      threats: p.threats ?? [],
      remediation: p.remediation ?? null,
      remediation_impact: p.remediationImpact ?? null,
      action_url: p.actionUrl ?? null,
      rank: p.rank ?? null,
      deprecated: !!p.deprecated,
      synced_at: now,
    };
  });
  for (const c of chunk(rows, 300)) await admin.from("sec_score_controls").upsert(c);
  await admin.from("sec_score_controls").delete().lt("synced_at", now);
  counts.score_controls = rows.length;
}

type Alert = {
  title?: string;
  serviceSource?: string;
  evidence?: { "@odata.type"?: string; deviceDnsName?: string; userAccount?: { userPrincipalName?: string; accountName?: string } }[];
};
type Incident = {
  id: string;
  displayName?: string;
  severity?: string;
  status?: string;
  classification?: string;
  determination?: string;
  assignedTo?: string | null;
  createdDateTime?: string;
  lastUpdateDateTime?: string;
  incidentWebUrl?: string;
  alerts?: Alert[];
};

async function incidents(admin: Admin, now: string, counts: Record<string, number>) {
  const since = iso(new Date(Date.now() - 90 * 86_400_000));
  const sets = await Promise.all([
    gGetAll<Incident>(`/v1.0/security/incidents?$top=50&$expand=alerts&$filter=${encodeURIComponent(`lastUpdateDateTime ge ${since}`)}`),
    gGetAll<Incident>(`/v1.0/security/incidents?$top=50&$expand=alerts&$filter=${encodeURIComponent("status eq 'active'")}`).catch(() => [] as Incident[]),
  ]);
  const byId = new Map<string, Incident>();
  for (const i of [...sets[0], ...sets[1]]) byId.set(i.id, i);
  const rows = Array.from(byId.values()).map((i) => {
    const devices = new Set<string>();
    const users = new Set<string>();
    const sources = new Set<string>();
    for (const a of i.alerts ?? []) {
      if (a.serviceSource) sources.add(a.serviceSource);
      for (const ev of a.evidence ?? []) {
        if (ev.deviceDnsName) devices.add(ev.deviceDnsName);
        const u = ev.userAccount?.userPrincipalName || ev.userAccount?.accountName;
        if (u) users.add(u);
      }
    }
    return {
      id: i.id,
      display_name: i.displayName ?? null,
      severity: i.severity ?? null,
      status: i.status ?? null,
      classification: i.classification ?? null,
      determination: i.determination ?? null,
      assigned_to: i.assignedTo ?? null,
      created_at: i.createdDateTime ?? null,
      last_update_at: i.lastUpdateDateTime ?? null,
      web_url: i.incidentWebUrl ?? null,
      alert_count: i.alerts?.length ?? 0,
      alert_titles: Array.from(new Set((i.alerts ?? []).map((a) => a.title).filter(Boolean) as string[])).slice(0, 20),
      devices: Array.from(devices).slice(0, 50),
      users: Array.from(users).slice(0, 50),
      service_sources: Array.from(sources),
      synced_at: now,
    };
  });
  for (const c of chunk(rows, 200)) await admin.from("sec_incidents").upsert(c);
  counts.incidents = rows.length;
}

async function mfa(admin: Admin, now: string, counts: Record<string, number>) {
  const rows = await gGetAll<{
    id: string;
    userPrincipalName: string;
    userDisplayName?: string;
    isAdmin?: boolean;
    isMfaRegistered?: boolean;
    isMfaCapable?: boolean;
    isPasswordlessCapable?: boolean;
    isSsprRegistered?: boolean;
    methodsRegistered?: string[];
    defaultMfaMethod?: string;
    userType?: string;
    lastUpdatedDateTime?: string;
  }>("/v1.0/reports/authenticationMethods/userRegistrationDetails");
  const mapped = rows.map((r) => ({
    user_id: r.id,
    upn: r.userPrincipalName,
    display_name: r.userDisplayName ?? null,
    is_admin: r.isAdmin ?? null,
    is_mfa_registered: r.isMfaRegistered ?? null,
    is_mfa_capable: r.isMfaCapable ?? null,
    is_passwordless_capable: r.isPasswordlessCapable ?? null,
    is_sspr_registered: r.isSsprRegistered ?? null,
    methods: r.methodsRegistered ?? [],
    default_method: r.defaultMfaMethod ?? null,
    user_type: r.userType ?? null,
    last_updated_at: r.lastUpdatedDateTime ?? null,
    synced_at: now,
  }));
  for (const c of chunk(mapped, 500)) await admin.from("sec_mfa_registration").upsert(c);
  await admin.from("sec_mfa_registration").delete().lt("synced_at", now);
  counts.mfa_users = mapped.length;
}

async function riskyUsers(admin: Admin, now: string, counts: Record<string, number>) {
  const rows = await gGetAll<{
    id: string;
    userPrincipalName?: string;
    userDisplayName?: string;
    riskLevel?: string;
    riskState?: string;
    riskDetail?: string;
    riskLastUpdatedDateTime?: string;
  }>(`/v1.0/identityProtection/riskyUsers?$filter=${encodeURIComponent("riskState eq 'atRisk' or riskState eq 'confirmedCompromised'")}`);
  const mapped = rows.map((r) => ({
    user_id: r.id,
    upn: r.userPrincipalName ?? null,
    display_name: r.userDisplayName ?? null,
    risk_level: r.riskLevel ?? null,
    risk_state: r.riskState ?? null,
    risk_detail: r.riskDetail ?? null,
    last_updated_at: r.riskLastUpdatedDateTime ?? null,
    synced_at: now,
  }));
  if (mapped.length) await admin.from("sec_risky_users").upsert(mapped);
  await admin.from("sec_risky_users").delete().lt("synced_at", now);
  counts.risky_users = mapped.length;
}

// Defender for Endpoint device info + vulnerability counts via advanced
// hunting. Falls back to simpler queries when a table/column isn't
// available on the tenant's Defender plan.
const HUNTING_QUERIES = [
  `DeviceInfo
| where Timestamp > ago(30d)
| summarize arg_max(Timestamp, *) by DeviceId
| project DeviceId, AadDeviceId, OnboardingStatus, ExposureLevel, SensorHealthState, LastSeen = Timestamp
| join kind=leftouter (
    DeviceTvmSoftwareVulnerabilities
    | summarize Critical = dcountif(CveId, VulnerabilitySeverityLevel == "Critical"), High = dcountif(CveId, VulnerabilitySeverityLevel == "High") by DeviceId
) on DeviceId
| project DeviceId, AadDeviceId, OnboardingStatus, ExposureLevel, SensorHealthState, LastSeen, Critical, High`,
  `DeviceInfo
| where Timestamp > ago(30d)
| summarize arg_max(Timestamp, *) by DeviceId
| project DeviceId, AadDeviceId, OnboardingStatus, ExposureLevel, LastSeen = Timestamp`,
];

async function defenderDevices(admin: Admin, now: string, counts: Record<string, number>, notes: Record<string, string>) {
  let results: Record<string, unknown>[] | null = null;
  let lastErr: unknown = null;
  for (const [i, q] of HUNTING_QUERIES.entries()) {
    try {
      const res = await gPost("/v1.0/security/runHuntingQuery", { Query: q });
      results = (res?.results ?? []) as Record<string, unknown>[];
      if (i > 0) notes.defender_vulns = "Vulnerability counts unavailable (needs Defender Vulnerability Management, included with Defender for Endpoint P2 / E5).";
      break;
    } catch (e) {
      lastErr = e;
    }
  }
  if (!results) throw lastErr;

  const { data: existing } = await admin.from("it_devices").select("device_key").is("removed_at", null);
  const keys = new Set(((existing ?? []) as { device_key: string }[]).map((d) => d.device_key.toLowerCase()));
  const keyCase = new Map(((existing ?? []) as { device_key: string }[]).map((d) => [d.device_key.toLowerCase(), d.device_key]));
  const rows = results
    .filter((r) => r.AadDeviceId && keys.has(String(r.AadDeviceId).toLowerCase()))
    .map((r) => ({
      device_key: keyCase.get(String(r.AadDeviceId).toLowerCase())!,
      mde_device_id: (r.DeviceId as string) ?? null,
      mde_onboarding: (r.OnboardingStatus as string) ?? null,
      mde_exposure: (r.ExposureLevel as string) ?? null,
      mde_sensor_health: (r.SensorHealthState as string) ?? null,
      mde_last_seen: (r.LastSeen as string) ?? null,
      vuln_critical: r.Critical == null ? null : Number(r.Critical),
      vuln_high: r.High == null ? null : Number(r.High),
      mde_synced_at: now,
    }));
  // Only existing rows: upsert updates just these columns.
  for (const c of chunk(rows, 300)) await admin.from("it_devices").upsert(c, { onConflict: "device_key" });
  await admin
    .from("it_devices")
    .update({ mde_onboarding: null, mde_exposure: null, mde_sensor_health: null, vuln_critical: null, vuln_high: null })
    .or(`mde_synced_at.is.null,mde_synced_at.lt.${now}`)
    .not("mde_onboarding", "is", null);
  counts.defender_devices = results.length;
  counts.defender_matched = rows.length;
}

export async function runSecuritySync(opts: { trigger: "cron" | "manual"; triggeredBy?: string | null }) {
  const admin = createAdminClient();
  const { data: run } = await admin.from("sec_sync_runs").insert({ trigger: opts.trigger, triggered_by: opts.triggeredBy ?? null }).select("id").single();
  const now = new Date().toISOString();
  const errors: Record<string, string> = {};
  const counts: Record<string, number> = {};

  const sources: [string, string, () => Promise<void>][] = [
    ["secure_score", "SecurityEvents.Read.All", () => secureScore(admin, now, counts)],
    ["incidents", "SecurityIncident.Read.All + SecurityAlert.Read.All", () => incidents(admin, now, counts)],
    ["mfa", "AuditLog.Read.All", () => mfa(admin, now, counts)],
    ["risky_users", "IdentityRiskyUser.Read.All", () => riskyUsers(admin, now, counts)],
    ["defender", "ThreatHunting.Read.All", () => defenderDevices(admin, now, counts, errors)],
    ["mailbox_rules", "MailboxSettings.Read", () => scanAllMailboxRules(admin, now, counts)],
  ];
  const results = await Promise.allSettled(sources.map(([, , fn]) => fn()));
  results.forEach((r, i) => {
    if (r.status === "rejected") errors[sources[i][0]] = explainGraphError(r.reason, sources[i][1]);
  });

  const failed = sources.filter(([k]) => errors[k]).length;
  const status = failed === sources.length ? "failed" : failed ? "partial" : "ok";
  if (run) {
    await admin
      .from("sec_sync_runs")
      .update({ finished_at: new Date().toISOString(), status, counts, errors: Object.keys(errors).length ? errors : null })
      .eq("id", run.id);
  }
  return { status, counts, errors };
}
