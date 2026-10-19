-- ============================================================
-- Power BI check (temporary)
-- ============================================================
-- Until Power BI is retired, this compares each portal number with the
-- matching Power BI number, so we can see where the portal is still
-- short and close the gap. Read-only toward Power BI: the portal only
-- runs DAX queries against the published semantic models.
--
-- Credentials live in integration_settings (Settings -> Connectors ->
-- Power BI), with PBI_* env vars as fallback. See lib/powerbi.ts.
--
-- When Power BI is gone: drop both tables, delete app/admin/powerbi-compare,
-- app/api/admin/powerbi, app/api/cron/powerbi-compare, lib/powerbi*.ts and
-- the cron entry in vercel.json.

create table if not exists pbi_compare_metrics (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  -- Portal side: a Reports suite report (lib/reportsSuite/catalog.ts) and
  -- the label of one KPI tile in it.
  report_key text not null,
  kpi_label text not null,
  -- Power BI side: a semantic model in the configured workspace and a DAX
  -- query returning one row; its first numeric column is the value.
  -- Tokens filled in at run time: {year}, {start}, {end} (DAX DATE(...)).
  dataset_id text not null,
  dataset_name text,
  dax text not null,
  -- Within this % counts as a match.
  tolerance_pct numeric not null default 1,
  is_active boolean not null default true,
  sort integer not null default 0,
  notes text,
  created_by uuid references employees(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- One row per metric per run, so the gap can be tracked over time.
create table if not exists pbi_compare_runs (
  id uuid primary key default gen_random_uuid(),
  metric_id uuid not null references pbi_compare_metrics(id) on delete cascade,
  run_at timestamptz not null default now(),
  year integer not null,
  month integer check (month between 1 and 12),
  portal_value numeric,
  pbi_value numeric,
  unit text, -- the portal tile's unit (money, count, hours, lbs, pct)
  portal_error text,
  pbi_error text,
  triggered_by text not null default 'manual' check (triggered_by in ('manual', 'cron'))
);

create index if not exists idx_pbi_compare_runs_lookup on pbi_compare_runs(metric_id, year, month, run_at desc);

alter table pbi_compare_metrics enable row level security;
alter table pbi_compare_runs enable row level security;
create policy "pbi_compare_metrics admin only" on pbi_compare_metrics for all using (is_admin());
create policy "pbi_compare_runs admin only" on pbi_compare_runs for all using (is_admin());
