-- ============================================================
-- Mileage Tracker (portal app → Finance Mileage Reimbursement)
--
-- One row per drive logged from the phone: Start Trip saves the
-- start point, End Trip saves the end point and the server works out
-- driving miles from a routing API (route_miles). While the app stays
-- open it also records GPS breadcrumbs and sums them (gps_miles) -
-- kept for audit, never the reimbursed number on its own because an
-- iPhone PWA stops reporting location when the screen locks.
--
-- Drives are submitted in groups as an ordinary Mileage Reimbursement
-- finance ticket (finance_mileage_batches + finance_mileage_trips),
-- so approval routing is exactly the existing Finance Tickets chain.
--
-- Status: in_progress -> ready (ended + described) -> submitted
--         any non-submitted drive can be discarded.
-- ============================================================

create table if not exists finance_mileage_drives (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references employees(id),
  status text not null default 'in_progress'
    check (status in ('in_progress', 'ready', 'submitted', 'discarded')),

  started_at timestamptz not null default now(),
  ended_at timestamptz,

  start_lat double precision not null,
  start_lng double precision not null,
  start_accuracy_m double precision,
  start_address_line1 text,
  start_city text,
  start_state text,
  start_zip_code text,

  end_lat double precision,
  end_lng double precision,
  end_accuracy_m double precision,
  end_address_line1 text,
  end_city text,
  end_state text,
  end_zip_code text,

  -- route_miles: driving distance between start and end from the
  -- routing provider. gps_miles: sum of breadcrumbs while the app was
  -- open. miles: what is claimed (route, x2 if round trip, or the
  -- driver's adjustment - adjusted_reason required when they differ).
  route_miles numeric(8, 2),
  route_provider text,
  gps_miles numeric(8, 2),
  gps_points int,
  round_trip boolean not null default false,
  miles numeric(8, 2),
  miles_adjusted boolean not null default false,
  adjusted_reason text,

  purpose text,
  billing_office_id uuid references b2s_offices(id),
  billing_program text,

  finance_ticket_id uuid references finance_tickets(id),
  mileage_trip_id uuid references finance_mileage_trips(id),
  submitted_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_mileage_drives_employee on finance_mileage_drives(employee_id, status, started_at desc);
-- Only one drive can be running per person.
create unique index if not exists finance_mileage_drives_one_active
  on finance_mileage_drives(employee_id) where status = 'in_progress';

alter table finance_mileage_drives enable row level security;

drop policy if exists "finance_mileage_drives own read" on finance_mileage_drives;
create policy "finance_mileage_drives own read" on finance_mileage_drives for select using (
  employee_id = (select id from employees where auth_user_id = auth.uid()) or is_admin()
);
drop policy if exists "finance_mileage_drives own insert" on finance_mileage_drives;
create policy "finance_mileage_drives own insert" on finance_mileage_drives for insert with check (
  employee_id = (select id from employees where auth_user_id = auth.uid())
);
-- Submitted drives are frozen; edits after that go through the
-- finance ticket's own "fixing" flow.
drop policy if exists "finance_mileage_drives own update" on finance_mileage_drives;
create policy "finance_mileage_drives own update" on finance_mileage_drives for update using (
  employee_id = (select id from employees where auth_user_id = auth.uid()) and status <> 'submitted'
);
drop policy if exists "finance_mileage_drives admin all" on finance_mileage_drives;
create policy "finance_mileage_drives admin all" on finance_mileage_drives for all using (is_admin());

-- Tracked drives are often a few tenths of a mile; whole-number miles
-- would round short trips to $0. Safe widening, existing values keep.
alter table finance_mileage_trips alter column mileage_traveled type numeric(8, 2);

-- Reimbursement rate. Finance changes it here (or Admin → integration
-- settings) each January; no deploy needed. 2026 IRS business rate.
insert into integration_settings (key, value, updated_at)
values ('mileage_rate_per_mile', '0.725', now())
on conflict (key) do nothing;
