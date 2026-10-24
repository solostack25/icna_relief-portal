-- ============================================================
-- Office Dashboard -> Employees
--
-- An office's Employees page (area manager, the region's regional
-- director, HR and admins) lists the people in that office - from
-- Microsoft 365 (each person's Office field) plus anyone assigned to
-- the office in the portal. Each person's profile shows what the
-- organisation has given them: open tickets, devices (model only),
-- vehicles they're a driver on, PEX card, office keys. From there:
--   * keys are assigned / returned against the office's key inventory
--   * Offboard opens an HR ticket and an IT ticket listing every asset
--     to collect, and disables their Microsoft 365 sign-in right away
--   * "New employee" on the list sends HR an onboarding request ticket
-- Every table here is read/written through server routes only.
-- ============================================================

-- Microsoft 365 "Office" values that belong to this portal office, for
-- when they aren't spelled exactly like field_office.
alter table b2s_offices add column if not exists entra_office_names text[] not null default '{}';

create table if not exists office_keys (
  id uuid primary key default gen_random_uuid(),
  office_id uuid not null references b2s_offices(id) on delete cascade,
  label text not null check (length(trim(label)) > 0),       -- "Front door", "Storage room"
  key_code text,                                             -- the number stamped on it
  notes text,
  status text not null default 'active' check (status in ('active', 'lost', 'retired')),
  created_by uuid references employees(id),
  created_at timestamptz not null default now()
);
create index if not exists idx_office_keys_office on office_keys (office_id);
alter table office_keys enable row level security;

create table if not exists office_key_assignments (
  id uuid primary key default gen_random_uuid(),
  key_id uuid not null references office_keys(id) on delete cascade,
  office_id uuid not null references b2s_offices(id) on delete cascade,
  holder_email text not null,
  holder_name text,
  holder_entra_id text,
  assigned_by uuid references employees(id),
  assigned_at timestamptz not null default now(),
  returned_at timestamptz,
  returned_by uuid references employees(id),
  return_note text
);
-- A key is held by one person at a time.
create unique index if not exists office_key_one_holder on office_key_assignments (key_id) where returned_at is null;
create index if not exists idx_office_key_holder on office_key_assignments (lower(holder_email)) where returned_at is null;
alter table office_key_assignments enable row level security;

create table if not exists employee_offboardings (
  id uuid primary key default gen_random_uuid(),
  office_id uuid references b2s_offices(id) on delete set null,
  entra_user_id text,
  email text not null,
  full_name text,
  last_day date,
  notes text,
  assets jsonb not null default '{}',          -- snapshot of what they had when offboarding started
  requested_by uuid references employees(id),
  hr_request_id uuid references helpdesk_requests(id) on delete set null,
  it_request_id uuid references helpdesk_requests(id) on delete set null,
  signin_disabled_at timestamptz,
  signin_error text,
  portal_disabled_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists idx_offboardings_email on employee_offboardings (lower(email));
alter table employee_offboardings enable row level security;

create table if not exists employee_onboarding_requests (
  id uuid primary key default gen_random_uuid(),
  office_id uuid not null references b2s_offices(id) on delete cascade,
  full_name text not null,
  job_title text,
  start_date date,
  details jsonb not null default '{}',
  requested_by uuid references employees(id),
  hr_request_id uuid references helpdesk_requests(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists idx_onboarding_requests_office on employee_onboarding_requests (office_id, created_at desc);
alter table employee_onboarding_requests enable row level security;
