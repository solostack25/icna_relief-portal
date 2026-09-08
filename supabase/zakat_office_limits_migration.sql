-- ============================================================
-- Per-office IRFAS (zakat) spending limits
-- ============================================================
-- One limit per office, admin-editable. "Given" is computed on read
-- (sum of amount_approved, falling back to amount_requested for
-- older approved rows that predate amount_approved being set) from
-- zakat_applications where status is 'approved' or 'paid' - not
-- stored, so it's always accurate against the real application data
-- rather than a running counter that could drift out of sync.

create table zakat_office_limits (
  id uuid primary key default gen_random_uuid(),
  office_id uuid not null unique references b2s_offices(id),
  limit_amount numeric(10, 2) not null,
  updated_by uuid references employees(id),
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

alter table zakat_office_limits enable row level security;

-- Read is broad (same as the other office-dashboard stats already
-- shown alongside it - helpdesk counts, fundraiser totals, etc. -
-- access to the dashboard itself is what's actually gated, in
-- app code, not this table's RLS) so both the admin limit-setting
-- page and every office's own dashboard label can read it.
create policy "zakat_office_limits read all staff" on zakat_office_limits
  for select using (auth.uid() is not null);

create policy "zakat_office_limits admin write" on zakat_office_limits
  for insert with check (is_admin());
create policy "zakat_office_limits admin update" on zakat_office_limits
  for update using (is_admin());
create policy "zakat_office_limits admin delete" on zakat_office_limits
  for delete using (is_admin());
