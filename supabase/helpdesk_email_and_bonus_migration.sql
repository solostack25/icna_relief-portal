-- Tracks every email sent to a requester from a ticket, so the
-- "+2 for emailing within 5 hours" bonus can be awarded exactly once
-- per ticket (checked by the send-email route before inserting a
-- ledger row) and so there's a real record of contact, not just a
-- point side-effect.
create table helpdesk_email_log (
  id uuid primary key default gen_random_uuid(),
  leg_id uuid not null references helpdesk_request_legs(id) on delete cascade,
  sent_by_employee_id uuid not null references employees(id),
  to_email text not null,
  subject text not null,
  body text not null,
  sent_at timestamptz not null default now()
);

alter table helpdesk_email_log enable row level security;
create policy "authenticated staff manage helpdesk_email_log" on helpdesk_email_log
  for all using (auth.role() = 'authenticated');

-- Two new point reasons: closing within 24h of the ticket opening,
-- and emailing the requester within 5h of it opening. Both are
-- bonuses on top of the base close points -- see closeLeg and the
-- send-email route in lib/helpdesk.ts / app/api/helpdesk/send-email.
alter table helpdesk_points_ledger drop constraint if exists helpdesk_points_ledger_reason_check;
alter table helpdesk_points_ledger add constraint helpdesk_points_ledger_reason_check
  check (reason in ('own_ticket', 'took_ticket', 'after_hours_bonus', 'fast_close_bonus', 'email_within_5h_bonus'));
