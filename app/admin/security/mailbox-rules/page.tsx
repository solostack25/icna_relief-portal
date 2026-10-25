import Link from "next/link";
import { fetchAllRows, lastSecuritySync } from "../data";
import RuleRow, { RULE_SELECT, RuleNote, needsReview, type MailRule } from "../RuleRow";
import { SecSyncButton, SecSyncStatus } from "../ui";
import { PageHead, card, dim, emerald, ink, line } from "../style";

export const dynamic = "force-dynamic";

// Inbox rules across every staff mailbox that forward mail outside ICNA
// or hide/delete it: what attackers set up after a takeover.
export default async function MailboxRulesPage({ searchParams }: { searchParams: Promise<{ show?: string }> }) {
  const { show } = await searchParams;
  const [rows, run] = await Promise.all([fetchAllRows<MailRule>("sec_mailbox_rules", RULE_SELECT, (q) => q.not("severity", "is", null)), lastSecuritySync()]);
  const open = rows.filter(needsReview);
  const shown = show === "all" ? rows : open;
  const rank: Record<string, number> = { high: 0, medium: 1 };
  shown.sort((a, b) => (rank[a.severity ?? ""] ?? 9) - (rank[b.severity ?? ""] ?? 9) || (a.display_name ?? a.upn).localeCompare(b.display_name ?? b.upn));
  const mailboxes = run?.counts?.mailboxes_scanned;

  const tab = (key: string, label: string) => {
    const on = (show === "all" ? "all" : "open") === key;
    return (
      <Link
        href={key === "all" ? "/admin/security/mailbox-rules?show=all" : "/admin/security/mailbox-rules"}
        className="text-xs font-bold rounded-full px-3 py-1.5"
        style={on ? { background: emerald, color: "#fff" } : { border: `1.5px solid ${line}`, color: ink }}
      >
        {label}
      </Link>
    );
  };

  return (
    <div className="max-w-5xl">
      <PageHead
        title="Mailbox rules"
        sub="Inbox rules that forward mail outside ICNA Relief, or hide or delete replies. After stealing a mailbox, attackers add these to keep reading mail and to hide replies to the phishing they send. Checked nightly across every staff mailbox."
        right={<SecSyncButton />}
      />
      <SecSyncStatus run={run} />
      <div className="flex flex-wrap items-center gap-2 mb-3">
        {tab("open", `Needs review (${open.length})`)}
        {tab("all", `All flagged (${rows.length})`)}
        {mailboxes != null && (
          <span className="text-xs ml-1" style={{ color: dim }}>
            {mailboxes} mailboxes checked
          </span>
        )}
      </div>
      <div style={{ ...card, overflow: "hidden" }}>
        {shown.length === 0 ? (
          <div className="p-8 text-center text-sm" style={{ color: dim }}>
            {show === "all" ? "No suspicious rules found." : "Nothing needs review."}
          </div>
        ) : (
          shown.map((r) => <RuleRow key={`${r.user_id}:${r.rule_id}`} r={r} showPerson />)
        )}
      </div>
      <p className="text-xs mt-3" style={{ color: dim }}>
        A forwarding rule to someone&apos;s personal email can be innocent, but it still sends ICNA data outside. If one looks like a takeover, open the person and use <b>This account is compromised</b>.
      </p>
      <RuleNote />
    </div>
  );
}
