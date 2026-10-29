-- ============================================================
-- Time off requests, leave balances, and weekly timesheet approvals
--
-- Built ahead of ADP access: everything works inside the portal now,
-- and each request / approved timesheet carries an adp_sync_status so
-- it can be pushed to ADP once credentials are added under
-- Admin > Connectors > ADP. Until then, approved items sit as 'queued'.
--
-- Approver: the employee's direct supervisor at the time of the
-- request (employees.manager_email, else their Entra manager). Managers
-- see and act on requests through server routes that check this, so
-- the policies below only give employees read access to their own rows.
--
-- Tables are prefixed hr_ (shared Supabase project convention).
-- ============================================================

create table if not exists hr_time_off_requests (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references employees(id) on delete cascade,
  leave_type text not null check (leave_type in ('vacation', 'sick', 'personal')),
  start_date date not null,
  end_date date not null,
  hours numeric(6, 2) not null check (hours > 0),
  note text,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'denied', 'cancelled')),
  approver_email text,
  decided_by uuid references employees(id),
  decided_at timestamptz,
  decision_note text,
  -- not_sent: nothing to send (pending/denied/cancelled)
  -- queued:   approved, waiting for ADP to be connected or retried
  -- sent:     accepted by ADP
  -- error:    ADP rejected it; see adp_error
  adp_sync_status text not null default 'not_sent'
    check (adp_sync_status in ('not_sent', 'queued', 'sent', 'error')),
  adp_synced_at timestamptz,
  adp_error text,
  adp_reference text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_date >= start_date)
);

create index if not exists idx_hr_time_off_employee on hr_time_off_requests (employee_id, start_date desc);
create index if not exists idx_hr_time_off_approver on hr_time_off_requests (lower(approver_email), status);
create index if not exists idx_hr_time_off_dates on hr_time_off_requests (start_date, end_date) where status in ('pending', 'approved');

-- Hours available per leave type. Filled from ADP once connected
-- (source = 'adp'); HR can also enter them by hand (source = 'manual').
create table if not exists hr_time_off_balances (
  employee_id uuid not null references employees(id) on delete cascade,
  leave_type text not null check (leave_type in ('vacation', 'sick', 'personal')),
  hours_available numeric(7, 2) not null,
  as_of timestamptz not null default now(),
  source text not null default 'manual' check (source in ('adp', 'manual')),
  primary key (employee_id, leave_type)
);

-- One row per employee per approved week (week_start is a Monday).
create table if not exists hr_timesheet_approvals (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references employees(id) on delete cascade,
  week_start date not null,
  total_hours numeric(6, 2) not null,
  approved_by uuid references employees(id),
  approved_at timestamptz not null default now(),
  adp_sync_status text not null default 'queued'
    check (adp_sync_status in ('queued', 'sent', 'error')),
  adp_synced_at timestamptz,
  adp_error text,
  unique (employee_id, week_start)
);

create index if not exists idx_hr_timesheet_week on hr_timesheet_approvals (week_start);

-- Which stats show in the green greeting box on the home page (in order).
-- null = the default set.
alter table employee_home_layouts add column if not exists hero_stats text[];

alter table hr_time_off_requests enable row level security;
alter table hr_time_off_balances enable row level security;
alter table hr_timesheet_approvals enable row level security;

drop policy if exists "hr_time_off_requests own read" on hr_time_off_requests;
create policy "hr_time_off_requests own read" on hr_time_off_requests for select using (
  employee_id = (select id from employees where auth_user_id = auth.uid())
);

drop policy if exists "hr_time_off_balances own read" on hr_time_off_balances;
create policy "hr_time_off_balances own read" on hr_time_off_balances for select using (
  employee_id = (select id from employees where auth_user_id = auth.uid())
);

drop policy if exists "hr_timesheet_approvals own read" on hr_timesheet_approvals;
create policy "hr_timesheet_approvals own read" on hr_timesheet_approvals for select using (
  employee_id = (select id from employees where auth_user_id = auth.uid())
);
