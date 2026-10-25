import Link from "next/link";
import { explainSignInError, tenantSignIns, type SignIn } from "@/lib/security/identity";
import { PageHead, SeverityPill, card, dim, emerald, faint, gold, ink, line, relTime, rose } from "../style";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const HOME_COUNTRY = "US";
const WINDOWS = [
  { h: 24, label: "24 hours" },
  { h: 72, label: "3 days" },
  { h: 168, label: "7 days" },
];

type Group = { key: string; userId: string | null; name: string; upn: string | null; rows: SignIn[] };

function groupBy(rows: SignIn[], key: (s: SignIn) => string): Group[] {
  const m = new Map<string, Group>();
  for (const s of rows) {
    const k = key(s);
    const g = m.get(k) ?? { key: k, userId: s.userId, name: s.name ?? s.upn ?? "Unknown", upn: s.upn, rows: [] };
    g.rows.push(s);
    m.set(k, g);
  }
  return Array.from(m.values());
}

const uniq = (xs: (string | null)[]) => Array.from(new Set(xs.filter(Boolean) as string[]));

function Person({ g }: { g: Group }) {
  return g.userId ? (
    <Link href={`/admin/security/user?id=${g.userId}`} className="font-bold underline" style={{ color: ink }}>
      {g.name}
    </Link>
  ) : (
    <b style={{ color: ink }}>{g.name}</b>
  );
}

function Block({ title, sub, count, children }: { title: string; sub: string; count: number; children: React.ReactNode }) {
  return (
    <section className="mb-5" style={{ ...card, overflow: "hidden" }}>
      <div className="px-4 pt-4 pb-2">
        <div className="text-sm font-bold" style={{ color: count ? ink : emerald }}>
          {title} · {count}
        </div>
        <div className="text-xs" style={{ color: dim }}>
          {sub}
        </div>
      </div>
      {count === 0 ? (
        <div className="px-4 pb-4 text-sm" style={{ color: dim }}>
          Nothing in this window.
        </div>
      ) : (
        children
      )}
    </section>
  );
}

const Row = ({ children }: { children: React.ReactNode }) => (
  <div className="px-4 py-2.5 flex flex-wrap items-start justify-between gap-2 text-sm" style={{ borderTop: `1px solid ${line}` }}>
    {children}
  </div>
);

// Tenant-wide sign-in review, pulled live from Entra.
export default async function SignInsPage({ searchParams }: { searchParams: Promise<{ hours?: string }> }) {
  const { hours: h } = await searchParams;
  const hours = WINDOWS.find((w) => String(w.h) === h)?.h ?? 24;

  let data: { rows: SignIn[]; capped: boolean } | null = null;
  let error: string | null = null;
  try {
    data = await tenantSignIns(hours);
  } catch (e) {
    error = explainSignInError(e);
  }
  const rows = data?.rows ?? [];

  // 1. Successful sign-ins from abroad, by person + country.
  const abroad = groupBy(
    rows.filter((s) => s.ok && s.country && s.country !== HOME_COUNTRY),
    (s) => `${s.userId ?? s.upn}|${s.country}`
  ).sort((a, b) => b.rows[0].at.localeCompare(a.rows[0].at));

  // 2. Accounts with a burst of failures (guessing or a stale password).
  const failed = groupBy(
    rows.filter((s) => !s.ok),
    (s) => s.userId ?? s.upn ?? "?"
  )
    .filter((g) => g.rows.length >= 5)
    .sort((a, b) => b.rows.length - a.rows.length)
    .slice(0, 40);

  // 3. IPs failing against many different accounts (password spray).
  const byIp = new Map<string, { ip: string; users: Set<string>; n: number; country: string | null; last: string }>();
  for (const s of rows) {
    if (s.ok || !s.ip) continue;
    const e = byIp.get(s.ip) ?? { ip: s.ip, users: new Set<string>(), n: 0, country: s.country, last: s.at };
    e.users.add(s.upn ?? s.userId ?? "?");
    e.n++;
    if (s.at > e.last) e.last = s.at;
    byIp.set(s.ip, e);
  }
  const spray = Array.from(byIp.values())
    .filter((e) => e.users.size >= 5)
    .sort((a, b) => b.users.size - a.users.size);

  // 4. Sign-ins Entra itself scored as risky.
  const risky = rows.filter((s) => s.risk).slice(0, 50);

  return (
    <div className="max-w-5xl">
      <PageHead
        title="Sign-ins"
        sub="Live from Entra: interactive sign-ins grouped into what's worth a look. Click a person to see all their sign-ins and respond."
        right={
          <div className="flex gap-1.5">
            {WINDOWS.map((w) => (
              <Link
                key={w.h}
                href={`/admin/security/signins?hours=${w.h}`}
                className="text-xs font-bold rounded-full px-3 py-1.5"
                style={w.h === hours ? { background: emerald, color: "#fff" } : { border: `1.5px solid ${line}`, color: ink }}
              >
                {w.label}
              </Link>
            ))}
          </div>
        }
      />
      {error ? (
        <div className="rounded-2xl px-4 py-3 text-sm my-4" style={{ background: `${gold}10`, border: `1px solid ${gold}40`, color: ink }}>
          {error}
        </div>
      ) : (
        <>
          <div className="text-xs mb-4" style={{ color: dim }}>
            {rows.length.toLocaleString()} sign-ins · {rows.filter((s) => !s.ok).length.toLocaleString()} failed
            {data?.capped && <b style={{ color: gold }}> · stopped at {rows.length.toLocaleString()}, pick a shorter window for the full picture</b>}
          </div>

          <Block title="Signed in from outside the US" sub="Successful sign-ins only. Fine if they're travelling; otherwise treat it as a takeover." count={abroad.length}>
            {abroad.map((g) => (
              <Row key={g.key}>
                <span className="min-w-0">
                  <Person g={g} />
                  <span style={{ color: rose, fontWeight: 700 }}> · {uniq(g.rows.map((s) => [s.city, s.country].filter(Boolean).join(", "))).join("; ")}</span>
                  <span className="block text-xs" style={{ color: faint }}>
                    {g.rows.length} sign-in{g.rows.length === 1 ? "" : "s"} · {uniq(g.rows.map((s) => s.app)).slice(0, 3).join(", ")} · IP {uniq(g.rows.map((s) => s.ip)).slice(0, 3).join(", ")}
                  </span>
                </span>
                <span className="text-xs" style={{ color: faint }}>
                  {relTime(g.rows[0].at)}
                </span>
              </Row>
            ))}
          </Block>

          <Block title="Possible password spraying" sub="One IP address failing against 5+ different accounts. Block it with a Conditional Access named location, and make sure those people have MFA." count={spray.length}>
            {spray.map((e) => (
              <Row key={e.ip}>
                <span className="min-w-0">
                  <b style={{ color: ink }}>{e.ip}</b>
                  <span style={{ color: dim }}> · {e.country ?? "unknown country"}</span>
                  <span className="block text-xs" style={{ color: faint }}>
                    {e.n} failures across {e.users.size} accounts: {Array.from(e.users).slice(0, 5).join(", ")}
                    {e.users.size > 5 ? "…" : ""}
                  </span>
                </span>
                <span className="text-xs" style={{ color: faint }}>
                  {relTime(e.last)}
                </span>
              </Row>
            ))}
          </Block>

          <Block title="Repeated failed sign-ins" sub="5+ failures for one account. Usually a saved old password on a phone; sometimes someone guessing." count={failed.length}>
            {failed.map((g) => (
              <Row key={g.key}>
                <span className="min-w-0">
                  <Person g={g} />
                  <span style={{ color: dim }}> · {g.rows.length} failures</span>
                  <span className="block text-xs" style={{ color: faint }}>
                    {uniq(g.rows.map((s) => s.error)).slice(0, 2).join("; ")} · from {uniq(g.rows.map((s) => s.country)).join(", ") || "unknown"}
                  </span>
                </span>
                <span className="text-xs" style={{ color: faint }}>
                  {relTime(g.rows[0].at)}
                </span>
              </Row>
            ))}
          </Block>

          <Block title="Risky sign-ins" sub="Sign-ins Entra ID Protection scored as risky at the time (needs Entra ID P2 to see detail)." count={risky.length}>
            {risky.map((s) => (
              <Row key={s.id}>
                <span className="min-w-0">
                  {s.userId ? (
                    <Link href={`/admin/security/user?id=${s.userId}`} className="font-bold underline" style={{ color: ink }}>
                      {s.name ?? s.upn}
                    </Link>
                  ) : (
                    <b>{s.name ?? s.upn}</b>
                  )}
                  <span style={{ color: dim }}> · {s.ok ? "succeeded" : "failed"} · {s.app}</span>
                  <span className="block text-xs" style={{ color: faint }}>
                    {[s.city, s.country].filter(Boolean).join(", ") || "Unknown place"} · {s.ip}
                  </span>
                </span>
                <span className="flex items-center gap-2">
                  <SeverityPill severity={s.risk} />
                  <span className="text-xs" style={{ color: faint }}>
                    {relTime(s.at)}
                  </span>
                </span>
              </Row>
            ))}
          </Block>
        </>
      )}
    </div>
  );
}
