-- ============================================================
-- IRFAS / Zakat financial assistance applications
-- ============================================================
-- Case managers submit a financial assistance (zakat) request on
-- behalf of an applicant. Every currently-active approver must sign
-- off (unanimous, per Travis) before it moves to Approved; once
-- approved, it lands in the Approved Applications queue so Finance
-- can see it and cut a check.
--
-- Field set below is a reasonable starting point, NOT copied from a
-- real IRFAS export (none was available to build against) - the one
-- confirmed-real field is amount_approved (from Master Cleaner's
-- IRFAS reports, "AMOUNT APPROVED"). Flag to Travis: once a real
-- IRFAS report/form is available, this should get a field-accuracy
-- pass rather than staying as-is.

create table zakat_applications (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references clients(id),
  office_id uuid not null references b2s_offices(id),
  case_manager_id uuid not null references employees(id),

  applicant_name text not null,
  applicant_phone text,
  applicant_address text,
  household_size integer,

  -- Free text with UI-suggested common values rather than a rigid
  -- enum - real IRFAS assistance categories weren't available to
  -- confirm, and a free field never blocks an edge-case request.
  category text not null,
  amount_requested numeric(10, 2) not null,
  amount_approved numeric(10, 2),
  reason text,

  -- The check isn't always payable to the applicant (e.g. paid
  -- directly to a landlord or utility company) - kept separate from
  -- applicant_name/address so Finance always knows exactly who/where
  -- to make it out to, regardless of who the assistance is for.
  payee_name text,
  payee_address text,

  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'paid')),
  submitted_by uuid not null references employees(id),
  submitted_at timestamptz not null default now(),
  decided_at timestamptz,

  check_number text,
  paid_at timestamptz,
  paid_by uuid references employees(id),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_zakat_applications_office on zakat_applications(office_id);
create index idx_zakat_applications_status on zakat_applications(status, submitted_at desc);
create index idx_zakat_applications_case_manager on zakat_applications(case_manager_id);

-- Configured in Admin -> Connectors, same idea as CioApproversManager
-- but a standalone email list rather than requiring the approver to
-- already be a portal employee - IRFAS approvers may be board members
-- or other stakeholders without portal accounts.
create table zakat_approvers (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  email text not null unique,
  is_active boolean not null default true,
  added_by uuid references employees(id),
  created_at timestamptz not null default now()
);

-- One row per approver who needed to sign off on a given application -
-- a snapshot taken at submission time of who was active then, so
-- later changes to zakat_approvers never rewrite an application's
-- own history. This is also what "all must approve" checks against:
-- approved when every row for an application is 'approved'.
create table zakat_application_approvals (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references zakat_applications(id) on delete cascade,
  approver_email text not null,
  approver_name text not null,
  decision text not null default 'pending' check (decision in ('pending', 'approved', 'rejected')),
  notes text,
  decided_at timestamptz,
  approval_token uuid not null default gen_random_uuid(),
  created_at timestamptz not null default now()
);

create unique index idx_zakat_approvals_token on zakat_application_approvals(approval_token);
create index idx_zakat_approvals_application on zakat_application_approvals(application_id);

alter table zakat_applications enable row level security;
alter table zakat_approvers enable row level security;
alter table zakat_application_approvals enable row level security;

-- Case managers see/create their own submissions and whatever's in
-- their own office; admins and finance-flagged employees see
-- everything. Reuses is_admin() from regional_program_director_migration.sql.
create policy "zakat_applications own or office" on zakat_applications
  for select using (
    submitted_by = (select id from employees where auth_user_id = auth.uid())
    or office_id = (select assigned_office_id from employees where auth_user_id = auth.uid())
    or is_admin()
    or (select is_zakat_finance from employees where auth_user_id = auth.uid()) = true
  );

create policy "zakat_applications case managers create" on zakat_applications
  for insert with check (
    submitted_by = (select id from employees where auth_user_id = auth.uid())
  );

create policy "zakat_applications admin full access" on zakat_applications
  for all using (is_admin());

create policy "zakat_approvers admin only" on zakat_approvers for all using (is_admin());

-- The approvals table has no employee-facing read policy at all -
-- decisions are made exclusively through the token link (service-role
-- API route), same as finance_approval_steps. Admins can still see
-- the audit trail.
create policy "zakat_application_approvals admin read" on zakat_application_approvals for select using (is_admin());

-- Lets a specific employee (e.g. a Finance team lead without a full
-- admin role) see the Approved Applications queue without granting
-- them admin access to everything else in the portal.
alter table employees add column if not exists is_zakat_finance boolean not null default false;
