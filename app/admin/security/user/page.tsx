import Link from "next/link";
import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/server";
import { SEC_ACTION_LABELS } from "@/lib/security/labels";
import { employeeNames } from "../../devices/data";
import ActionPanel from "../ActionPanel";
import { METHOD_LABELS } from "../methods";
import { CoveragePill, PageHead, SeverityPill, card, dim, emerald, faint, fmtDate, ink, line, relTime, rose } from "../style";

export const dynamic = "force-dynamic";

// One person's security picture + response actions.
export default async function SecurityUserPage({ searchParams }: { searchParams: Promise<{ id?: string; upn?: string }> }) {
  const { id, upn } = await searchParams;
  const admin = createAdminClient();
  let q = admin.from("it_directory_users").select("entra_user_id, upn, display_name, account_enabled, sku_ids, last_sign_in, office_location, department, job_title, has_intune");
  if (id) q = q.eq("entra_user_id", id);
  else if (upn) q = q.ilike("upn", upn);
  else notFound();
  const { data: u } = await q.maybeSingle();
  if (!u) notFound();

  const [{ data: mfa }, { data: risk }, { data: devices }, { data: incidents }, { data: log }, { data: skus }] = await Promise.all([
    admin.from("sec_mfa_registration").select("is_mfa_registered, methods, default_method, is_admin").eq("user_id", u.entra_user_id).maybeSingle(),
    admin.from("sec_risky_users").select("risk_level, risk_state, last_updated_at").eq("user_id", u.entra_user_id).maybeSingle(),
    admin.from("it_devices").select("device_key, display_name, operating_system, coverage, approx_last_sign_in, mde_isolation_state").ilike("owner_upn", u.upn).is("removed_at", null),
    admin.from("sec_incidents").select("id, display_name, severity, status, last_update_at").contains("users", [u.upn]).order("last_update_at", { ascending: false }).limit(10),
    admin.from("sec_action_log").select("id, action, actor_id, reason, ok, detail, created_at").eq("target_type", "user").eq("target_id", u.entra_user_id).order("created_at", { ascending: false }).limit(30),
    admin.from("it_license_skus").select("sku_id, friendly_name"),
  ]);
  const skuName = new Map(((skus ?? []) as { sku_id: string; friendly_name: string }[]).map((s) => [s.sku_id, s.friendly_name]));
  const logRows = (log ?? []) as { id: string; action: string; actor_id: string; reason: string | null; ok: boolean; detail: { error?: string } | null; created_at: string }[];
  const names = await employeeNames(logRows.map((l) => l.actor_id));
  const blocked = u.account_enabled === false;

  return (
    <div className="max-w-5xl">
      <Link href="/admin/security" className="text-xs" style={{ color: faint }}>
        ← Security
      </Link>
      <div className="mt-2" />
      <PageHead title={u.display_name ?? u.upn} sub={[u.upn, u.job_title, u.office_location, u.department].filter(Boolean).join(" · ")} />

      {blocked && (
        <div className="rounded-2xl px-4 py-3 text-sm my-4 font-bold" style={{ background: `${rose}12`, border: `1px solid ${rose}55`, color: rose }}>
          Sign-in is blocked for this account.
        </div>
      )}

      <div className="grid lg:grid-cols-2 gap-4 mt-4">
        <section className="p-5" style={card}>
          <div className="text-xs font-bold uppercase tracking-wider mb-3" style={{ color: emerald }}>
            Status
          </div>
          <div className="grid gap-2 text-sm">
            <div className="flex justify-between gap-3">
              <span style={{ color: dim }}>Risk</span>
              {risk ? <SeverityPill severity={risk.risk_state === "confirmedCompromised" ? "high" : risk.risk_level} /> : <span>None flagged</span>}
            </div>
            <div className="flex justify-between gap-3">
              <span style={{ color: dim }}>MFA</span>
              <span style={{ color: mfa?.is_mfa_registered ? emerald : rose, fontWeight: 700 }}>{mfa ? (mfa.is_mfa_registered ? "Set up" : "Not set up") : "—"}</span>
            </div>
            {mfa?.methods?.length ? (
              <div className="flex justify-between gap-3">
                <span style={{ color: dim }}>Methods</span>
                <span className="text-right">{(mfa.methods as string[]).map((m) => METHOD_LABELS[m] ?? m).join(", ")}</span>
              </div>
            ) : null}
            <div className="flex justify-between gap-3">
              <span style={{ color: dim }}>Admin role</span>
              <span>{mfa?.is_admin ? "Yes" : "No"}</span>
            </div>
            <div className="flex justify-between gap-3">
              <span style={{ color: dim }}>Licenses</span>
              <span className="text-right">{((u.sku_ids ?? []) as string[]).map((s) => skuName.get(s) ?? s).join(", ") || "None"}</span>
            </div>
            <div className="flex justify-between gap-3">
              <span style={{ color: dim }}>Last sign-in</span>
              <span>{relTime(u.last_sign_in)}</span>
            </div>
          </div>
        </section>

        <section className="p-5" style={card}>
          <div className="text-xs font-bold uppercase tracking-wider mb-3" style={{ color: emerald }}>
            Respond
          </div>
          <ActionPanel
            endpoint={`/api/security/users/${u.entra_user_id}`}
            actions={[
              { key: "revoke_sessions", label: "Sign out everywhere", help: "Ends every active session and app token. They have to sign in again (with MFA) on every device. Do this first if the account might be compromised." },
              { key: "block_signin", label: "Block sign-in", danger: true, hidden: blocked, help: "Stops the account signing in anywhere and signs it out everywhere. Mail still arrives. Use for a compromised account or a sudden departure." },
              { key: "unblock_signin", label: "Unblock sign-in", hidden: !blocked, help: "Lets the account sign in again. Reset the password first if it was compromised." },
              { key: "confirm_compromised", label: "Confirm compromised", danger: true, hidden: risk?.risk_state === "confirmedCompromised", help: "Tells Entra ID Protection this account was compromised: risk goes to high and risk-based policies apply." },
              { key: "dismiss_risk", label: "Dismiss risk", hidden: !risk, help: "Clears the risk flag after you've confirmed it was a false alarm (e.g. the person was travelling)." },
            ]}
            note="Resetting a password is done in Entra or the Entra Directory page. Pair it with Sign out everywhere."
          />
        </section>

        <section className="p-5" style={card}>
          <div className="text-xs font-bold uppercase tracking-wider mb-3" style={{ color: emerald }}>
            Devices
          </div>
          {(devices ?? []).length === 0 ? (
            <p className="text-sm" style={{ color: dim }}>
              None recorded.
            </p>
          ) : (
            <div className="grid gap-2">
              {((devices ?? []) as { device_key: string; display_name: string | null; operating_system: string | null; coverage: string; approx_last_sign_in: string | null; mde_isolation_state: string | null }[]).map((d) => (
                <Link key={d.device_key} href={`/admin/devices/${encodeURIComponent(d.device_key)}`} className="flex flex-wrap items-center justify-between gap-2 text-sm pb-2" style={{ borderBottom: `1px solid ${line}` }}>
                  <span>
                    <b style={{ color: ink }}>{d.display_name}</b> <span style={{ color: faint }}>· {d.operating_system} · {relTime(d.approx_last_sign_in)}</span>
                    {d.mde_isolation_state === "isolated" && <b style={{ color: rose }}> · isolated</b>}
                  </span>
                  <CoveragePill coverage={d.coverage} />
                </Link>
              ))}
            </div>
          )}
        </section>

        <section className="p-5" style={card}>
          <div className="text-xs font-bold uppercase tracking-wider mb-3" style={{ color: emerald }}>
            Incidents involving them
          </div>
          {(incidents ?? []).length === 0 ? (
            <p className="text-sm" style={{ color: dim }}>
              None in the last 90 days.
            </p>
          ) : (
            <div className="grid gap-2">
              {((incidents ?? []) as { id: string; display_name: string | null; severity: string | null; status: string | null; last_update_at: string | null }[]).map((i) => (
                <Link key={i.id} href="/admin/security/incidents?status=all" className="flex justify-between gap-2 text-sm pb-2" style={{ borderBottom: `1px solid ${line}` }}>
                  <span className="min-w-0">
                    <b style={{ color: ink }}>{i.display_name}</b>
                    <span className="block text-xs" style={{ color: faint }}>
                      {i.status} · {relTime(i.last_update_at)}
                    </span>
                  </span>
                  <SeverityPill severity={i.severity} />
                </Link>
              ))}
            </div>
          )}
        </section>
      </div>

      <section className="p-5 mt-4" style={card}>
        <div className="text-xs font-bold uppercase tracking-wider mb-3" style={{ color: emerald }}>
          Actions taken
        </div>
        {logRows.length === 0 ? (
          <p className="text-sm" style={{ color: dim }}>
            None yet.
          </p>
        ) : (
          logRows.map((l) => (
            <div key={l.id} className="text-sm flex flex-wrap justify-between gap-2 py-2" style={{ borderTop: `1px solid ${line}` }}>
              <span>
                <b style={{ color: l.ok ? ink : rose }}>{SEC_ACTION_LABELS[l.action] ?? l.action}</b>
                {!l.ok && <span style={{ color: rose }}> (failed{l.detail?.error ? `: ${l.detail.error}` : ""})</span>} · {names.get(l.actor_id)?.name ?? "Someone"}
                {l.reason && <span className="block text-xs" style={{ color: dim }}>{l.reason}</span>}
              </span>
              <span className="text-xs" style={{ color: faint }}>
                {fmtDate(l.created_at)}
              </span>
            </div>
          ))
        )}
      </section>
    </div>
  );
}
