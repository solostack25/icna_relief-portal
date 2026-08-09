-- IT-only ticket-closing gamification. Points are awarded the moment
-- a leg is closed (see closeLeg in lib/helpdesk.ts), logged as an
-- append-only ledger so the math is always auditable and re-derivable
-- rather than trusting a single running total that could drift.
--
-- Rules (as specified):
--   +5  closing a ticket that was assigned to you
--   +10 closing a ticket assigned to someone else ("taking" it)
--       (an unassigned ticket counts as "yours" for this purpose --
--       nobody's ticket was taken)
--   +10 bonus, closed on a weekend OR after 6pm on a weekday
--       (stacks with the above -- e.g. closing your own ticket at
--       7pm is 5 + 10 = 15)
-- All timestamps evaluated in America/Chicago (Houston), not UTC.

create table helpdesk_points_ledger (
  id uuid primary key default gen_random_uuid(),
  leg_id uuid not null references helpdesk_request_legs(id) on delete cascade,
  employee_id uuid not null references employees(id),
  points int not null,
  reason text not null check (reason in ('own_ticket', 'took_ticket', 'after_hours_bonus')),
  awarded_at timestamptz not null default now()
);

create index idx_helpdesk_points_employee on helpdesk_points_ledger(employee_id, awarded_at);

-- Who actually clicked "Close" -- may differ from
-- assigned_to_employee_id, which is what "took someone else's
-- ticket" is scored against.
alter table helpdesk_request_legs
  add column if not exists closed_by_employee_id uuid references employees(id);

-- Snapshot taken by the Friday cron job (see
-- app/api/cron/helpdesk-weekly-tally/route.ts) -- a point-in-time
-- record of standings, not a hard reset. Points keep accruing in the
-- ledger regardless; this table is for history/announcing, not the
-- source of truth.
create table helpdesk_weekly_tallies (
  id uuid primary key default gen_random_uuid(),
  week_start date not null,
  employee_id uuid not null references employees(id),
  total_points int not null,
  snapshotted_at timestamptz not null default now(),
  unique(week_start, employee_id)
);

alter table helpdesk_points_ledger enable row level security;
alter table helpdesk_weekly_tallies enable row level security;

create policy "authenticated staff read helpdesk_points_ledger" on helpdesk_points_ledger
  for select using (auth.role() = 'authenticated');
create policy "authenticated staff insert helpdesk_points_ledger" on helpdesk_points_ledger
  for insert with check (auth.role() = 'authenticated');
create policy "authenticated staff read helpdesk_weekly_tallies" on helpdesk_weekly_tallies
  for select using (auth.role() = 'authenticated');
