-- ============================================================
-- Security center (Microsoft Defender / Entra ID Protection / Secure Score)
--
-- A nightly (and on-demand) sync copies security data from Microsoft
-- Graph so the portal can show it without calling Graph on every page:
--   sec_secure_scores    daily Secure Score (tenant)
--   sec_score_controls   Secure Score recommendations + current points
--   sec_incidents        Defender XDR incidents (last 90 days + all open)
--   sec_mfa_registration who has MFA / which methods (Entra)
--   sec_risky_users      Entra ID Protection at-risk users
--   sec_sync_runs        each sync: counts + per-source errors
-- it_devices gains Defender for Endpoint columns (onboarding, exposure,
-- vulnerability counts) from advanced hunting.
--
-- IT only; read through server routes with the service-role client, so
-- RLS is on with no policies. Run after device_management_migration.sql.
-- ============================================================

create table if not exists sec_secure_scores (
  id text primary key,
  created_at timestamptz not null,
  current_score numeric(8, 2) not null,
  max_score numeric(8, 2) not null,
  licensed_users int,
  active_users int,
  comparative jsonb,
  synced_at timestamptz not null default now()
);
create index if not exists sec_secure_scores_created on sec_secure_scores (created_at desc);

create table if not exists sec_score_controls (
  id text primary key,
  title text not null,
  category text,
  service text,
  max_score numeric(8, 2),
  current_score numeric(8, 2),
  implementation_status text,
  implementation_cost text,
  user_impact text,
  tier text,
  threats text[],
  remediation text,
  remediation_impact text,
  action_url text,
  rank int,
  deprecated boolean not null default false,
  synced_at timestamptz not null default now()
);

create table if not exists sec_incidents (
  id text primary key,
  display_name text,
  severity text,
  status text,
  classification text,
  determination text,
  assigned_to text,
  created_at timestamptz,
  last_update_at timestamptz,
  web_url text,
  alert_count int not null default 0,
  alert_titles text[] not null default '{}',
  devices text[] not null default '{}',
  users text[] not null default '{}',
  service_sources text[] not null default '{}',
  synced_at timestamptz not null default now()
);
create index if not exists sec_incidents_status on sec_incidents (status, last_update_at desc);

create table if not exists sec_mfa_registration (
  user_id text primary key,
  upn text not null,
  display_name text,
  is_admin boolean,
  is_mfa_registered boolean,
  is_mfa_capable boolean,
  is_passwordless_capable boolean,
  is_sspr_registered boolean,
  methods text[] not null default '{}',
  default_method text,
  user_type text,
  last_updated_at timestamptz,
  synced_at timestamptz not null default now()
);
create index if not exists sec_mfa_upn on sec_mfa_registration (lower(upn));

create table if not exists sec_risky_users (
  user_id text primary key,
  upn text,
  display_name text,
  risk_level text,
  risk_state text,
  risk_detail text,
  last_updated_at timestamptz,
  synced_at timestamptz not null default now()
);

create table if not exists sec_sync_runs (
  id uuid primary key default gen_random_uuid(),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  trigger text not null default 'cron',
  triggered_by uuid references employees(id),
  status text not null default 'running' check (status in ('running', 'ok', 'partial', 'failed')),
  counts jsonb,
  errors jsonb
);

alter table it_devices add column if not exists mde_device_id text;
alter table it_devices add column if not exists mde_onboarding text;
alter table it_devices add column if not exists mde_exposure text;
alter table it_devices add column if not exists mde_sensor_health text;
alter table it_devices add column if not exists mde_last_seen timestamptz;
alter table it_devices add column if not exists vuln_critical int;
alter table it_devices add column if not exists vuln_high int;
alter table it_devices add column if not exists mde_synced_at timestamptz;

alter table sec_secure_scores enable row level security;
alter table sec_score_controls enable row level security;
alter table sec_incidents enable row level security;
alter table sec_mfa_registration enable row level security;
alter table sec_risky_users enable row level security;
alter table sec_sync_runs enable row level security;
