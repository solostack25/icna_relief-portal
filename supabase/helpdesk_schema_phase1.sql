-- Helpdesk rebuild, phase 1: core request/leg model + IT detail table.
-- Built in Supabase as a test/dev target; designed to swap onto
-- Dataverse later without touching app code (see lib/helpdesk/*
-- repository layer, added alongside this).
--
-- Model: a "request" is the overall thing someone needs (e.g. "book
-- an event, need a flyer and a landing page"). Each department's
-- piece of that request is a "leg". A leg can hand off to a new leg
-- in another department (Marketing finishes the flyer -> hands off to
-- IT for the website) without losing the connection back to the
-- original request or the leg that sent it. This matches how ICNA's
-- IT/Marketing/HR teams actually work today -- Finance rarely
-- participates in a handoff chain, so nothing here special-cases it.

create type helpdesk_department as enum ('it', 'hr', 'marketing', 'finance');
create type helpdesk_leg_status as enum ('open', 'in_progress', 'on_hold', 'handed_off', 'closed');
create type helpdesk_priority as enum ('low', 'normal', 'high', 'urgent');

-- The overall request, department-agnostic on purpose.
create table helpdesk_requests (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  submitted_by text not null,
  submitted_by_email text not null,
  created_at timestamptz not null default now(),
  -- Derived from legs (open if any leg is open/in_progress/on_hold),
  -- but stored + kept in sync by application code rather than a
  -- trigger, to keep the write path visible in one place (same
  -- reasoning as employees.role being updated by provisioning code,
  -- not a DB trigger, elsewhere in this repo).
  overall_status text not null default 'open' check (overall_status in ('open', 'closed'))
);

-- One row per department's piece of a request. A request starts life
-- as exactly one leg; a handoff creates a new leg pointing back at
-- the leg it came from.
create table helpdesk_request_legs (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references helpdesk_requests(id) on delete cascade,
  department helpdesk_department not null,
  status helpdesk_leg_status not null default 'open',
  priority helpdesk_priority not null default 'normal',
  category text,
  assigned_to_employee_id uuid references employees(id),
  -- The technician name as it appeared in the source system, kept
  -- even when it couldn't be matched to an employees row (e.g. a
  -- SharePoint-import technician who hasn't logged into this portal
  -- yet). Used as a display fallback so historical assignment isn't
  -- silently lost as "Unassigned" -- see the SharePoint import route.
  assigned_to_raw_name text,
  handed_off_from_leg_id uuid references helpdesk_request_legs(id),
  created_at timestamptz not null default now(),
  closed_at timestamptz
);

create index idx_helpdesk_legs_request on helpdesk_request_legs(request_id);
create index idx_helpdesk_legs_department_status on helpdesk_request_legs(department, status);
create index idx_helpdesk_legs_assignee on helpdesk_request_legs(assigned_to_employee_id);

-- IT-specific fields, 1:1 with a leg where department = 'it'.
-- Fields chosen from the actual IT Tickets (HelpDesk v3) SharePoint
-- export -- excludes SharePoint plumbing (Message ID, taskID,
-- LinkTitle, compliance fields, etc.) that has no equivalent meaning
-- here.
create table helpdesk_leg_details_it (
  leg_id uuid primary key references helpdesk_request_legs(id) on delete cascade,
  additional_notes text,
  approval_required boolean not null default false,
  supervisor_approved boolean not null default false,
  coo_approved boolean not null default false,
  supervisor_name text,
  date_of_approval timestamptz,
  office_id uuid references b2s_offices(id),
  grant_name text,
  solution text
);

-- Attachments and comments are shared across every department --
-- same shape whether it's a flyer proof from Marketing or a screenshot
-- from IT. Stored in Supabase Storage; this table just tracks metadata.
create table helpdesk_attachments (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references helpdesk_requests(id) on delete cascade,
  leg_id uuid references helpdesk_request_legs(id) on delete cascade,
  uploaded_by_employee_id uuid references employees(id),
  file_name text not null,
  storage_path text not null,
  uploaded_at timestamptz not null default now()
);

create table helpdesk_comments (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references helpdesk_requests(id) on delete cascade,
  leg_id uuid references helpdesk_request_legs(id) on delete cascade,
  author_employee_id uuid references employees(id),
  body text not null,
  created_at timestamptz not null default now()
);

comment on table helpdesk_requests is 'Overall request, department-agnostic. See helpdesk_request_legs for per-department work.';
comment on table helpdesk_request_legs is 'One row per department''s involvement in a request. handed_off_from_leg_id chains a transfer back to the leg that created it.';
comment on column helpdesk_request_legs.handed_off_from_leg_id is 'Set when this leg was created by a handoff from another department''s leg, e.g. Marketing finishing a flyer and handing the same request to IT for the website.';

alter table helpdesk_requests enable row level security;
alter table helpdesk_request_legs enable row level security;
alter table helpdesk_leg_details_it enable row level security;
alter table helpdesk_attachments enable row level security;
alter table helpdesk_comments enable row level security;

-- Same pattern as fate_submissions / drs_submissions: any signed-in
-- employee can read and write. Department-level access restriction
-- (e.g. only IT staff closing IT legs) is enforced in application
-- code for now, not RLS -- matches how the rest of this portal
-- handles role checks (see employee.role checks in select-app,
-- admin routes) rather than mixing the two approaches.
create policy "authenticated staff manage helpdesk_requests" on helpdesk_requests
  for all using (auth.role() = 'authenticated');
create policy "authenticated staff manage helpdesk_request_legs" on helpdesk_request_legs
  for all using (auth.role() = 'authenticated');
create policy "authenticated staff manage helpdesk_leg_details_it" on helpdesk_leg_details_it
  for all using (auth.role() = 'authenticated');
create policy "authenticated staff manage helpdesk_attachments" on helpdesk_attachments
  for all using (auth.role() = 'authenticated');
create policy "authenticated staff manage helpdesk_comments" on helpdesk_comments
  for all using (auth.role() = 'authenticated');

-- Register in the launcher, same as every other app.
insert into app_registry (slug, display_name, route, sort_order) values
  ('helpdesk', 'Help Desk', '/helpdesk', 5);

