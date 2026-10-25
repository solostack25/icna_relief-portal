import Link from "next/link";
import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/server";
import { getDeviceViewer } from "@/lib/devices/access";
import { COVERAGE_HELP, TRUST_LABELS, formatBytes, isStale, type Coverage } from "@/lib/devices/shared";
import { employeeNames, loadPendingRequests } from "../data";
import { RequestDecision } from "../ui";
import { CoveragePill, card, dim, emerald, faint, fmtDate, gold, ink, line, relTime, rose } from "../style";
import DeviceActions from "./DeviceActions";
import ComplianceCard from "./ComplianceCard";
import ActionPanel from "../../security/ActionPanel";

export const dynamic = "force-dynamic";

const ACTION_TEXT: Record<string, string> = {
  view_bitlocker_key: "Viewed BitLocker key",
  view_laps_password: "Viewed local admin password",
  sync: "Sync",
  restart: "Restart",
  lock: "Lock",
  disable: "Disabled in Entra",
  enable: "Re-enabled in Entra",
  request_wipe: "Requested wipe",
  request_retire: "Requested retire",
  approve_wipe: "Approved wipe",
  approve_retire: "Approved retire",
  deny_wipe: "Denied wipe",
  deny_retire: "Denied retire",
  cancel_wipe: "Cancelled wipe request",
  cancel_retire: "Cancelled retire request",
  wipe: "Wipe sent",
  retire: "Retire sent",
};

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 py-2 text-sm" style={{ borderTop: `1px solid ${line}` }}>
      <span style={{ color: dim }}>{label}</span>
      <span className="text-right min-w-0 break-words" style={{ color: ink }}>
        {children ?? "—"}
      </span>
    </div>
  );
}

export default async function DevicePage({ params }: { params: Promise<{ key: string }> }) {
  const { key: rawKey } = await params;
  const key = decodeURIComponent(rawKey);
  const viewer = (await getDeviceViewer())!;
  const admin = createAdminClient();

  const { data: d } = await admin.from("it_devices").select("*").eq("device_key", key).maybeSingle();
  if (!d) notFound();

  const [pending, { data: auditRows }, { data: owner }, { data: skus }, { data: otherDevices }] = await Promise.all([
    loadPendingRequests(key),
    admin.from("it_device_audit").select("id, action, actor_id, reason, ticket_ref, ok, detail, created_at").eq("device_key", key).order("created_at", { ascending: false }).limit(50),
    d.owner_entra_user_id
      ? admin.from("it_directory_users").select("upn, display_name, sku_ids, has_intune, last_sign_in, account_enabled").eq("entra_user_id", d.owner_entra_user_id).maybeSingle()
      : d.owner_upn
        ? admin.from("it_directory_users").select("upn, display_name, sku_ids, has_intune, last_sign_in, account_enabled").ilike("upn", d.owner_upn).maybeSingle()
        : Promise.resolve({ data: null }),
    admin.from("it_license_skus").select("sku_id, friendly_name"),
    d.owner_upn
      ? admin.from("it_devices").select("device_key, display_name, operating_system, coverage").ilike("owner_upn", d.owner_upn).neq("device_key", key).is("removed_at", null)
      : Promise.resolve({ data: [] }),
  ]);
  const skuName = new Map(((skus ?? []) as { sku_id: string; friendly_name: string }[]).map((s) => [s.sku_id, s.friendly_name]));
  type AuditRow = { id: string; action: string; actor_id: string; reason: string | null; ticket_ref: string | null; ok: boolean; detail: unknown; created_at: string };
  const audits = (auditRows ?? []) as AuditRow[];
  const names = await employeeNames([...audits.map((a) => a.actor_id), d.employee_id]);
  const emp = d.employee_id ? names.get(d.employee_id) : null;
  const last = d.approx_last_sign_in ?? d.intune_last_sync;
  const coverage = d.coverage as Coverage;

  return (
    <div className="max-w-5xl">
      <Link href="/admin/devices" className="text-xs" style={{ color: faint }}>
        ← All devices
      </Link>
      <div className="flex flex-wrap items-end justify-between gap-3 mt-2 mb-5">
        <div className="min-w-0">
          <h1 style={{ fontFamily: "'Fraunces', serif", fontStyle: "italic", fontWeight: 500, fontSize: 30, margin: 0 }} className="break-words">
            {d.display_name ?? "Unnamed device"}
          </h1>
          <div className="text-sm mt-1" style={{ color: dim }}>
            {[d.manufacturer, d.model].filter(Boolean).join(" ") || d.operating_system} · last seen{" "}
            <span style={{ color: isStale(last) ? rose : dim, fontWeight: isStale(last) ? 700 : 400 }}>{relTime(last)}</span>
            {d.account_enabled === false && <span style={{ color: rose, fontWeight: 700 }}> · disabled in Entra</span>}
            {d.removed_at && <span style={{ color: rose, fontWeight: 700 }}> · no longer in Microsoft</span>}
          </div>
        </div>
        <CoveragePill coverage={coverage} />
      </div>

      <div className="rounded-2xl px-4 py-3 text-sm mb-6" style={{ background: "rgba(22,48,43,0.03)", border: `1px solid ${line}`, color: ink }}>
        {COVERAGE_HELP[coverage]}
      </div>

      {pending.length > 0 && (
        <section className="mb-6 p-4" style={{ ...card, borderColor: `${rose}55` }}>
          {pending.map((r) => (
            <div key={r.id} className="flex flex-wrap items-center justify-between gap-3">
              <div className="text-sm">
                <b style={{ color: rose }}>{r.action === "wipe" ? "Wipe" : "Retire"} requested</b> by {r.requested_by_name} · {fmtDate(r.requested_at)}
                <div className="text-xs" style={{ color: dim }}>
                  {r.reason}
                  {r.ticket_ref ? ` · ${r.ticket_ref}` : ""}
                </div>
              </div>
              <RequestDecision id={r.id} mine={r.requested_by === viewer.employeeId} />
            </div>
          ))}
        </section>
      )}

      {d.mde_isolation_state === "isolated" && (
        <div className="rounded-2xl px-4 py-3 text-sm mb-6 font-bold" style={{ background: `${rose}12`, border: `1px solid ${rose}55`, color: rose }}>
          Isolated from the network by Defender since {fmtDate(d.mde_isolation_changed_at)}. Release it from the Microsoft Defender card below once it&apos;s clean.
        </div>
      )}

      {d.intune_id && <ComplianceCard deviceKey={d.device_key} state={d.compliance_state} reasons={d.compliance_reasons} checkedAt={d.compliance_checked_at} />}

      <div className="grid lg:grid-cols-2 gap-5 mb-6">
        <section className="p-5" style={card}>
          <div className="text-xs font-bold uppercase tracking-wider mb-2" style={{ color: emerald }}>
            Device
          </div>
          <Row label="Operating system">{[d.operating_system, d.os_version].filter(Boolean).join(" ")}</Row>
          <Row label="Join type">{TRUST_LABELS[d.trust_type ?? ""] ?? d.trust_type}</Row>
          <Row label="Serial number">{d.serial_number ? <span style={{ fontFamily: "'IBM Plex Mono', monospace", userSelect: "all" }}>{d.serial_number}</span> : null}</Row>
          <Row label="Ownership">{d.ownership === "company" ? "Company" : d.ownership === "personal" ? "Personal" : d.ownership}</Row>
          <Row label="Registered">{fmtDate(d.registered_at)}</Row>
          <Row label="Last Entra sign-in">{fmtDate(d.approx_last_sign_in)}</Row>
          <Row label="Entra device ID">
            <span className="text-xs" style={{ fontFamily: "'IBM Plex Mono', monospace" }}>
              {d.entra_device_id}
            </span>
          </Row>
        </section>

        <section className="p-5" style={card}>
          <div className="text-xs font-bold uppercase tracking-wider mb-2" style={{ color: emerald }}>
            Intune
          </div>
          {d.intune_id ? (
            <>
              <Row label="Compliance">
                <span style={{ color: d.compliance_state === "compliant" ? emerald : d.compliance_state === "inGracePeriod" ? gold : rose, fontWeight: 700 }}>
                  {d.compliance_state ?? "Unknown"}
                </span>
              </Row>
              <Row label="Encrypted (BitLocker/FileVault)">
                <span style={{ color: d.is_encrypted ? emerald : rose, fontWeight: 700 }}>{d.is_encrypted == null ? "Unknown" : d.is_encrypted ? "Yes" : "No"}</span>
              </Row>
              <Row label="Last check-in">{fmtDate(d.intune_last_sync)}</Row>
              <Row label="Enrolled">{fmtDate(d.enrolled_at)}</Row>
              <Row label="Primary user">{d.primary_user_upn}</Row>
              <Row label="Storage free">
                {formatBytes(d.free_storage_bytes)} of {formatBytes(d.total_storage_bytes)}
              </Row>
            </>
          ) : (
            <p className="text-sm" style={{ color: dim }}>
              Not enrolled in Intune.{" "}
              {coverage === "licensed_not_enrolled"
                ? "The owner is licensed, so it can be enrolled: on the device, Settings → Accounts → Access work or school → Info → Sync, or re-join it through Autopilot."
                : coverage === "unlicensed"
                  ? "The owner's license doesn't include Intune. Add Intune Plan 1 or move them to Business Premium/E3 to manage it."
                  : ""}
            </p>
          )}
        </section>

        {(d.mde_onboarding || (d.operating_system ?? "").toLowerCase().includes("windows")) && (
          <section className="p-5" style={card}>
            <div className="text-xs font-bold uppercase tracking-wider mb-2" style={{ color: emerald }}>
              Microsoft Defender
            </div>
            {d.mde_onboarding ? (
              <>
                <Row label="Defender for Endpoint">
                  <span style={{ color: d.mde_onboarding === "Onboarded" ? emerald : rose, fontWeight: 700 }}>{d.mde_onboarding}</span>
                </Row>
                <Row label="Exposure level">
                  <span style={{ color: d.mde_exposure === "High" ? rose : d.mde_exposure === "Medium" ? gold : d.mde_exposure === "Low" ? emerald : dim, fontWeight: 700 }}>{d.mde_exposure ?? "—"}</span>
                </Row>
                <Row label="Sensor health">{d.mde_sensor_health}</Row>
                <Row label="Vulnerabilities">
                  {d.vuln_critical == null && d.vuln_high == null ? (
                    "—"
                  ) : (
                    <span>
                      <b style={{ color: (d.vuln_critical ?? 0) > 0 ? rose : emerald }}>{d.vuln_critical ?? 0} critical</b> · <b style={{ color: (d.vuln_high ?? 0) > 0 ? gold : emerald }}>{d.vuln_high ?? 0} high</b>
                    </span>
                  )}
                </Row>
                <Row label="Last seen by Defender">{fmtDate(d.mde_last_seen)}</Row>
                {d.mde_device_id && (
                  <a
                    href={`https://security.microsoft.com/machines/v2/${d.mde_device_id}/overview`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-block mt-3 text-xs font-bold rounded-full px-3 py-1.5"
                    style={{ border: `1.5px solid ${line}`, color: ink }}
                  >
                    Open in Defender ↗
                  </a>
                )}
              </>
            ) : (
              <p className="text-sm" style={{ color: dim }}>
                Defender for Endpoint has no record of this PC, so it isn&apos;t onboarded (or the security sync hasn&apos;t run). Onboard it with an Intune EDR policy so threats are detected and the
                compliance risk rule can pass.
              </p>
            )}
            {(() => {
              const onboarded = !!d.mde_device_id && String(d.mde_onboarding ?? "").toLowerCase() === "onboarded";
              const isolated = d.mde_isolation_state === "isolated";
              if (!onboarded && !d.intune_id) return null;
              return (
                <div className="mt-4 pt-3" style={{ borderTop: `1px solid ${line}` }}>
                  <div className="text-xs font-bold uppercase tracking-wider mb-2" style={{ color: emerald }}>
                    Respond
                  </div>
                  <ActionPanel
                    endpoint={`/api/devices/${encodeURIComponent(d.device_key)}/defender`}
                    note={onboarded ? undefined : "Not in Defender for Endpoint: scans and definition updates go through Intune; isolation needs onboarding."}
                    actions={[
                      { key: "isolate_full", label: "Isolate", danger: true, hidden: !onboarded || isolated, help: "Cuts the PC off from every network except Defender, so an attacker or malware can't use it. The user sees a notice. Release it once it's clean." },
                      { key: "isolate_selective", label: "Isolate, keep Outlook/Teams", danger: true, hidden: !onboarded || isolated, help: "Same as Isolate, but Outlook, Teams and Skype keep working so the person can still communicate." },
                      { key: "release", label: "Release from isolation", hidden: !onboarded || d.mde_isolation_state === "released", help: "Reconnects the PC to the network. Only do this once the threat is cleaned up." },
                      { key: "restrict_execution", label: "Restrict apps", danger: true, hidden: !onboarded, help: "Only Microsoft-signed programs can run until you lift it. Stops unknown malware or remote-access tools while you investigate, without cutting the network." },
                      { key: "unrestrict_execution", label: "Lift app restriction", hidden: !onboarded, help: "Lets every program run again. Do this once the PC is clean." },
                      { key: "scan_quick", label: "Quick scan", help: "Runs a Microsoft Defender quick antivirus scan now. Results show in Defender/Intune." },
                      { key: "scan_full", label: "Full scan", help: "Runs a full antivirus scan. It can take hours and slow the PC down." },
                      { key: "update_signatures", label: "Update definitions", hidden: !d.intune_id, help: "Tells Defender Antivirus to download the latest definitions." },
                    ]}
                  />
                </div>
              );
            })()}
          </section>
        )}

        <section className="p-5" style={card}>
          <div className="text-xs font-bold uppercase tracking-wider mb-2" style={{ color: emerald }}>
            Owner
          </div>
          <Row label="Name">
            {emp ? (
              <Link href={`/admin/employees/${d.employee_id}`} className="underline">
                {emp.name}
              </Link>
            ) : (
              d.owner_name
            )}
          </Row>
          <Row label="Email">{d.owner_upn}</Row>
          <Row label="Licenses">
            {owner?.sku_ids?.length ? (owner.sku_ids as string[]).map((s) => skuName.get(s) ?? s).join(", ") : owner ? "None" : "—"}
          </Row>
          <Row label="Intune license">{owner ? (owner.has_intune ? "Yes" : "No") : "—"}</Row>
          <Row label="Last sign-in (any app)">{owner?.last_sign_in ? fmtDate(owner.last_sign_in) : "—"}</Row>
          {owner && owner.account_enabled === false && (
            <Row label="Account">
              <span style={{ color: rose, fontWeight: 700 }}>Disabled</span>
            </Row>
          )}
          {(otherDevices ?? []).length > 0 && (
            <div className="pt-3 mt-1" style={{ borderTop: `1px solid ${line}` }}>
              <div className="text-xs mb-1.5" style={{ color: dim }}>
                Their other devices
              </div>
              <div className="flex flex-wrap gap-2">
                {(otherDevices as { device_key: string; display_name: string | null; operating_system: string | null }[]).map((o) => (
                  <Link key={o.device_key} href={`/admin/devices/${encodeURIComponent(o.device_key)}`} className="text-xs font-semibold rounded-full px-2.5 py-1" style={{ border: `1px solid ${line}`, color: ink }}>
                    {o.display_name ?? "Device"} · {o.operating_system}
                  </Link>
                ))}
              </div>
            </div>
          )}
        </section>

        <section className="p-5" style={card}>
          <div className="text-xs font-bold uppercase tracking-wider mb-3" style={{ color: emerald }}>
            Actions
          </div>
          <DeviceActions
            deviceKey={d.device_key}
            hasEntra={!!d.entra_object_id}
            hasIntune={!!d.intune_id}
            isWindows={(d.operating_system ?? "").toLowerCase().includes("windows")}
            enabled={d.account_enabled !== false}
            pendingActions={pending.map((p) => p.action)}
          />
        </section>
      </div>

      <section className="p-5" style={card}>
        <div className="text-xs font-bold uppercase tracking-wider mb-3" style={{ color: emerald }}>
          Activity on this device
        </div>
        {audits.length === 0 ? (
          <p className="text-sm" style={{ color: dim }}>
            Nothing yet. Key lookups and actions show up here.
          </p>
        ) : (
          <div className="grid gap-2">
            {audits.map((a) => (
              <div key={a.id} className="text-sm flex flex-wrap justify-between gap-2 pb-2" style={{ borderBottom: `1px solid ${line}` }}>
                <div className="min-w-0">
                  <b style={{ color: a.ok ? ink : rose }}>{ACTION_TEXT[a.action] ?? a.action}</b>
                  {!a.ok && <span style={{ color: rose }}> (failed)</span>} · {names.get(a.actor_id)?.name ?? "Someone"}
                  {(a.reason || a.ticket_ref) && (
                    <div className="text-xs" style={{ color: dim }}>
                      {[a.reason, a.ticket_ref].filter(Boolean).join(" · ")}
                      {!a.ok && (a.detail as { error?: string } | null)?.error ? ` · ${(a.detail as { error: string }).error}` : ""}
                    </div>
                  )}
                </div>
                <span className="text-xs whitespace-nowrap" style={{ color: faint }}>
                  {fmtDate(a.created_at)}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
