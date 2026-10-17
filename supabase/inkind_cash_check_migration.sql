-- InKind: Cash & Check donations + money-order batching.
--
-- Flow: staff at the InKind scanning station record a cash or check
-- donation (donor info, amount, check number + photo). Later, an admin
-- selects the donations that went into a money order, records the money
-- order, then pushes each donation to ICNA Relief's Salesforce
-- individually. Once a donation is pushed, the donor's PII is purged
-- from the portal and the check image is replaced with a blurred copy -
-- Salesforce becomes the system of record. The money order record keeps
-- which donations were in it (by id + amount + Salesforce record id).
--
-- All writes go through /api/inkind/cash-check and
-- /api/inkind-admin/cash-check/* using the service role after an access
-- check. RLS below only grants staff READS (scoped like `sessions`);
-- there is deliberately no anon policy - the kiosk never reads these.

create table if not exists public.inkind_money_orders (
  id uuid primary key default gen_random_uuid(),
  office_id uuid references public.b2s_offices(id),
  office text,
  money_order_number text not null,
  amount numeric(12,2) not null check (amount > 0),
  donations_total numeric(12,2) not null,
  purchased_on date not null default current_date,
  notes text,
  created_by uuid references public.employees(id),
  created_at timestamptz not null default now(),
  pushed_at timestamptz,
  pushed_by uuid references public.employees(id)
);

create table if not exists public.inkind_cash_donations (
  id uuid primary key default gen_random_uuid(),
  receipt_number text not null unique,
  office_id uuid references public.b2s_offices(id),
  office text,
  method text not null check (method in ('cash', 'check')),
  amount numeric(12,2) not null check (amount > 0),
  date_received date not null default current_date,
  check_number text,
  -- Private bucket 'inkind-checks'. Original is deleted after the
  -- Salesforce push; only the blurred copy remains.
  check_image_path text,
  check_image_blurred boolean not null default false,

  -- Donor PII: held only until the Salesforce push, then nulled.
  donor_kind text not null default 'individual' check (donor_kind in ('individual', 'organization', 'anonymous')),
  donor_first_name text,
  donor_last_name text,
  donor_org_name text,
  donor_email text,
  donor_phone text,
  address_line1 text,
  address_line2 text,
  city text,
  state text,
  zip text,

  notes text,
  email_receipt boolean not null default false,
  receipt_sent_at timestamptz,
  receipt_error text,

  status text not null default 'received' check (status in ('received', 'batched', 'synced')),
  money_order_id uuid references public.inkind_money_orders(id) on delete set null,
  salesforce_record_id text,
  synced_at timestamptz,
  sync_error text,
  pii_purged_at timestamptz,

  created_by uuid references public.employees(id),
  created_at timestamptz not null default now(),

  constraint inkind_cash_check_has_number check (method <> 'check' or check_number is not null or pii_purged_at is not null)
);

create index if not exists inkind_cash_donations_status_idx on public.inkind_cash_donations (office_id, status, created_at desc);
create index if not exists inkind_cash_donations_mo_idx on public.inkind_cash_donations (money_order_id);

alter table public.inkind_money_orders enable row level security;
alter table public.inkind_cash_donations enable row level security;

drop policy if exists "cash donations admin select" on public.inkind_cash_donations;
create policy "cash donations admin select" on public.inkind_cash_donations
  for select to authenticated using (public.is_admin());
drop policy if exists "cash donations own office select" on public.inkind_cash_donations;
create policy "cash donations own office select" on public.inkind_cash_donations
  for select to authenticated using (office_id = public.my_assigned_office());
drop policy if exists "cash donations regional director select" on public.inkind_cash_donations;
create policy "cash donations regional director select" on public.inkind_cash_donations
  for select to authenticated using (
    exists (select 1 from public.b2s_offices o where o.id = inkind_cash_donations.office_id and public.is_regional_director_for(o.region))
  );

drop policy if exists "money orders admin select" on public.inkind_money_orders;
create policy "money orders admin select" on public.inkind_money_orders
  for select to authenticated using (public.is_admin());
drop policy if exists "money orders own office select" on public.inkind_money_orders;
create policy "money orders own office select" on public.inkind_money_orders
  for select to authenticated using (office_id = public.my_assigned_office());
drop policy if exists "money orders regional director select" on public.inkind_money_orders;
create policy "money orders regional director select" on public.inkind_money_orders
  for select to authenticated using (
    exists (select 1 from public.b2s_offices o where o.id = inkind_money_orders.office_id and public.is_regional_director_for(o.region))
  );

-- Private bucket for check photos. No storage policies: only the
-- service role (API routes) can read/write; viewers get short-lived
-- signed URLs.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('inkind-checks', 'inkind-checks', false, 10485760, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;
