import { createAdminClient } from "@/lib/supabase/server";
import { GraphError, gBatchGet } from "@/lib/devices/graph";
import { analyzeRule, listInboxRules, type RawRule } from "./identity";

// Inbox-rule scanning: finds forwarding / hiding rules across every
// licensed mailbox (nightly) or one person's mailbox (on demand) and keeps
// the findings in sec_mailbox_rules. Needs MailboxSettings.Read (or
// .ReadWrite to act on them). Server-only.

type Admin = ReturnType<typeof createAdminClient>;

// ICNA's own domains, taken from staff sign-in names so no extra Graph
// permission is needed. Anything else counts as outside the org.
export async function internalDomains(admin: Admin = createAdminClient()): Promise<Set<string>> {
  const out = new Set<string>();
  for (let from = 0; ; from += 1000) {
    const { data } = await admin.from("it_directory_users").select("upn").range(from, from + 999);
    for (const { upn } of (data ?? []) as { upn: string }[]) {
      if (upn.includes("#EXT#")) continue;
      const d = upn.split("@")[1]?.toLowerCase();
      if (d) out.add(d);
    }
    if (!data || data.length < 1000) break;
  }
  return out;
}

type Person = { entra_user_id: string; upn: string; display_name: string | null };

function toRows(p: Person, rules: RawRule[], domains: Set<string>, now: string) {
  return rules.map((r) => {
    const f = analyzeRule(r, domains);
    return {
      user_id: p.entra_user_id,
      rule_id: r.id,
      upn: p.upn,
      display_name: p.display_name,
      rule_name: r.displayName ?? null,
      enabled: r.isEnabled !== false,
      forwards: f.forwards,
      external_targets: f.external,
      flags: f.flags,
      severity: f.severity,
      conditions: r.conditions ?? null,
      actions: r.actions ?? null,
      synced_at: now,
    };
  });
}

async function save(admin: Admin, rows: ReturnType<typeof toRows>, userIds: string[], now: string) {
  for (let i = 0; i < rows.length; i += 300) await admin.from("sec_mailbox_rules").upsert(rows.slice(i, i + 300), { onConflict: "user_id,rule_id" });
  // Rules that no longer exist in a scanned mailbox go away.
  for (let i = 0; i < userIds.length; i += 200) await admin.from("sec_mailbox_rules").delete().in("user_id", userIds.slice(i, i + 200)).lt("synced_at", now);
}

// Nightly: every licensed, enabled staff mailbox, 20 per Graph batch.
export async function scanAllMailboxRules(admin: Admin, now: string, counts: Record<string, number>) {
  const people: Person[] = [];
  for (let from = 0; ; from += 1000) {
    const { data } = await admin
      .from("it_directory_users")
      .select("entra_user_id, upn, display_name, sku_ids, account_enabled")
      .neq("account_enabled", false)
      .range(from, from + 999);
    for (const p of (data ?? []) as (Person & { sku_ids: string[] })[]) if (p.sku_ids?.length && !p.upn.includes("#EXT#")) people.push(p);
    if (!data || data.length < 1000) break;
  }
  const domains = await internalDomains(admin);
  const res = await gBatchGet(people.map((p) => ({ id: p.entra_user_id, url: `/users/${p.entra_user_id}/mailFolders/inbox/messageRules` })));

  const rows: ReturnType<typeof toRows> = [];
  const scanned: string[] = [];
  let denied = 0;
  for (const p of people) {
    const r = res.get(p.entra_user_id);
    if (!r) continue;
    if (r.status === 401 || r.status === 403) denied++;
    if (r.status >= 300) continue; // no mailbox (404), or no access
    scanned.push(p.entra_user_id);
    rows.push(...toRows(p, (r.body?.value ?? []) as RawRule[], domains, now));
  }
  if (people.length && denied === people.length) {
    throw new GraphError(403, "Access to every mailbox was denied");
  }
  await save(admin, rows, scanned, now);
  counts.mailboxes_scanned = scanned.length;
  counts.mailbox_rules = rows.length;
  counts.mailbox_rules_flagged = rows.filter((r) => r.severity).length;
}

// On demand, for one person (the user page and the playbook).
export async function scanUserMailboxRules(userId: string) {
  const admin = createAdminClient();
  const { data: p } = await admin.from("it_directory_users").select("entra_user_id, upn, display_name").eq("entra_user_id", userId).maybeSingle();
  if (!p) throw new Error("Person not found in the directory sync.");
  const now = new Date().toISOString();
  const [rules, domains] = await Promise.all([listInboxRules(userId), internalDomains(admin)]);
  const rows = toRows(p as Person, rules, domains, now);
  await save(admin, rows, [userId], now);
  return rows;
}
