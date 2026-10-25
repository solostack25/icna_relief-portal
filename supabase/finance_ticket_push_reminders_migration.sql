-- "Remind" button on a finance ticket: push notification to whoever the
-- ticket is waiting on, at most once a week per ticket.
alter table public.finance_tickets
  add column if not exists last_push_reminder_at timestamptz,
  add column if not exists last_push_reminder_by uuid references public.employees(id) on delete set null;
