import Link from "next/link";
import RowActions from "./RowActions";
import { SeverityPill, dim, emerald, faint, ink, line, relTime, rose } from "./style";

export type MailRule = {
  user_id: string;
  rule_id: string;
  upn: string;
  display_name: string | null;
  rule_name: string | null;
  enabled: boolean;
  forwards: string[];
  external_targets: string[];
  flags: string[];
  severity: string | null;
  reviewed_flags: string[] | null;
  reviewed_at: string | null;
  synced_at: string;
};

export const RULE_SELECT = "user_id, rule_id, upn, display_name, rule_name, enabled, forwards, external_targets, flags, severity, reviewed_flags, reviewed_at, synced_at";

// Flagged, and not already marked fine with the same findings.
export function needsReview(r: MailRule) {
  if (!r.severity) return false;
  const seen = r.reviewed_flags ?? null;
  return !seen || seen.length !== r.flags.length || seen.some((f, i) => f !== r.flags[i]);
}

export default function RuleRow({ r, showPerson }: { r: MailRule; showPerson?: boolean }) {
  const open = needsReview(r);
  return (
    <div className="px-4 py-3 flex flex-wrap items-start justify-between gap-3" style={{ borderTop: `1px solid ${line}` }}>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-bold flex flex-wrap items-center gap-2" style={{ color: ink }}>
          {showPerson && (
            <Link href={`/admin/security/user?id=${r.user_id}`} className="underline">
              {r.display_name ?? r.upn}
            </Link>
          )}
          <span>{showPerson ? `· "${r.rule_name || "unnamed"}"` : `"${r.rule_name || "unnamed"}"`}</span>
          {!r.enabled && (
            <span className="text-[11px] font-bold rounded-full px-2 py-0.5" style={{ color: faint, border: `1px solid ${line}` }}>
              off
            </span>
          )}
          {r.severity && open && <SeverityPill severity={r.severity} />}
          {r.severity && !open && (
            <span className="text-[11px] font-bold" style={{ color: emerald }}>
              reviewed, fine
            </span>
          )}
        </div>
        {r.flags.length > 0 ? (
          <ul className="text-xs mt-1 grid gap-0.5" style={{ color: open ? rose : dim }}>
            {r.flags.map((f) => (
              <li key={f}>• {f}</li>
            ))}
          </ul>
        ) : (
          <div className="text-xs mt-0.5" style={{ color: faint }}>
            {r.forwards.length ? `Forwards to ${r.forwards.join(", ")}` : "Nothing suspicious"} · checked {relTime(r.synced_at)}
          </div>
        )}
      </div>
      {r.severity && (
        <RowActions
          endpoint="/api/security/mailbox-rules"
          actions={[
            ...(r.enabled ? [{ key: "disable", label: "Switch off", danger: true, needsReason: true, body: { userId: r.user_id, ruleId: r.rule_id } }] : [{ key: "enable", label: "Switch on", body: { userId: r.user_id, ruleId: r.rule_id } }]),
            { key: "delete", label: "Delete", danger: true, needsReason: true, body: { userId: r.user_id, ruleId: r.rule_id } },
            ...(open ? [{ key: "mark_ok", label: "It's fine", needsReason: true, body: { userId: r.user_id, ruleId: r.rule_id } }] : []),
          ]}
        />
      )}
    </div>
  );
}

export function RuleNote() {
  return (
    <p className="text-xs mt-2" style={{ color: dim }}>
      Covers inbox rules only. Mailbox-level forwarding set by an admin in Exchange isn&apos;t visible to Graph; check it in the Exchange admin center if you suspect it.
    </p>
  );
}
