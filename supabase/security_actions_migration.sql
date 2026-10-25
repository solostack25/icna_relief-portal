-- ============================================================
-- Security actions (password reset, MFA reset, Temporary Access Pass,
-- compromised-account playbook, mailbox rules, Defender indicators)
--   sec_mailbox_rules   inbox rules per staff mailbox + what looked suspicious
--   sec_action_log      now also logs Defender indicator blocks
-- Run after security_response_migration.sql.
-- ============================================================

create table if not exists sec_mailbox_rules (
  user_id text not null,
  rule_id text not null,
  upn text not null,
  display_name text,
  rule_name text,
  enabled boolean not null default true,
  forwards text[] not null default '{}',
  external_targets text[] not null default '{}',
  flags text[] not null default '{}',
  severity text check (severity in ('high', 'medium')),
  conditions jsonb,
  actions jsonb,
  -- "It's fine": the flags as they were when reviewed. A rule is flagged
  -- again if its findings change.
  reviewed_flags text[],
  reviewed_by uuid references employees(id),
  reviewed_at timestamptz,
  synced_at timestamptz not null default now(),
  primary key (user_id, rule_id)
);
create index if not exists sec_mailbox_rules_flagged on sec_mailbox_rules (severity) where severity is not null;
alter table sec_mailbox_rules enable row level security;

alter table sec_action_log drop constraint if exists sec_action_log_target_type_check;
alter table sec_action_log add constraint sec_action_log_target_type_check
  check (target_type in ('user', 'incident', 'device', 'indicator'));
