-- ============================================================
-- Salesforce sync framework
-- ============================================================
-- The actual problem: pantry staff enter a client visit/distribution
-- once in this portal, but each office's local food bank runs its
-- OWN Salesforce org and wants that same data in theirs too - so
-- staff re-enter it a second time by hand. This is the plumbing to
-- push it automatically instead, once a given food bank's Salesforce
-- admin has actually granted API access (see lib/salesforce.ts for
-- what that requires - a Connected App with Client Credentials Flow
-- enabled, the target object API name, and their field names).
--
-- Deliberately NOT wired to any real food bank yet - there's no
-- universal "Feeding America API" to integrate with once; every food
-- bank's org, object, and fields are different, so this is built as
-- a per-office, config-driven target rather than a single hardcoded
-- integration. An office with no target configured is simply never
-- synced - the framework is inert until someone fills in real
-- credentials for a real object/field mapping.

create table salesforce_sync_targets (
  id uuid primary key default gen_random_uuid(),
  office_id uuid not null references b2s_offices(id),
  food_bank_name text not null,
  -- e.g. https://foodbank.my.salesforce.com - the org's own instance,
  -- NOT a shared MealConnect endpoint (each food bank's org is separate)
  instance_url text not null,
  -- OAuth 2.0 Client Credentials Flow: the food bank's Salesforce
  -- admin creates a Connected App with this flow enabled and hands
  -- over these two values - no per-user login, no refresh token to
  -- manage, ideal for an unattended backend sync (see lib/salesforce.ts)
  client_id text not null,
  client_secret text not null,
  -- Which ICNA report module this target mirrors (registry slug, e.g.
  -- 'hunger-prevention') - determines which table/columns get synced
  source_module text not null,
  -- Target Salesforce object API name, e.g. 'Distribution__c'
  object_api_name text not null,
  -- [{ sourceColumn: 'household_size_snapshot', salesforceField: 'Household_Size__c' }, ...]
  -- Deliberately left as data, not code - the whole point is a new
  -- food bank's field names never require a deploy, just a row edit.
  field_mapping jsonb not null default '[]',
  sync_mode text not null default 'batch' check (sync_mode in ('batch')),
  schedule text not null default 'daily' check (schedule in ('daily', 'weekly', 'monthly')),
  is_active boolean not null default false,
  created_by uuid references employees(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_sf_sync_targets_office on salesforce_sync_targets(office_id);

-- One row per sync attempt of one source record, so a failed push is
-- visible and retryable rather than silently dropped, and so the
-- cron job knows which source rows have already been sent (avoids
-- re-pushing the same intake every run).
create table salesforce_sync_log (
  id uuid primary key default gen_random_uuid(),
  target_id uuid not null references salesforce_sync_targets(id) on delete cascade,
  source_record_id uuid not null,
  status text not null check (status in ('success', 'error')),
  salesforce_record_id text,
  error_message text,
  attempted_at timestamptz not null default now()
);

create index idx_sf_sync_log_target_source on salesforce_sync_log(target_id, source_record_id);
create index idx_sf_sync_log_target_status on salesforce_sync_log(target_id, status, attempted_at desc);

alter table salesforce_sync_targets enable row level security;
alter table salesforce_sync_log enable row level security;

-- Client secrets live in this table, so it's admin-only, full stop -
-- no office-scoped read policy like report_definitions has.
create policy "sf_sync_targets admin only" on salesforce_sync_targets for all using (is_admin());
create policy "sf_sync_log admin only" on salesforce_sync_log for all using (is_admin());
