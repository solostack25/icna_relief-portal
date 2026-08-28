-- ============================================================
-- Report Engine core schema
-- Reuses the existing scoping helpers (my_assigned_office,
-- is_regional_director_for, is_program_director_for, is_admin)
-- from regional_program_director_migration.sql rather than
-- inventing a new access model. A "report" here is just a saved
-- module + filters + dimensions + metrics spec; the actual query
-- is built and scoped server-side in lib/reports/registry.ts +
-- app/api/reports/run, NOT via a generic dynamic-SQL function,
-- since several module tables (hp_intakes, th_intakes) don't
-- carry office_id directly and need an explicit join to clients.
-- ============================================================

create table report_definitions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references employees(id) on delete cascade,
  module_slug text not null,               -- key into REPORT_MODULES registry, e.g. 'hunger-prevention'
  name text not null,
  description text,
  filters jsonb not null default '{}',     -- { date_range, office_ids, region, program, ... }
  dimensions text[] not null default '{}', -- group-by columns, whitelisted per module
  metrics text[] not null default '{}',    -- aggregations, whitelisted per module
  visibility text not null default 'private' check (visibility in ('private', 'shared_role', 'shared_all')),
  shared_with_roles text[] not null default '{}',  -- e.g. {'regional_director','admin'} when visibility = 'shared_role'
  schedule text check (schedule in (null, 'daily', 'weekly', 'monthly')),
  schedule_recipients text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_report_definitions_owner on report_definitions (owner_id);
create index idx_report_definitions_module on report_definitions (module_slug);

create table report_runs (
  id uuid primary key default gen_random_uuid(),
  definition_id uuid not null references report_definitions(id) on delete cascade,
  run_by uuid references employees(id),
  params jsonb not null default '{}',   -- effective filters at run time (definition filters + any override)
  row_count int,
  result jsonb,                          -- cached result set; nullable once we add file export/storage
  export_path text,                      -- Supabase Storage path if exported to PDF/XLSX
  generated_at timestamptz not null default now()
);

create index idx_report_runs_definition on report_runs (definition_id, generated_at desc);

-- ============================================================
-- RLS
-- ============================================================
alter table report_definitions enable row level security;
alter table report_runs enable row level security;

-- Owners always see/manage their own report definitions.
create policy "report_definitions owner full access" on report_definitions
  for all using (
    owner_id = (select id from employees where auth_user_id = auth.uid())
  );

-- A report shared with specific roles is visible (read-only) to
-- employees whose own role is in shared_with_roles, or to anyone
-- when visibility = 'shared_all'. Admins always see everything.
create policy "report_definitions shared read" on report_definitions
  for select using (
    is_admin()
    or visibility = 'shared_all'
    or (
      visibility = 'shared_role'
      and exists (
        select 1 from employees e
        where e.auth_user_id = auth.uid()
        and e.role = any(shared_with_roles)
      )
    )
  );

create policy "report_definitions admin full access" on report_definitions
  for all using (is_admin());

-- report_runs follow the same visibility as their parent definition.
create policy "report_runs via definition" on report_runs
  for select using (
    exists (
      select 1 from report_definitions d
      where d.id = report_runs.definition_id
      and (
        d.owner_id = (select id from employees where auth_user_id = auth.uid())
        or is_admin()
        or d.visibility = 'shared_all'
        or (d.visibility = 'shared_role' and exists (
          select 1 from employees e where e.auth_user_id = auth.uid() and e.role = any(d.shared_with_roles)
        ))
      )
    )
  );

create policy "report_runs insert own" on report_runs
  for insert with check (
    run_by = (select id from employees where auth_user_id = auth.uid())
  );

create policy "report_runs admin full access" on report_runs
  for all using (is_admin());
