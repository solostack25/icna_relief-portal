-- ============================================================
-- Device Management (Entra ID + Intune via Microsoft Graph)
--
-- A nightly (and on-demand) sync copies the tenant's devices, users'
-- licenses and the license catalog into these tables so the portal
-- can list, filter and report without hitting Graph on every page.
-- Secrets (BitLocker recovery keys, LAPS passwords) are NEVER stored:
-- they're fetched live from Graph when an IT person asks, and each
-- view is logged in it_device_audit.
--
--   it_devices               one row per device (Entra + Intune merged)
--   it_directory_users       Entra users with their licenses (coverage)
--   it_license_skus          the tenant's license catalog + seat counts
--   it_device_sync_runs      each sync: counts + per-source errors
--   it_device_action_requests wipe/retire need a second IT person
--   it_device_audit          every secret viewed and action taken
--
-- Access: IT only (portal admin or the helpdesk-it grant). All reads
-- and writes go through server routes using the service-role client,
-- so RLS is on with no policies (deny-all for anon/authenticated).
-- ============================================================

create table if not exists it_devices (
  -- Entra deviceId (GUID) when known; "intune:<id>" for an Intune
  -- record with no Entra device behind it.
  device_key text primary key,
  entra_object_id text,
  entra_device_id text,
  display_name text,
  operating_system text,
  os_version text,
  trust_type text,             -- AzureAd (joined) | ServerAd (hybrid) | Workplace (registered/personal)
  profile_type text,
  account_enabled boolean,
  entra_is_managed boolean,
  entra_is_compliant boolean,
  approx_last_sign_in timestamptz,
  registered_at timestamptz,
  owner_entra_user_id text,
  owner_upn text,
  owner_name text,
  employee_id uuid references employees(id) on delete set null,

  intune_id text,
  serial_number text,
  manufacturer text,
  model text,
  compliance_state text,       -- compliant | noncompliant | inGracePeriod | unknown ...
  is_encrypted boolean,
  intune_last_sync timestamptz,
  enrolled_at timestamptz,
  management_agent text,
  ownership text,              -- company | personal | unknown
  primary_user_upn text,
  total_storage_bytes bigint,
  free_storage_bytes bigint,

  -- intune | licensed_not_enrolled | unlicensed | personal | no_owner
  coverage text not null default 'no_owner',
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  removed_at timestamptz,      -- no longer returned by Graph
  synced_at timestamptz not null default now()
);
create index if not exists it_devices_owner on it_devices (lower(owner_upn));
create index if not exists it_devices_employee on it_devices (employee_id);
create index if not exists it_devices_coverage on it_devices (coverage) where removed_at is null;
create unique index if not exists it_devices_intune_uniq on it_devices (intune_id) where intune_id is not null;

create table if not exists it_directory_users (
  entra_user_id text primary key,
  upn text not null,
  display_name text,
  account_enabled boolean,
  sku_ids text[] not null default '{}',
  has_intune boolean not null default false,
  last_sign_in timestamptz,
  employee_id uuid references employees(id) on delete set null,
  synced_at timestamptz not null default now()
);
create index if not exists it_directory_users_upn on it_directory_users (lower(upn));

create table if not exists it_license_skus (
  sku_id text primary key,
  sku_part_number text not null,
  friendly_name text,
  enabled_units int not null default 0,
  consumed_units int not null default 0,
  includes_intune boolean not null default false,
  includes_entra_p1 boolean not null default false,
  synced_at timestamptz not null default now()
);

create table if not exists it_device_sync_runs (
  id uuid primary key default gen_random_uuid(),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  trigger text not null default 'cron',  -- cron | manual
  triggered_by uuid references employees(id),
  status text not null default 'running' check (status in ('running', 'ok', 'partial', 'failed')),
  counts jsonb,
  errors jsonb   -- { source: message } e.g. { "intune": "403 ... missing permission" }
);

create table if not exists it_device_action_requests (
  id uuid primary key default gen_random_uuid(),
  device_key text not null references it_devices(device_key) on delete cascade,
  action text not null check (action in ('wipe', 'retire')),
  reason text not null,
  ticket_ref text,
  requested_by uuid not null references employees(id),
  requested_at timestamptz not null default now(),
  status text not null default 'pending' check (status in ('pending', 'approved', 'denied', 'executed', 'failed', 'cancelled')),
  decided_by uuid references employees(id),
  decided_at timestamptz,
  decision_note text,
  executed_at timestamptz,
  error text
);
create index if not exists it_device_action_requests_status on it_device_action_requests (status, requested_at desc);
-- One open request per device and action.
create unique index if not exists it_device_action_requests_one_open
  on it_device_action_requests (device_key, action) where status = 'pending';

create table if not exists it_device_audit (
  id uuid primary key default gen_random_uuid(),
  device_key text,
  device_name text,
  action text not null,
  actor_id uuid references employees(id),
  reason text,
  ticket_ref text,
  ok boolean not null default true,
  detail jsonb,
  created_at timestamptz not null default now()
);
create index if not exists it_device_audit_device on it_device_audit (device_key, created_at desc);
create index if not exists it_device_audit_created on it_device_audit (created_at desc);

alter table it_devices enable row level security;
alter table it_directory_users enable row level security;
alter table it_license_skus enable row level security;
alter table it_device_sync_runs enable row level security;
alter table it_device_action_requests enable row level security;
alter table it_device_audit enable row level security;
