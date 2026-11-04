-- Audit log for Admin > Connectors > "Export as .env". Every export records
-- who downloaded which keys (names only, never values) and why. The export
-- route refuses to hand out keys if it can't write this row.

create table if not exists public.integration_settings_exports (
  id uuid primary key default gen_random_uuid(),
  exported_by uuid not null references public.employees(id),
  keys text[] not null,
  purpose text,
  created_at timestamptz not null default now()
);

create index if not exists integration_settings_exports_created_idx
  on public.integration_settings_exports (created_at desc);

-- Service role only (the export API route).
alter table public.integration_settings_exports enable row level security;
