-- Office goal agreements (applied via Supabase MCP as goal_agreements).
--
-- Every time upper management saves an office goal on Settings → Goals &
-- Budgets (or edits it later), the office's area manager gets a document to
-- sign agreeing to it. One row per document sent: a modified goal creates a
-- new row and the older unsigned one is marked superseded, so the Goals page
-- keeps the full record of who agreed to what amount and when.

create table if not exists insights_goal_agreements (
  id uuid primary key default gen_random_uuid(),
  year int not null check (year between 2000 and 2100),
  office_id uuid not null references b2s_offices(id) on delete cascade,
  metric text not null check (metric in ('fundraising', 'value_of_services', 'people_served', 'budget')),
  amount numeric not null check (amount >= 0),
  previous_amount numeric,
  kind text not null check (kind in ('new', 'modified')),
  status text not null default 'pending' check (status in ('pending', 'signed', 'superseded')),
  -- who it went to (the office's area manager at the time)
  recipient_employee_id uuid references employees(id),
  recipient_email text,
  recipient_name text,
  -- who set the goal
  created_by uuid references employees(id),
  created_at timestamptz not null default now(),
  email_status text check (email_status in ('sent', 'failed', 'no_recipient')),
  email_error text,
  emailed_at timestamptz,
  -- signature
  signed_by uuid references employees(id),
  signed_name text,
  signed_at timestamptz,
  signed_ip text,
  pdf_path text,
  superseded_at timestamptz
);
create index if not exists insights_goal_agreements_goal_idx on insights_goal_agreements (year, office_id, metric, created_at desc);
create index if not exists insights_goal_agreements_recipient_idx on insights_goal_agreements (recipient_employee_id, status);

alter table insights_goal_agreements enable row level security;
-- All reads/writes go through server routes with the service role; admins can
-- also read directly.
create policy insights_goal_agreements_admin on insights_goal_agreements for all using (is_admin()) with check (is_admin());

-- Private bucket for the signed PDFs.
insert into storage.buckets (id, name, public)
values ('goal-agreements', 'goal-agreements', false)
on conflict (id) do nothing;
