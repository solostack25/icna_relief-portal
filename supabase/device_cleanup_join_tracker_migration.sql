-- ============================================================
-- Device Management: stale-device cleanup + Entra join tracker
--
-- it_directory_users gains the Entra office/department so the join
-- tracker can group people by office (most staff have no portal
-- employee row, so b2s office assignment isn't available for them).
--
-- it_join_tracking: IT's working status per person for converting
-- their registered-only Windows PC to an Entra-joined one. "done" is
-- also set automatically by the tracker when the nightly sync sees the
-- person on an active Entra-joined computer.
-- Run after device_management_migration.sql.
-- ============================================================

alter table it_directory_users add column if not exists office_location text;
alter table it_directory_users add column if not exists department text;
alter table it_directory_users add column if not exists job_title text;

create table if not exists it_join_tracking (
  upn text primary key,              -- lower-cased user principal name
  status text not null default 'not_started'
    check (status in ('not_started', 'scheduled', 'in_progress', 'blocked', 'done', 'skip')),
  method text check (method in ('manual', 'ppkg', 'profile_wizard', 'autopilot')),
  scheduled_for date,
  note text,
  updated_by uuid references employees(id),
  updated_at timestamptz not null default now()
);
alter table it_join_tracking enable row level security;
