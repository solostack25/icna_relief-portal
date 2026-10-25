import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/server";
import { fetchAllRows, lastSecuritySync, loadMfaPeople } from "./data";
import { activePlatforms, isIrrelevant } from "@/lib/security/platforms";
import { SecSyncButton, SecSyncStatus } from "./ui";
import { RULE_SELECT, needsReview, type MailRule } from "./RuleRow";
import { PageHead, SeverityPill, card, dim, emerald, faint, gold, ink, line, relTime, rose } from "./style";

export const dynamic = "force-dynamic";

type Score = { created_at: string; current_score: number; max_score: number; comparative: { basis?: string; averageScore?: number }[] | null };
type Control = { id: string; title: string; category: string | null; max_score: number | null; current_score: number | null; user_impact: string | null; implementation_cost: string | null; deprecated: boolean };
type Inc = { id: string; display_name: string | null; severity: string | null; status: string | null; last_update_at: string | null; devices: string[]; users: string[] };
type Dev = { device_key: string; display_name: string | null; operating_system: string | null; trust_type: string | null; mde_onboarding: string | null; vuln_critical: number | null; approx_last_sign_in: string | null; intune_last_sync: string | null };

function Sparkline({ points }: { points: number[] }) {
  if (points.length < 2) return null;
  const w = 220;
  const h = 44;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = max - min || 1;
  const d = points.map((p, i) => `${i ? "L" : "M"}${((i / (points.length - 1)) * w).toFixed(1)},${(h - 4 - ((p - min) / span) * (h - 8)).toFixed(1)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" height={h} preserveAspectRatio="none" aria-hidden>
      <path d={d} fill="none" stroke={emerald} strokeWidth="2" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function Tile({ n, label, hint, color, href }: { n: string | number; label: string; hint?: string; color: string; href?: string }) {
  const body = (
    <div className="p-4 h-full transition-transform hover:-translate-y-0.5" style={card}>
      <div style={{ fontFamily: "'Fraunces', serif", fontSize: 28, fontWeight: 500, color, lineHeight: 1 }}>{n}</div>
      <div className="text-xs font-bold mt-1.5" style={{ color: ink }}>
        {label}
      </div>
      {hint && (
        <div className="text-[11px]" style={{ color: faint }}>
          {hint}
        </div>
      )}
    </div>
  );
  return href ? <Link href={href}>{body}</Link> : body;
}

export default async function SecurityOverview() {
  const admin = createAdminClient();
  const [run, { data: scoreRows }, controls, { data: incRows }, mfa, { count: riskyCount }, devices, platforms, flaggedRules] = await Promise.all([
    lastSecuritySync(),
    admin.from("sec_secure_scores").select("created_at, current_score, max_score, comparative").order("created_at", { ascending: true }).limit(90),
    fetchAllRows<Control>("sec_score_controls", "id, title, category, max_score, current_score, user_impact, implementation_cost, deprecated"),
    admin.from("sec_incidents").select("id, display_name, severity, status, last_update_at, devices, users").neq("status", "resolved").order("last_update_at", { ascending: false }).limit(200),
    loadMfaPeople(),
    admin.from("sec_risky_users").select("user_id", { count: "exact", head: true }),
    fetchAllRows<Dev>("it_devices", "device_key, display_name, operating_system, trust_type, mde_onboarding, vuln_critical, approx_last_sign_in, intune_last_sync", (q) => q.is("removed_at", null).neq("account_enabled", false)),
    activePlatforms(),
    fetchAllRows<MailRule>("sec_mailbox_rules", RULE_SELECT, (q) => q.not("severity", "is", null)),
  ]);
  const openRules = flaggedRules.filter(needsReview);
  const externalForwards = openRules.filter((r) => r.external_targets.length > 0).length;

  const scores = (scoreRows ?? []) as Score[];
  const latest = scores[scores.length - 1];
  const monthAgo = scores.find((s) => new Date(s.created_at).getTime() >= Date.now() - 31 * 86_400_000);
  const pct = latest ? Math.round((latest.current_score / latest.max_score) * 1000) / 10 : null;
  const delta = latest && monthAgo ? Math.round((latest.current_score - monthAgo.current_score) * 10) / 10 : null;
  const similar = latest?.comparative?.find((c) => c.basis === "TotalSeats") ?? latest?.comparative?.find((c) => c.basis === "AllTenants");

  const todo = controls
    .filter((c) => !c.deprecated && (c.max_score ?? 0) > (c.current_score ?? 0) && !isIrrelevant(c.title, platforms))
    .map((c) => ({ ...c, gain: Math.round(((c.max_score ?? 0) - (c.current_score ?? 0)) * 10) / 10 }))
    .sort((a, b) => b.gain - a.gain)
    .slice(0, 6);

  const incidents = (incRows ?? []) as Inc[];
  const sev = (s: string) => incidents.filter((i) => (i.severity ?? "").toLowerCase() === s).length;

  const noMfa = mfa.filter((p) => !p.registered);
  const adminsNoMfa = noMfa.filter((p) => p.isAdmin);

  const active = Date.now() - 30 * 86_400_000;
  const managedWin = devices.filter(
    (d) =>
      (d.operating_system ?? "").toLowerCase().includes("windows") &&
      (d.trust_type === "AzureAd" || d.trust_type === "ServerAd") &&
      new Date([d.approx_last_sign_in, d.intune_last_sync].filter(Boolean).sort().pop() ?? 0).getTime() > active
  );
  const onboarded = managedWin.filter((d) => (d.mde_onboarding ?? "").toLowerCase() === "onboarded").length;
  const critDevices = devices.filter((d) => (d.vuln_critical ?? 0) > 0).length;
  const anyDefender = devices.some((d) => d.mde_onboarding);

  return (
    <div className="max-w-6xl">
      <PageHead title="Security" sub="Microsoft Defender, Entra ID Protection and Secure Score for ICNA Relief's Microsoft 365 tenant. Synced nightly." right={<SecSyncButton />} />
      <SecSyncStatus run={run} />

      <form action="/admin/security/user" className="flex flex-wrap items-center gap-2 mb-5 p-3" style={card}>
        <span className="text-sm font-bold px-1" style={{ color: ink }}>
          Respond to a person
        </span>
        <input name="q" placeholder="Name or email" className="flex-1 min-w-[180px] rounded-xl px-3 py-2 text-sm bg-white outline-none" style={{ border: `1.5px solid ${line}` }} />
        <button className="text-sm font-bold rounded-full px-4 py-2" style={{ background: emerald, color: "#fff" }}>
          Find
        </button>
        <Link href="/admin/security/signins" className="text-xs font-bold rounded-full px-3 py-2" style={{ border: `1.5px solid ${line}`, color: ink }}>
          Review sign-ins
        </Link>
        <Link href="/admin/security/indicators" className="text-xs font-bold rounded-full px-3 py-2" style={{ border: `1.5px solid ${line}`, color: ink }}>
          Block a link or file
        </Link>
      </form>

      <div className="grid lg:grid-cols-3 gap-4 mb-6">
        <section className="p-5 lg:col-span-1" style={card}>
          <div className="text-xs font-bold uppercase tracking-wider" style={{ color: emerald }}>
            Secure Score
          </div>
          {latest ? (
            <>
              <div className="flex items-end gap-2 mt-1">
                <div style={{ fontFamily: "'Fraunces', serif", fontSize: 44, fontWeight: 500, color: ink, lineHeight: 1 }}>{pct}%</div>
                {delta != null && (
                  <div className="text-sm font-bold mb-1" style={{ color: delta >= 0 ? emerald : rose }}>
                    {delta >= 0 ? "+" : ""}
                    {delta} pts / 30d
                  </div>
                )}
              </div>
              <div className="text-xs mb-2" style={{ color: dim }}>
                {Math.round(latest.current_score)} of {Math.round(latest.max_score)} points
                {similar?.averageScore != null ? ` · similar-size orgs average ${Math.round((similar.averageScore / latest.max_score) * 100)}%` : ""}
              </div>
              <Sparkline points={scores.map((s) => (s.current_score / s.max_score) * 100)} />
              <Link href="/admin/security/score" className="text-xs font-bold" style={{ color: emerald }}>
                See what to fix →
              </Link>
            </>
          ) : (
            <p className="text-sm mt-2" style={{ color: dim }}>
              No Secure Score yet.
            </p>
          )}
        </section>

        <div className="lg:col-span-2 grid grid-cols-2 sm:grid-cols-3 gap-3">
          <Tile n={incidents.length} label="Open incidents" hint={`${sev("high")} high · ${sev("medium")} medium · ${sev("low")} low`} color={incidents.length ? rose : emerald} href="/admin/security/incidents" />
          <Tile n={noMfa.length} label="Staff without MFA" hint={`of ${mfa.length} licensed accounts`} color={noMfa.length ? rose : emerald} href="/admin/security/mfa" />
          <Tile n={adminsNoMfa.length} label="Admins without MFA" hint="Fix these first" color={adminsNoMfa.length ? rose : emerald} href="/admin/security/mfa?admins=1" />
          <Tile n={riskyCount ?? 0} label="Risky users" hint="Entra ID Protection" color={(riskyCount ?? 0) ? gold : emerald} href="/admin/security/risky" />
          <Tile
            n={anyDefender ? `${onboarded}/${managedWin.length}` : "—"}
            label="Joined PCs in Defender"
            hint={anyDefender ? "Onboarded to Defender for Endpoint" : "No Defender device data yet"}
            color={anyDefender && onboarded === managedWin.length ? emerald : gold}
            href="/admin/devices"
          />
          <Tile n={anyDefender ? critDevices : "—"} label="PCs with critical vulns" hint="From Defender vulnerability management" color={critDevices ? rose : emerald} />
          <Tile
            n={openRules.length}
            label="Suspicious mailbox rules"
            hint={externalForwards ? `${externalForwards} forward outside ICNA` : "Forwarding / hiding rules"}
            color={externalForwards ? rose : openRules.length ? gold : emerald}
            href="/admin/security/mailbox-rules"
          />
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <section className="p-5" style={card}>
          <div className="text-sm font-bold mb-3" style={{ color: ink }}>
            Biggest Secure Score wins
          </div>
          {todo.length === 0 ? (
            <p className="text-sm" style={{ color: dim }}>
              Nothing yet.
            </p>
          ) : (
            <div className="grid gap-2">
              {todo.map((c) => (
                <Link key={c.id} href={`/admin/security/score?open=${encodeURIComponent(c.id)}`} className="flex justify-between gap-3 text-sm pb-2" style={{ borderBottom: `1px solid ${line}` }}>
                  <div className="min-w-0">
                    <div className="font-semibold" style={{ color: ink }}>
                      {c.title}
                    </div>
                    <div className="text-xs" style={{ color: faint }}>
                      {[c.category, c.user_impact && `user impact ${c.user_impact.toLowerCase()}`].filter(Boolean).join(" · ")}
                    </div>
                  </div>
                  <span className="font-bold whitespace-nowrap" style={{ color: emerald }}>
                    +{c.gain}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </section>

        <section className="p-5" style={card}>
          <div className="text-sm font-bold mb-3" style={{ color: ink }}>
            Open incidents
          </div>
          {incidents.length === 0 ? (
            <p className="text-sm" style={{ color: dim }}>
              No open incidents.
            </p>
          ) : (
            <div className="grid gap-2">
              {incidents.slice(0, 6).map((i) => (
                <Link key={i.id} href="/admin/security/incidents" className="flex justify-between gap-3 text-sm pb-2" style={{ borderBottom: `1px solid ${line}` }}>
                  <div className="min-w-0">
                    <div className="font-semibold truncate" style={{ color: ink }}>
                      {i.display_name}
                    </div>
                    <div className="text-xs truncate" style={{ color: faint }}>
                      {[...i.devices, ...i.users].slice(0, 3).join(", ") || "—"} · {relTime(i.last_update_at)}
                    </div>
                  </div>
                  <SeverityPill severity={i.severity} />
                </Link>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
