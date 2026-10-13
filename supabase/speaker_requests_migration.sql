-- ============================================================
-- Jummah / Speaker Request workflow
--
-- One-time submission by an outreach coordinator (or AM). Routing:
--   Gate 1  - Area Manager (always)
--   Gate 2  - Joint leadership sign-off (region's RD + the configured
--             speaker_leadership_approvers list), ONLY when travel is
--             required AND fee + travel + hotel > $500. Unanimous.
-- On final approval the system auto-fulfills: creates the Finance
-- honorarium ticket (and starts its approval chain), sends the
-- speaker their agreement + W-9 link, notifies the coordinator with
-- a calendar invite. Everything is logged in speaker_request_events.
--
-- All tables are accessed only through server routes using the
-- service-role client, so RLS is enabled with no policies (deny-all
-- for anon/authenticated) - same posture as the token-based approval
-- tables elsewhere in this project.
-- ============================================================

create table if not exists speaker_directory (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  email text,
  phone text,
  w9_on_file boolean not null default false,
  w9_storage_path text,
  w9_received_at timestamptz,
  payee_name text,
  payee_address_line1 text,
  payee_address_line2 text,
  payee_city text,
  payee_state text,
  payee_zip_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists speaker_directory_email_uniq on speaker_directory (lower(email)) where email is not null;

create sequence if not exists speaker_request_number_seq start 1001;

create table if not exists speaker_requests (
  id uuid primary key default gen_random_uuid(),
  request_number text not null unique default ('SR-' || nextval('speaker_request_number_seq')),

  -- Section 1
  coordinator_id uuid references employees(id),
  coordinator_name text not null,
  coordinator_email text not null,
  region text not null,
  office_id uuid references b2s_offices(id),
  area_manager_name text not null,
  area_manager_email text not null,
  event_type text not null check (event_type in ('weekly_jummah', 'special_program')),
  event_type_other text,

  -- Section 2
  travel_required boolean not null,

  -- Branch A / B (shared)
  event_at timestamptz not null,
  event_timezone text not null default 'America/Chicago',
  speaker_id uuid references speaker_directory(id),
  speaker_name text not null,
  speaker_email text,
  speaker_phone text,
  honorarium numeric(12,2) not null check (honorarium >= 0),

  -- Branch B only
  w9_on_file boolean,
  travel_cost numeric(12,2) not null default 0 check (travel_cost >= 0),
  hotel_cost numeric(12,2) not null default 0 check (hotel_cost >= 0),
  justification text,

  total_cost numeric(12,2) generated always as (honorarium + travel_cost + hotel_cost) stored,
  requires_leadership boolean not null default false,

  status text not null default 'pending_am'
    check (status in ('pending_am', 'pending_leadership', 'approved', 'denied', 'cancelled')),
  denied_reason text,
  approved_at timestamptz,

  -- Auto-fulfillment outputs
  finance_ticket_id uuid references finance_tickets(id),
  honorarium_id uuid references finance_honorariums(id),
  speaker_portal_token uuid not null unique default gen_random_uuid(),
  speaker_packet_sent_at timestamptz,
  agreement_signed_at timestamptz,
  agreement_signed_name text,
  agreement_signed_ip text,
  agreement_storage_path text,
  w9_needed boolean not null default false,
  w9_received_at timestamptz,
  last_reminder_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint speaker_requests_branch_b_check check (
    not travel_required or (w9_on_file is not null and justification is not null and length(trim(justification)) > 0)
  ),
  constraint speaker_requests_branch_a_cap check (travel_required or honorarium <= 500)
);
create index if not exists speaker_requests_coordinator_idx on speaker_requests (coordinator_id);
create index if not exists speaker_requests_status_idx on speaker_requests (status);
create index if not exists speaker_requests_am_idx on speaker_requests (lower(area_manager_email));

create table if not exists speaker_request_approvals (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references speaker_requests(id) on delete cascade,
  gate text not null check (gate in ('area_manager', 'leadership')),
  approver_name text not null,
  approver_email text not null,
  approver_role text,
  decision text not null default 'pending' check (decision in ('pending', 'approved', 'denied', 'superseded')),
  notes text,
  approval_token uuid not null unique default gen_random_uuid(),
  decided_at timestamptz,
  reminded_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists speaker_request_approvals_request_idx on speaker_request_approvals (request_id);
create index if not exists speaker_request_approvals_email_idx on speaker_request_approvals (lower(approver_email));

create table if not exists speaker_request_events (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references speaker_requests(id) on delete cascade,
  kind text not null,
  message text not null,
  ok boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists speaker_request_events_request_idx on speaker_request_events (request_id, created_at);

-- Gate 2 approvers (COO, Finance Desk, Executive Director - whoever
-- leadership decides). The region's Regional Director, if one exists
-- in employees, is added automatically on top of this list.
create table if not exists speaker_leadership_approvers (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  email text not null unique,
  role_label text,
  is_active boolean not null default true,
  added_by uuid references employees(id),
  created_at timestamptz not null default now()
);

alter table speaker_directory enable row level security;
alter table speaker_requests enable row level security;
alter table speaker_request_approvals enable row level security;
alter table speaker_request_events enable row level security;
alter table speaker_leadership_approvers enable row level security;

-- Private bucket for signed agreements + W-9s.
insert into storage.buckets (id, name, public)
values ('speaker-documents', 'speaker-documents', false)
on conflict (id) do nothing;

-- ---- Hardening (applied as speaker_requests_hardening) ----
-- W-9 path and payee details live on the REQUEST (not only the shared
-- speaker directory) so one request can never read or overwrite
-- another speaker's paperwork; fulfillment lock prevents a retry
-- racing an in-flight run into duplicate finance tickets.
alter table speaker_requests add column if not exists w9_storage_path text;
alter table speaker_requests add column if not exists fulfillment_locked_at timestamptz;
alter table speaker_requests add column if not exists coordinator_notified_at timestamptz;
alter table speaker_requests add column if not exists payee_name text;
alter table speaker_requests add column if not exists payee_address_line1 text;
alter table speaker_requests add column if not exists payee_address_line2 text;
alter table speaker_requests add column if not exists payee_city text;
alter table speaker_requests add column if not exists payee_state text;
alter table speaker_requests add column if not exists payee_zip_code text;
