-- ============================================================
-- Finance: expenses (replaces the Expenditure PowerBi workbook)
-- ============================================================
-- One row per office / central department / grant office per month,
-- the same three tables as the cleaned "Expenditure PowerBi" workbook
-- (Expense-Total, Central Expenses, Grants Expenses). Account amounts
-- live in `amounts` keyed by the account keys in lib/finance/accounts.ts;
-- every TOTAL column is computed, never stored (except expenses_total,
-- kept in step by the app for fast reporting).
--
-- Data arrives four ways, all ending up here: typed in on Admin →
-- Expenses, uploaded as the cleaned workbook/CSV, uploaded as the raw
-- QuickBooks "P&L by Class" export, or pulled from QuickBooks (Online API
-- or Desktop via Web Connector). QuickBooks classes are mapped to offices
-- / central departments / grants in fin_qb_class_map, and central costs
-- are shared out to offices by FTE (fin_allocation_weights).

create table if not exists fin_expense_rows (
  id uuid primary key default gen_random_uuid(),
  year integer not null check (year between 2000 and 2100),
  month integer not null check (month between 1 and 12),
  scope text not null check (scope in ('office', 'central', 'grant')),
  -- identity within (year, month): scope + office name or dept/subhead,
  -- lower-cased, so re-imports update instead of duplicating
  row_key text not null,
  office_id uuid references b2s_offices(id),
  office_name text,
  region text,
  state text,
  chapter text,
  department text,
  subhead text,
  revenue numeric,          -- office: REVENUE; grant: GRANT REVENUE
  central_share numeric,    -- office: TOTAL CENTRAL DEPARTMENTS SHARE
  amounts jsonb not null default '{}',
  expenses_total numeric not null default 0,
  source text not null default 'manual' check (source in ('manual', 'upload', 'qb_file', 'qb_online', 'qb_desktop', 'history')),
  batch_id uuid,
  notes text,
  updated_by uuid references employees(id),
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (year, month, row_key)
);
create index if not exists idx_fin_rows_period on fin_expense_rows(year, month, scope);
create index if not exists idx_fin_rows_office on fin_expense_rows(office_id);

create table if not exists fin_import_batches (
  id uuid primary key default gen_random_uuid(),
  source text not null,
  file_name text,
  period_label text,
  rows_count integer not null default 0,
  summary jsonb,
  status text not null default 'applied' check (status in ('applied', 'failed', 'removed')),
  created_by uuid references employees(id),
  created_at timestamptz not null default now()
);

-- QuickBooks class → where its expenses go.
--   office  : the office's monthly row
--   grant   : the office's grant row (and also its office row when also_office)
--   central : a central department / subhead row
--   ignore  : skipped (e.g. a regional total column)
--   review  : not decided yet — import warns and skips it
create table if not exists fin_qb_class_map (
  qb_class text primary key,
  target text not null check (target in ('office', 'grant', 'central', 'ignore', 'review')),
  office_id uuid references b2s_offices(id),
  office_name text,
  department text,
  subhead text,
  also_office boolean not null default true,
  updated_by uuid references employees(id),
  updated_at timestamptz not null default now()
);

-- Central costs are shared to offices in proportion to FTE.
create table if not exists fin_allocation_weights (
  year integer not null,
  office_name text not null,
  office_id uuid references b2s_offices(id),
  fte numeric not null default 0 check (fte >= 0),
  updated_by uuid references employees(id),
  updated_at timestamptz not null default now(),
  primary key (year, office_name)
);

-- Months waiting to be pulled from QuickBooks (Desktop: the Web Connector
-- picks these up on its next run; Online: pulled immediately).
create table if not exists fin_qb_sync_queue (
  id uuid primary key default gen_random_uuid(),
  year integer not null,
  month integer not null check (month between 1 and 12),
  source text not null check (source in ('desktop', 'online')),
  status text not null default 'queued' check (status in ('queued', 'sent', 'done', 'failed')),
  error text,
  batch_id uuid references fin_import_batches(id),
  requested_by uuid references employees(id),
  requested_at timestamptz not null default now(),
  finished_at timestamptz
);

-- Web Connector sessions (one per run).
create table if not exists fin_qbwc_sessions (
  ticket text primary key,
  queue_id uuid references fin_qb_sync_queue(id),
  last_error text,
  created_at timestamptz not null default now()
);

alter table fin_expense_rows enable row level security;
alter table fin_import_batches enable row level security;
alter table fin_qb_class_map enable row level security;
alter table fin_allocation_weights enable row level security;
alter table fin_qb_sync_queue enable row level security;
alter table fin_qbwc_sessions enable row level security;
-- Reads/writes go through the API (finance-team check, then service role).
create policy "fin_expense_rows admin" on fin_expense_rows for all using (is_admin());
create policy "fin_import_batches admin" on fin_import_batches for all using (is_admin());
create policy "fin_qb_class_map admin" on fin_qb_class_map for all using (is_admin());
create policy "fin_allocation_weights admin" on fin_allocation_weights for all using (is_admin());
create policy "fin_qb_sync_queue admin" on fin_qb_sync_queue for all using (is_admin());
create policy "fin_qbwc_sessions admin" on fin_qbwc_sessions for all using (is_admin());
