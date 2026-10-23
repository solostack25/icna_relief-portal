-- ============================================================
-- Security response actions
--   sec_action_log   every user / incident response action (who, why, result)
--   it_devices       remembers the last isolation action the portal sent
-- Device actions keep logging to it_device_audit.
-- Run after security_center_migration.sql.
-- ============================================================

create table if not exists sec_action_log (
  id uuid primary key default gen_random_uuid(),
  target_type text not null check (target_type in ('user', 'incident', 'device')),
  target_id text not null,
  target_name text,
  action text not null,
  actor_id uuid references employees(id),
  reason text,
  ok boolean not null default true,
  detail jsonb,
  created_at timestamptz not null default now()
);
create index if not exists sec_action_log_target on sec_action_log (target_type, target_id, created_at desc);
create index if not exists sec_action_log_created on sec_action_log (created_at desc);
alter table sec_action_log enable row level security;

alter table it_devices add column if not exists mde_isolation_state text;   -- isolated | released
alter table it_devices add column if not exists mde_isolation_changed_at timestamptz;
