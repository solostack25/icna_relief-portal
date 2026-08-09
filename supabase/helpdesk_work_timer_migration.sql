-- Active-work-time tracking, separate from a leg's actual status.
-- "Start Quest" / "Pause" in the quest theme now control this instead
-- of mutating status -- status changes happen via the workboard drag,
-- "Send to QA", and "Complete Quest" (close) instead.
--
-- running_since holds the timestamp the timer was last (re)started;
-- null means paused. Elapsed time while running is computed as
-- accumulated_seconds + (now - running_since), not written to the row
-- continuously -- accumulated_seconds only gets updated at the moment
-- of a pause (or a close, which auto-pauses).
create table helpdesk_work_timers (
  id uuid primary key default gen_random_uuid(),
  leg_id uuid not null references helpdesk_request_legs(id) on delete cascade unique,
  accumulated_seconds int not null default 0,
  running_since timestamptz,
  updated_at timestamptz not null default now()
);

alter table helpdesk_work_timers enable row level security;
create policy "authenticated staff manage helpdesk_work_timers" on helpdesk_work_timers
  for all using (auth.role() = 'authenticated');
