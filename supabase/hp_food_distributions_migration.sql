-- ============================================================
-- Hunger Prevention: food given to registered clients
-- ------------------------------------------------------------
-- One row per client per distribution, with pounds/counts and $ value per
-- food category (same categories as bulk distributions, see
-- lib/bulkDistributions.ts). Values = quantity × the national in-kind price
-- list (items table), snapshotted at entry time.
--
-- Filled from:
--   pickup   — HP check-in: completing a pickup records the office's
--              "today's package" (hp_daily_packages); undo removes it
--   profile  — client profile → Distribute Food
--   legacy_note — the old free-text "Distribute Food" notes, carried over
-- Orlando live distributions stay in live_distribution_entries and are
-- valued at export time.
--
-- Already applied directly to the live Supabase project.
-- ============================================================

create table if not exists hp_food_distributions (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  office_id uuid references b2s_offices(id),
  distributed_on date not null default current_date,
  individuals_served int not null default 1 check (individuals_served >= 0),
  food jsonb not null default '{}'::jsonb,
  total_lbs numeric(10,2) not null default 0,
  total_value numeric(12,2) not null default 0,
  source text not null default 'profile' check (source in ('pickup', 'profile', 'legacy_note')),
  source_id uuid unique,               -- pickup_bookings.id / client_service_log.id
  notes text,
  created_by uuid references employees(id),
  created_at timestamptz not null default now()
);
create index if not exists idx_hp_food_client on hp_food_distributions (client_id, distributed_on desc);
create index if not exists idx_hp_food_office_date on hp_food_distributions (office_id, distributed_on);

create table if not exists hp_daily_packages (
  office_id uuid not null references b2s_offices(id),
  package_date date not null,
  food jsonb not null default '{}'::jsonb,   -- { key: { qty } }
  updated_by uuid references employees(id),
  updated_at timestamptz not null default now(),
  primary key (office_id, package_date)
);

alter table hp_food_distributions enable row level security;
alter table hp_daily_packages enable row level security;

create policy "hp food admin all" on hp_food_distributions for all using (is_admin());
create policy "hp food staff own office" on hp_food_distributions for all
  using (office_id = my_assigned_office()) with check (office_id = my_assigned_office());
create policy "hp food regional director select" on hp_food_distributions for select using (
  exists (select 1 from b2s_offices o where o.id = hp_food_distributions.office_id and is_regional_director_for(o.region)));

create policy "hp package admin all" on hp_daily_packages for all using (is_admin());
create policy "hp package staff own office" on hp_daily_packages for all
  using (office_id = my_assigned_office()) with check (office_id = my_assigned_office());

revoke all on hp_food_distributions, hp_daily_packages from anon;

-- Carry over the old "Distribute Food" notes
insert into hp_food_distributions (client_id, office_id, distributed_on, individuals_served, source, source_id, notes, created_by, created_at)
select l.client_id, c.office_id, (l.created_at at time zone 'America/Chicago')::date,
       greatest(1, coalesce((select count(*) from clients h where h.household_key = c.household_key and c.household_key is not null), 1)),
       'legacy_note', l.id, l.notes, l.employee_id, l.created_at
from client_service_log l join clients c on c.id = l.client_id
where l.program_slug = 'hunger-prevention'
on conflict (source_id) do nothing;
