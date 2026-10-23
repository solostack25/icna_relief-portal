import Link from "next/link";
import { fetchAllRows, lastSecuritySync } from "../data";
import { SecSyncButton, SecSyncStatus } from "../ui";
import { PageHead, SeverityPill, card, dim, faint, ink, line, relTime } from "../style";

export const dynamic = "force-dynamic";

const DETAIL: Record<string, string> = {
  none: "",
  adminGeneratedTemporaryPassword: "Admin reset the password",
  userPerformedSecuredPasswordChange: "User changed password securely",
  userPerformedSecuredPasswordReset: "User reset password securely",
  adminConfirmedSigninSafe: "Admin confirmed sign-in safe",
  aiConfirmedSigninSafe: "Confirmed safe automatically",
  userPassedMFADrivenByRiskBasedPolicy: "User passed MFA",
  adminDismissedAllRiskForUser: "Admin dismissed risk",
  adminConfirmedSigninCompromised: "Admin confirmed compromised",
  adminConfirmedUserCompromised: "Admin confirmed user compromised",
  hidden: "",
};

type Risky = { user_id: string; upn: string | null; display_name: string | null; risk_level: string | null; risk_state: string | null; risk_detail: string | null; last_updated_at: string | null };

export default async function RiskyUsersPage() {
  const [rows, run] = await Promise.all([
    fetchAllRows<Risky>("sec_risky_users", "user_id, upn, display_name, risk_level, risk_state, risk_detail, last_updated_at"),
    lastSecuritySync(),
  ]);
  const order: Record<string, number> = { high: 0, medium: 1, low: 2 };
  rows.sort((a, b) => (order[a.risk_level ?? ""] ?? 9) - (order[b.risk_level ?? ""] ?? 9) || (b.last_updated_at ?? "").localeCompare(a.last_updated_at ?? ""));

  return (
    <div className="max-w-5xl">
      <PageHead
        title="Risky users"
        sub="Accounts Entra ID Protection thinks may be compromised (leaked credentials, impossible travel, sign-ins from known bad IPs). Reset the password, check their recent sign-ins, then dismiss or confirm in Entra."
        right={<SecSyncButton />}
      />
      <SecSyncStatus run={run} />
      <div style={{ ...card, overflow: "hidden" }}>
        {rows.length === 0 ? (
          <div className="p-8 text-center text-sm" style={{ color: dim }}>
            No users at risk right now.
          </div>
        ) : (
          rows.map((r) => (
            <div key={r.user_id} className="px-4 py-3 flex flex-wrap items-center justify-between gap-3" style={{ borderTop: `1px solid ${line}` }}>
              <div className="min-w-0">
                <div className="font-bold text-sm" style={{ color: ink }}>
                  {r.display_name ?? r.upn}
                </div>
                <div className="text-xs" style={{ color: faint }}>
                  {r.upn} · {r.risk_state === "confirmedCompromised" ? "confirmed compromised" : "at risk"} · updated {relTime(r.last_updated_at)}
                  {r.risk_detail && DETAIL[r.risk_detail] ? ` · ${DETAIL[r.risk_detail]}` : ""}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <SeverityPill severity={r.risk_level} />
                <Link href={`/admin/security/user?id=${r.user_id}`} className="text-xs font-bold rounded-full px-3 py-1.5" style={{ background: "#1F6F54", color: "#fff" }}>
                  Respond
                </Link>
                <a
                  href={`https://entra.microsoft.com/#view/Microsoft_AAD_IAM/IdentityProtectionMenuBlade/~/RiskyUsers`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs font-bold rounded-full px-3 py-1.5"
                  style={{ border: `1.5px solid ${line}`, color: ink }}
                >
                  Open in Entra ↗
                </a>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
