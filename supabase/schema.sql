-- ============================================================
-- ICNA Relief Portal - Core Schema
-- One shared client registry across all programs (TH, HP, BTS, etc.)
-- ============================================================

-- ---------- APP REGISTRY ----------
-- Admin-managed list of "apps"/programs that live inside the portal
create table app_registry (
  slug text primary key,              -- e.g. 'transitional-housing'
  display_name text not null,         -- e.g. 'Transitional Housing'
  icon text,                          -- optional icon name/emoji
  route text not null,                -- e.g. '/transitional-housing'
  is_active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

-- ---------- EMPLOYEES ----------
create table employees (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique not null references auth.users(id) on delete cascade,
  first_name text not null,
  last_name text not null,
  email text unique not null,
  role text not null default 'staff' check (role in ('staff', 'admin')),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- ---------- EMPLOYEE <-> PROGRAM ACCESS ----------
create table employee_program_access (
  employee_id uuid not null references employees(id) on delete cascade,
  program_slug text not null references app_registry(slug) on delete cascade,
  granted_at timestamptz not null default now(),
  primary key (employee_id, program_slug)
);

-- ---------- MASTER CLIENT REGISTRY ----------
-- One row per real person, shared across every program
create table clients (
  id uuid primary key default gen_random_uuid(),
  first_name text not null,
  last_name text not null,
  dob date,
  phone text,
  email text,
  address_line1 text,
  address_line2 text,
  city text,
  state text default 'TX',
  zip text,
  salesforce_contact_id text,
  legacy_client_id text,          -- ID from the pre-migration client system (format TBD)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_clients_phone on clients (phone);
create index idx_clients_name on clients (last_name, first_name);
create index idx_clients_dob on clients (dob);
create unique index idx_clients_legacy_id on clients (legacy_client_id) where legacy_client_id is not null;

-- ---------- CLIENT NUMBER (human-readable ID, assigned once, permanent) ----------
create sequence client_number_seq start 1;

alter table clients add column client_number text unique;

create or replace function assign_client_number()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.client_number is null then
    new.client_number := 'ICNA-' || lpad(nextval('client_number_seq')::text, 6, '0');
  end if;
  return new;
end;
$$;

create trigger trg_assign_client_number
  before insert on clients
  for each row execute function assign_client_number();

-- ---------- HOUSEHOLD MEMBERS (replaces static age-bucket counts) ----------
-- Age is computed at query time from dob, never re-entered, never goes stale
create table household_members (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  first_name text not null,
  last_name text,
  dob date not null,
  relationship text,   -- e.g. 'spouse', 'child', 'dependent', 'other'
  created_at timestamptz not null default now()
);

create index idx_household_members_client on household_members (client_id);

-- ---------- CLIENT ID CARDS (QR/barcode based, reissuable) ----------
-- card_number is a random opaque code, NOT client_number, so a scanned/lost
-- card can't be used to enumerate or guess other client records
create table client_id_cards (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  card_number text unique not null default encode(gen_random_bytes(12), 'hex'),
  issued_at timestamptz not null default now(),
  issued_by uuid references employees(id),
  is_active boolean not null default true
);

create index idx_client_id_cards_client on client_id_cards (client_id);
create index idx_client_id_cards_card_number on client_id_cards (card_number);

-- ---------- CLIENT <-> PROGRAM ENROLLMENT ----------
-- Tracks which programs a client has ever touched
create table client_programs (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  program_slug text not null references app_registry(slug),
  status text not null default 'active' check (status in ('active', 'inactive', 'completed')),
  enrolled_at timestamptz not null default now(),
  unique (client_id, program_slug)
);

-- ---------- HUNGER PREVENTION INTAKE (first program module built) ----------
create table hp_intakes (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  employee_id uuid references employees(id),
  pantry_location text,
  photo_id_number text,
  id_type text,
  monthly_income numeric(10,2),
  food_stamps_amount numeric(10,2),
  dietary_preference text,
  ethnicity text,
  country_of_origin text,
  ticket_number text,
  visit_timeslot timestamptz,
  household_size_snapshot int,  -- count of household_members at time of this visit, for historical reporting
  intake_data jsonb not null default '{}',  -- overflow for any field not yet modeled explicitly
  salesforce_synced boolean not null default false,
  salesforce_case_id text,
  created_at timestamptz not null default now()
);

create index idx_hp_intakes_client on hp_intakes (client_id);

-- ---------- TRANSITIONAL HOUSING INTAKE (built later, no legacy data to migrate) ----------
create table th_intakes (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  invoice_number text unique,            -- format TXHOU-MMDDYYYY-001, if TH keeps this pattern
  employee_id uuid references employees(id),
  signature_url text,
  intake_data jsonb not null default '{}',
  salesforce_synced boolean not null default false,
  salesforce_case_id text,
  created_at timestamptz not null default now()
);

create index idx_th_intakes_client on th_intakes (client_id);

-- ============================================================
-- RLS
-- ============================================================

-- Helper function: checks if the current auth user is an admin employee.
-- security definer bypasses RLS internally, avoiding infinite recursion
-- that would occur if an "employees" policy queried "employees" directly.
create or replace function is_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from employees
    where auth_user_id = auth.uid() and role = 'admin'
  );
$$;

alter table employees enable row level security;
alter table employee_program_access enable row level security;
alter table app_registry enable row level security;
alter table clients enable row level security;
alter table client_programs enable row level security;
alter table th_intakes enable row level security;
alter table hp_intakes enable row level security;
alter table household_members enable row level security;
alter table client_id_cards enable row level security;

-- Employees can read their own row; admins can read/write all
create policy "employees read own" on employees
  for select using (auth_user_id = auth.uid());

create policy "admins manage employees" on employees
  for all using (is_admin());

-- Any authenticated employee can read the active app registry
create policy "employees read app registry" on app_registry
  for select using (auth.role() = 'authenticated');

create policy "admins manage app registry" on app_registry
  for all using (is_admin());

-- Employees see their own access rows; admins manage all
create policy "employees read own access" on employee_program_access
  for select using (
    exists (
      select 1 from employees e
      where e.id = employee_program_access.employee_id
      and e.auth_user_id = auth.uid()
    )
  );

create policy "admins manage access" on employee_program_access
  for all using (is_admin());

-- Clients & program tables: any authenticated employee with access to
-- ANY program can read/write clients (client registry is shared by design).
-- Tighten later per-program if ICNA wants stricter separation.
create policy "authenticated staff manage clients" on clients
  for all using (auth.role() = 'authenticated');

create policy "authenticated staff manage client_programs" on client_programs
  for all using (auth.role() = 'authenticated');

create policy "authenticated staff manage th_intakes" on th_intakes
  for all using (auth.role() = 'authenticated');

create policy "authenticated staff manage hp_intakes" on hp_intakes
  for all using (auth.role() = 'authenticated');

create policy "authenticated staff manage household_members" on household_members
  for all using (auth.role() = 'authenticated');

create policy "authenticated staff manage client_id_cards" on client_id_cards
  for all using (auth.role() = 'authenticated');

-- ============================================================
-- Seed initial app registry
-- ============================================================
insert into app_registry (slug, display_name, route, sort_order) values
  ('hunger-prevention', 'Hunger Prevention', '/hunger-prevention', 1),
  ('transitional-housing', 'Transitional Housing', '/transitional-housing', 2),
  ('back-to-school', 'Back to School', '/back-to-school', 3);
-- B2S module lives in a separate migration file: supabase/b2s_migration.sql
