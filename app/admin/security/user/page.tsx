import Link from "next/link";
import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/server";
import { SEC_ACTION_LABELS } from "@/lib/security/labels";
import { explainGraphError } from "@/lib/devices/graph";
import { explainSignInError, listAuthMethods, userSignIns, type AuthMethod, type SignIn } from "@/lib/security/identity";
import { employeeNames } from "../../devices/data";
import ActionPanel from "../ActionPanel";
import RowActions from "../RowActions";
import RuleRow, { RULE_SELECT, RuleNote, needsReview, type MailRule } from "../RuleRow";
import { METHOD_LABELS } from "../methods";
import { CoveragePill, PageHead, SeverityPill, card, dim, emerald, faint, fmtDate, gold, ink, line, relTime, rose } from "../style";
import ContainPanel from "./ContainPanel";

export const dynamic = "force-dynamic";

const HOME_COUNTRY = "US";

function Section({ title, children, right, wide }: { title: string; children: React.ReactNode; right?: React.ReactNode; wide?: boolean }) {
  return (
    <section className={`p-5 ${wide ? "lg:col-span-2" : ""}`} style={card}>
      <div className="flex items-center justify-between gap-2 mb-3">
        <div className="text-xs font-bold uppercase tracking-wider" style={{ color: emerald }}>
          {title}
        </div>
        {right}
      </div>
      {children}
    </section>
  );
}

function Err({ msg }: { msg: string }) {
  return (
    <p className="text-sm rounded-xl px-3 py-2" style={{ color: ink, background: `${gold}10`, border: `1px solid ${gold}40` }}>
      {msg}
    </p>
  );
}

// No id: find a person by name or email.
async function SearchView({ q }: { q: string }) {
  const term = q.trim().replace(/[%,()]/g, "");
  const { data } = term
    ? await createAdminClient()
        .from("it_directory_users")
        .select("entra_user_id, upn, display_name, office_location, account_enabled")
        .or(`display_name.ilike.%${term}%,upn.ilike.%${term}%`)
        .order("display_name")
        .limit(40)
    : { data: [] };
  const rows = (data ?? []) as { entra_user_id: string; upn: string; display_name: string | null; office_location: string | null; account_enabled: boolean | null }[];
  return (
    <div className="max-w-3xl">
      <Link href="/admin/security" className="text-xs" style={{ color: faint }}>
        ← Security
      </Link>
      <div className="mt-2" />
      <PageHead title="Find a person" sub="Open someone's security page to see their sign-ins, sign-in methods and inbox rules, or to respond to a compromised account." />
      <form className="flex gap-2 my-4">
        <input name="q" defaultValue={q} autoFocus placeholder="Name or email" className="flex-1 rounded-xl px-3 py-2 text-sm bg-white outline-none" style={{ border: `1.5px solid ${line}` }} />
        <button className="text-sm font-bold rounded-full px-4" style={{ background: emerald, color: "#fff" }}>
          Search
        </button>
      </form>
      {term && (
        <div style={{ ...card, overflow: "hidden" }}>
          {rows.length === 0 ? (
            <div className="p-6 text-sm text-center" style={{ color: dim }}>
              No one matches.
            </div>
          ) : (
            rows.map((r) => (
              <Link key={r.entra_user_id} href={`/admin/security/user?id=${r.entra_user_id}`} className="px-4 py-3 flex justify-between gap-3 text-sm" style={{ borderTop: `1px solid ${line}` }}>
                <span className="min-w-0">
                  <b style={{ color: ink }}>{r.display_name ?? r.upn}</b>
                  <span className="block text-xs truncate" style={{ color: faint }}>
                    {[r.upn, r.office_location].filter(Boolean).join(" · ")}
                  </span>
                </span>
                {r.account_enabled === false && (
                  <span className="text-xs font-bold" style={{ color: rose }}>
                    blocked
                  </span>
                )}
              </Link>
            ))
          )}
        </div>
      )}
    </div>
  );
}

function SignInRow({ s }: { s: SignIn }) {
  const abroad = !!s.country && s.country !== HOME_COUNTRY;
  return (
    <div className="py-2 text-sm flex flex-wrap justify-between gap-x-3 gap-y-0.5" style={{ borderTop: `1px solid ${line}` }}>
      <span className="min-w-0">
        <b style={{ color: s.ok ? ink : rose }}>{s.ok ? "Signed in" : "Failed"}</b>
        <span style={{ color: dim }}> · {s.app ?? "Unknown app"}</span>
        {s.risk && <b style={{ color: rose }}> · {s.risk} risk</b>}
        <span className="block text-xs" style={{ color: faint }}>
          <span style={abroad ? { color: rose, fontWeight: 700 } : undefined}>{[s.city, s.state, s.country].filter(Boolean).join(", ") || "Unknown place"}</span>
          {" · "}
          {s.ip ?? "—"} · {[s.os, s.browser].filter(Boolean).join(" / ") || s.client || "—"}
          {s.error ? ` · ${s.error}` : ""}
        </span>
      </span>
      <span className="text-xs whitespace-nowrap" style={{ color: faint }}>
        {fmtDate(s.at)}
      </span>
    </div>
  );
}

// One person's security picture + response actions.
export default async function SecurityUserPage({ searchParams }: { searchParams: Promise<{ id?: string; upn?: string; q?: string }> }) {
  const { id, upn, q } = await searchParams;
  if (!id && !upn) return <SearchView q={q ?? ""} />;

  const admin = createAdminClient();
  let query = admin.from("it_directory_users").select("entra_user_id, upn, display_name, account_enabled, sku_ids, last_sign_in, office_location, department, job_title, has_intune");
  if (id) query = query.eq("entra_user_id", id);
  else query = query.ilike("upn", upn!);
  const { data: u } = await query.maybeSingle();
  if (!u) notFound();

  const [{ data: mfa }, { data: risk }, { data: devices }, { data: incidents }, { data: log }, { data: skus }, { data: rules }, methodsRes, signInsRes] = await Promise.all([
    admin.from("sec_mfa_registration").select("is_mfa_registered, methods, default_method, is_admin").eq("user_id", u.entra_user_id).maybeSingle(),
    admin.from("sec_risky_users").select("risk_level, risk_state, last_updated_at").eq("user_id", u.entra_user_id).maybeSingle(),
    admin.from("it_devices").select("device_key, display_name, operating_system, coverage, approx_last_sign_in, mde_isolation_state, mde_device_id, mde_onboarding").ilike("owner_upn", u.upn).is("removed_at", null),
    admin.from("sec_incidents").select("id, display_name, severity, status, last_update_at").contains("users", [u.upn]).order("last_update_at", { ascending: false }).limit(10),
    admin.from("sec_action_log").select("id, action, actor_id, reason, ok, detail, created_at").eq("target_type", "user").eq("target_id", u.entra_user_id).order("created_at", { ascending: false }).limit(30),
    admin.from("it_license_skus").select("sku_id, friendly_name"),
    admin.from("sec_mailbox_rules").select(RULE_SELECT).eq("user_id", u.entra_user_id).order("severity", { ascending: true, nullsFirst: false }),
    listAuthMethods(u.entra_user_id).then(
      (rows) => ({ rows, error: null as string | null }),
      (e) => ({ rows: [] as AuthMethod[], error: explainGraphError(e, "UserAuthenticationMethod.Read.All") })
    ),
    userSignIns(u.entra_user_id, 14).then(
      (rows) => ({ rows, error: null as string | null }),
      (e) => ({ rows: [] as SignIn[], error: explainSignInError(e) })
    ),
  ]);
  const skuName = new Map(((skus ?? []) as { sku_id: string; friendly_name: string }[]).map((s) => [s.sku_id, s.friendly_name]));
  const logRows = (log ?? []) as { id: string; action: string; actor_id: string; reason: string | null; ok: boolean; detail: { error?: string; ticket?: string } | null; created_at: string }[];
  const names = await employeeNames(logRows.map((l) => l.actor_id));
  const blocked = u.account_enabled === false;
  const devs = (devices ?? []) as { device_key: string; display_name: string | null; operating_system: string | null; coverage: string; approx_last_sign_in: string | null; mde_isolation_state: string | null; mde_device_id: string | null; mde_onboarding: string | null }[];
  const hasOnboardedPc = devs.some((d) => d.mde_device_id && String(d.mde_onboarding ?? "").toLowerCase() === "onboarded");
  const ruleRows = (rules ?? []) as MailRule[];
  const openRules = ruleRows.filter(needsReview);
  const methods = methodsRes.rows;
  const signIns = signInsRes.rows;
  const abroad = signIns.filter((s) => s.ok && s.country && s.country !== HOME_COUNTRY);
  const failedCount = signIns.filter((s) => !s.ok).length;
  const name = u.display_name ?? u.upn;

  return (
    <div className="max-w-5xl">
      <Link href="/admin/security/user" className="text-xs" style={{ color: faint }}>
        ← Find a person
      </Link>
      <div className="mt-2" />
      <PageHead title={name} sub={[u.upn, u.job_title, u.office_location, u.department].filter(Boolean).join(" · ")} />

      {blocked && (
        <div className="rounded-2xl px-4 py-3 text-sm my-4 font-bold" style={{ background: `${rose}12`, border: `1px solid ${rose}55`, color: rose }}>
          Sign-in is blocked for this account.
        </div>
      )}
      {(abroad.length > 0 || openRules.length > 0) && (
        <div className="rounded-2xl px-4 py-3 text-sm my-4 grid gap-1" style={{ background: `${gold}10`, border: `1px solid ${gold}40`, color: ink }}>
          {abroad.length > 0 && (
            <div>
              <b>{abroad.length} successful sign-in{abroad.length === 1 ? "" : "s"} from outside the US</b> in the last 14 days ({Array.from(new Set(abroad.map((s) => s.country))).join(", ")}). Check with them if they travelled.
            </div>
          )}
          {openRules.length > 0 && (
            <div>
              <b>{openRules.length} suspicious inbox rule{openRules.length === 1 ? "" : "s"}</b>, see below.
            </div>
          )}
        </div>
      )}

      <div className="grid lg:grid-cols-2 gap-4 mt-4">
        <Section title="Compromised account">
          <ContainPanel userId={u.entra_user_id} name={name} hasOnboardedPc={hasOnboardedPc} />
        </Section>

        <Section title="Respond">
          <ActionPanel
            endpoint={`/api/security/users/${u.entra_user_id}`}
            actions={[
              { key: "revoke_sessions", label: "Sign out everywhere", help: "Ends every active session and app token. They have to sign in again (with MFA) on every device." },
              { key: "block_signin", label: "Block sign-in", danger: true, hidden: blocked, help: "Stops the account signing in anywhere and signs it out everywhere. Mail still arrives." },
              { key: "unblock_signin", label: "Unblock sign-in", hidden: !blocked, help: "Lets the account sign in again. If it was compromised, give them a new password or Temporary Access Pass at the same time." },
              { key: "reset_password", label: "Reset password", danger: true, help: "Sets a new random temporary password and signs them out everywhere. You'll see it once; they must change it at next sign-in." },
              { key: "confirm_compromised", label: "Confirm compromised", danger: true, hidden: risk?.risk_state === "confirmedCompromised", help: "Tells Entra ID Protection this account was compromised: risk goes to high and risk-based policies apply. Needs Entra ID P2." },
              { key: "dismiss_risk", label: "Dismiss risk", hidden: !risk, help: "Clears the risk flag after you've confirmed it was a false alarm (e.g. the person was travelling)." },
            ]}
          />
        </Section>

        <Section title="Restore access / MFA">
          <p className="text-xs mb-3" style={{ color: dim }}>
            A Temporary Access Pass lets them sign in without a password and set up Authenticator or Windows Hello. Also the fix for staff who can&apos;t sign in to a work PC.
          </p>
          <ActionPanel
            endpoint={`/api/security/users/${u.entra_user_id}`}
            actions={[
              { key: "issue_tap", label: "Access pass (1 hour, one use)", help: "Creates a one-time pass valid for 1 hour. Replaces any earlier pass.", extra: { minutes: 60, oneTime: true } },
              { key: "issue_tap", label: "Access pass (8 hours, reusable)", help: "A reusable pass valid for 8 hours, for setting up a new PC plus their phone.", extra: { minutes: 480, oneTime: false } },
              { key: "clear_mfa", label: "Require MFA re-registration", danger: true, help: "Removes every sign-in method except the password (Authenticator, phone, keys, Windows Hello). At next sign-in they must set MFA up again. Give them an access pass so they can." },
            ]}
          />
        </Section>

        <Section title="Status">
          <div className="grid gap-2 text-sm">
            <div className="flex justify-between gap-3">
              <span style={{ color: dim }}>Risk</span>
              {risk ? <SeverityPill severity={risk.risk_state === "confirmedCompromised" ? "high" : risk.risk_level} /> : <span>None flagged</span>}
            </div>
            <div className="flex justify-between gap-3">
              <span style={{ color: dim }}>MFA</span>
              <span style={{ color: mfa?.is_mfa_registered ? emerald : rose, fontWeight: 700 }}>{mfa ? (mfa.is_mfa_registered ? "Set up" : "Not set up") : "—"}</span>
            </div>
            {mfa?.default_method && (
              <div className="flex justify-between gap-3">
                <span style={{ color: dim }}>Default method</span>
                <span>{METHOD_LABELS[mfa.default_method] ?? mfa.default_method}</span>
              </div>
            )}
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
        </Section>

        <Section title="Sign-in methods">
          {methodsRes.error ? (
            <Err msg={methodsRes.error} />
          ) : (
            <div className="grid">
              {methods.map((m) => (
                <div key={m.id} className="py-2 flex flex-wrap items-center justify-between gap-2 text-sm" style={{ borderTop: `1px solid ${line}` }}>
                  <span className="min-w-0">
                    <b style={{ color: ink }}>{m.label}</b>
                    <span className="block text-xs" style={{ color: faint }}>
                      {[m.detail, m.created && `added ${relTime(m.created)}`].filter(Boolean).join(" · ") || "—"}
                    </span>
                  </span>
                  {m.removable && (
                    <RowActions endpoint={`/api/security/users/${u.entra_user_id}`} actions={[{ key: "delete_method", label: "Remove", danger: true, needsReason: true, body: { methodId: m.id } }]} />
                  )}
                </div>
              ))}
              <p className="text-xs mt-2" style={{ color: dim }}>
                Don&apos;t recognise a method or device, or one was added recently without them? Remove it, or contain the account.
              </p>
            </div>
          )}
        </Section>

        <Section title="Devices">
          {devs.length === 0 ? (
            <p className="text-sm" style={{ color: dim }}>
              None recorded.
            </p>
          ) : (
            <div className="grid gap-2">
              {devs.map((d) => (
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
        </Section>

        <Section title={`Recent sign-ins (14 days${signIns.length ? `, ${failedCount} failed` : ""})`} wide>
          {signInsRes.error ? (
            <Err msg={signInsRes.error} />
          ) : signIns.length === 0 ? (
            <p className="text-sm" style={{ color: dim }}>
              No interactive sign-ins in the last 14 days.
            </p>
          ) : (
            <div className="max-h-[420px] overflow-y-auto">
              {signIns.slice(0, 40).map((s) => (
                <SignInRow key={s.id} s={s} />
              ))}
            </div>
          )}
        </Section>

        <section className="lg:col-span-2" style={{ ...card, overflow: "hidden" }}>
          <div className="px-4 pt-4 pb-3 flex items-center justify-between gap-2">
            <div className="text-xs font-bold uppercase tracking-wider" style={{ color: emerald }}>
              Inbox rules
            </div>
            <RowActions endpoint={`/api/security/users/${u.entra_user_id}`} actions={[{ key: "scan_rules", label: "Check now" }]} />
          </div>
          {ruleRows.length === 0 ? (
            <p className="text-sm px-4 pb-4" style={{ color: dim }}>
              No inbox rules found (or not scanned yet).
            </p>
          ) : (
            ruleRows.map((r) => <RuleRow key={r.rule_id} r={r} />)
          )}
          <div className="px-4 pb-4">
            <RuleNote />
          </div>
        </section>

        <Section title="Incidents involving them" wide>
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
        </Section>
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
                {!l.ok && <span style={{ color: rose }}> ({l.action === "contain_account" ? "incomplete" : `failed${l.detail?.error ? `: ${l.detail.error}` : ""}`})</span>} · {names.get(l.actor_id)?.name ?? "Someone"}
                {l.detail?.ticket && <span style={{ color: dim }}> · ticket {l.detail.ticket}</span>}
                {l.reason && (
                  <span className="block text-xs" style={{ color: dim }}>
                    {l.reason}
                  </span>
                )}
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
