-- ============================================================
-- Live Distribution (Orlando Automation, /orlando-automation/live-distribution)
-- ============================================================
-- Drive-through distribution day: staff scan each client's ID card as the
-- car pulls up, a modal shows the local food bank's own QR code (so it can
-- be scanned into the food bank's system too) and asks whether food was
-- distributed. Every scan is a row here; pounds of poultry / meat /
-- groceries are filled in afterwards (per row or all at once) and each
-- served row is pushed to the food bank's Salesforce through the existing
-- salesforce_sync_targets framework (source_module 'live-distribution').
--
-- Office-scoped like everything else so another office can adopt it later.

create table if not exists live_distributions (
  id uuid primary key default gen_random_uuid(),
  office_id uuid not null references b2s_offices(id),
  name text not null,
  distribution_date date not null default current_date,
  status text not null default 'open' check (status in ('open', 'closed')),
  created_by uuid references employees(id),
  created_at timestamptz not null default now(),
  closed_at timestamptz
);
create index if not exists live_distributions_office_idx on live_distributions (office_id, distribution_date desc);

create table if not exists live_distribution_entries (
  id uuid primary key default gen_random_uuid(),
  distribution_id uuid not null references live_distributions(id) on delete cascade,
  -- Denormalized from the distribution so RLS, reports and the Salesforce
  -- sync framework can scope directly (report module scope type "direct").
  office_id uuid not null references b2s_offices(id),
  client_id uuid not null references clients(id),
  -- NULL until staff answer "Was food distributed?" in the scan modal.
  food_distributed boolean,
  poultry_lbs numeric(10, 2),
  meat_lbs numeric(10, 2),
  grocery_lbs numeric(10, 2),
  scanned_by uuid references employees(id),
  scanned_at timestamptz not null default now(),
  salesforce_status text not null default 'not_pushed' check (salesforce_status in ('not_pushed', 'success', 'error')),
  salesforce_record_id text,
  salesforce_error text,
  salesforce_pushed_at timestamptz,
  -- A car/client is served once per distribution; re-scanning reopens
  -- the existing row instead of double-counting.
  unique (distribution_id, client_id)
);
create index if not exists live_distribution_entries_dist_idx on live_distribution_entries (distribution_id, scanned_at desc);
create index if not exists live_distribution_entries_office_idx on live_distribution_entries (office_id, scanned_at desc);

-- Per-office food bank QR shown in the scan modal: either the encoded
-- value (rendered as a QR by /api/orlando-automation/qr) or an uploaded
-- image of the food bank's printed code, stored inline as a data URL.
create table if not exists live_distribution_settings (
  office_id uuid primary key references b2s_offices(id),
  food_bank_name text,
  qr_value text,
  qr_image text,
  updated_by uuid references employees(id),
  updated_at timestamptz not null default now()
);

alter table live_distributions enable row level security;
alter table live_distribution_entries enable row level security;
alter table live_distribution_settings enable row level security;

-- Admins everywhere; everyone else only for their own assigned office
-- (same shape as the clients policies).
create policy "live_distributions office access" on live_distributions for all
  using (is_admin() or office_id = my_assigned_office())
  with check (is_admin() or office_id = my_assigned_office());
create policy "live_distribution_entries office access" on live_distribution_entries for all
  using (is_admin() or office_id = my_assigned_office())
  with check (is_admin() or office_id = my_assigned_office());
create policy "live_distribution_settings office access" on live_distribution_settings for all
  using (is_admin() or office_id = my_assigned_office())
  with check (is_admin() or office_id = my_assigned_office());

-- Several scanning stations can work one distribution; the Served list
-- listens for changes.
alter publication supabase_realtime add table live_distribution_entries;
