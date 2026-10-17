-- ============================================================
-- Refugee Services & Community Empowerment (RSCE) case management
-- ------------------------------------------------------------
-- Built on the unified client intake: the client record already holds
-- office, country of birth/citizenship, ethnicity, residency status,
-- address and household. These tables add what the Master Cleaner's
-- Refugee Services report needed from the old Salesforce "Case
-- Management" and "Bulk" exports:
--
--   rsce_cases               one case per client (case manager, status, arrival, referral)
--   rsce_service_types       editable list of services + optional default $ value
--   rsce_services            each service delivered (date, type, value, beneficiaries)
--   bulk_distributions       bulk events (people served, value) — program-tagged
--                            so Hunger Prevention can reuse it later
--
-- Replaces the free-text "Log RSCE Assistance" notes on the client profile
-- (client_service_log rows with program_slug = 'rsce' are copied in below).
--
-- Already applied directly to the live Supabase project.
-- ============================================================

-- ---------- Cases ----------
create table if not exists rsce_cases (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  office_id uuid references b2s_offices(id),
  case_manager_id uuid references employees(id),
  status text not null default 'open' check (status in ('open', 'closed')),
  opened_on date not null default current_date,
  closed_on date,
  closed_reason text,
  arrival_date date,           -- date of arrival in the US
  referral_source text,        -- e.g. resettlement agency, self, mosque, school
  notes text,
  created_by uuid references employees(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists rsce_cases_one_open_per_client on rsce_cases (client_id) where status = 'open';
create index if not exists idx_rsce_cases_office on rsce_cases (office_id, status);
create index if not exists idx_rsce_cases_manager on rsce_cases (case_manager_id) where status = 'open';

-- ---------- Service types ----------
create table if not exists rsce_service_types (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  category text,
  default_value numeric(10,2),     -- pre-fills the value when logging; staff can override
  is_active boolean not null default true,
  sort_order int not null default 100,
  created_at timestamptz not null default now()
);

insert into rsce_service_types (name, category, sort_order) values
  ('Case Management / Intake Assessment', 'Case Management', 10),
  ('Rent / Housing Assistance', 'Housing', 20),
  ('Housing Search & Placement', 'Housing', 21),
  ('Furniture & Household Items', 'Housing', 22),
  ('Utility Assistance', 'Housing', 23),
  ('Food Assistance', 'Basic Needs', 30),
  ('Clothing', 'Basic Needs', 31),
  ('Transportation', 'Basic Needs', 32),
  ('Employment Services / Job Placement', 'Employment', 40),
  ('Resume & Interview Prep', 'Employment', 41),
  ('ESL / English Classes', 'Education', 50),
  ('School Enrollment', 'Education', 51),
  ('Citizenship / Civics Classes', 'Education', 52),
  ('Benefits Enrollment (SNAP, Medicaid, etc.)', 'Benefits', 60),
  ('Document Assistance (ID, SSN, applications)', 'Benefits', 61),
  ('Immigration Legal Referral', 'Legal', 70),
  ('Medical / Health Navigation', 'Health', 80),
  ('Mental Health Referral', 'Health', 81),
  ('Interpretation / Translation', 'Support', 90),
  ('Cultural Orientation', 'Support', 91),
  ('Financial Literacy', 'Support', 92),
  ('Other', 'Other', 999)
on conflict (name) do nothing;

-- ---------- Services delivered ----------
create table if not exists rsce_services (
  id uuid primary key default gen_random_uuid(),
  case_id uuid references rsce_cases(id) on delete set null,
  client_id uuid not null references clients(id) on delete cascade,
  office_id uuid references b2s_offices(id),
  service_type_id uuid references rsce_service_types(id),
  service_name text not null,            -- snapshot, so renaming a type never rewrites history
  delivered_on date not null default current_date,
  value numeric(10,2) not null default 0 check (value >= 0),
  beneficiaries int not null default 1 check (beneficiaries >= 0),
  notes text,
  employee_id uuid references employees(id),
  legacy_service_log_id uuid unique,     -- copied from client_service_log
  salesforce_synced boolean not null default false,
  salesforce_record_id text,
  created_at timestamptz not null default now()
);

create index if not exists idx_rsce_services_client on rsce_services (client_id, delivered_on desc);
create index if not exists idx_rsce_services_office_date on rsce_services (office_id, delivered_on);

-- ---------- Bulk distributions (any program) ----------
create table if not exists bulk_distributions (
  id uuid primary key default gen_random_uuid(),
  office_id uuid not null references b2s_offices(id),
  program text not null check (program in (
    'Refugee Services & Community Empowerment', 'Hunger Prevention', 'Back2School',
    'Disaster Relief Services', 'Muslim Family Services', 'Health Services', 'General'
  )),
  name text not null,                    -- "Bulk Household Items", "Winter Coat Drive"
  distributed_on date not null default current_date,
  people_served int not null default 0 check (people_served >= 0),
  households_served int check (households_served >= 0),
  total_value numeric(12,2) check (total_value >= 0),
  items_description text,
  location text,
  notes text,
  created_by uuid references employees(id),
  created_at timestamptz not null default now()
);

create index if not exists idx_bulk_distributions_office on bulk_distributions (office_id, program, distributed_on);

-- ============================================================
-- RLS — same office scoping as clients
-- ============================================================
alter table rsce_cases enable row level security;
alter table rsce_service_types enable row level security;
alter table rsce_services enable row level security;
alter table bulk_distributions enable row level security;

create policy "rsce cases admin all" on rsce_cases for all using (is_admin());
create policy "rsce cases staff own office" on rsce_cases for all
  using (office_id = my_assigned_office()) with check (office_id = my_assigned_office());
create policy "rsce cases regional director select" on rsce_cases for select using (
  exists (select 1 from b2s_offices o where o.id = rsce_cases.office_id and is_regional_director_for(o.region)));

create policy "rsce services admin all" on rsce_services for all using (is_admin());
create policy "rsce services staff own office" on rsce_services for all
  using (office_id = my_assigned_office()) with check (office_id = my_assigned_office());
create policy "rsce services regional director select" on rsce_services for select using (
  exists (select 1 from b2s_offices o where o.id = rsce_services.office_id and is_regional_director_for(o.region)));

create policy "rsce service types read" on rsce_service_types for select using (auth.role() = 'authenticated');
create policy "rsce service types admin write" on rsce_service_types for all using (is_admin());

create policy "bulk admin all" on bulk_distributions for all using (is_admin());
create policy "bulk staff own office" on bulk_distributions for all
  using (office_id = my_assigned_office()) with check (office_id = my_assigned_office());
create policy "bulk regional director select" on bulk_distributions for select using (
  exists (select 1 from b2s_offices o where o.id = bulk_distributions.office_id and is_regional_director_for(o.region)));

revoke all on rsce_cases, rsce_service_types, rsce_services, bulk_distributions from anon;

-- ============================================================
-- App launcher tile (access granted per employee via employee_program_access)
-- ============================================================
insert into app_registry (slug, display_name, route, is_active, sort_order)
values ('refugee-services', 'Refugee Services', '/refugee-services', true, 4)
on conflict (slug) do nothing;

-- ============================================================
-- Carry over the old free-text RSCE log entries
-- ============================================================
insert into rsce_services (client_id, office_id, service_type_id, service_name, delivered_on, value, beneficiaries,
                           notes, employee_id, legacy_service_log_id, created_at)
select l.client_id, c.office_id, t.id, 'Other', (l.created_at at time zone 'America/Chicago')::date, 0, 1,
       l.notes, l.employee_id, l.id, l.created_at
from client_service_log l
join clients c on c.id = l.client_id
left join rsce_service_types t on t.name = 'Other'
where l.program_slug = 'rsce'
on conflict (legacy_service_log_id) do nothing;
