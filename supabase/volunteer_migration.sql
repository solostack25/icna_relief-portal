-- ============================================================
-- Volunteer Signup module ("SignUpGenius replacement")
-- Office-scoped events with shift/item slots, public signup
-- (portal + WordPress plugin both hit the public policies below).
-- Reuses b2s_offices / b2s_regions for the office directory and
-- the same is_admin() / my_assigned_office() helpers already
-- defined in schema.sql + regional_program_director_migration.sql.
-- ============================================================

-- ---------- EVENTS ----------
create table volunteer_events (
  id uuid primary key default gen_random_uuid(),
  office_id uuid not null references b2s_offices(id),
  employee_id uuid references employees(id),   -- who created it

  slug text not null unique,                    -- public URL + WP shortcode key, e.g. "dallas-food-pantry-aug-2026"
  title text not null,
  description text,
  location_name text,
  location_address text,

  starts_on date,
  ends_on date,

  is_published boolean not null default false,  -- must be true to appear on public page / WP widget
  created_at timestamptz not null default now()
);

create index idx_volunteer_events_office on volunteer_events (office_id);
create index idx_volunteer_events_slug on volunteer_events (slug);

-- ---------- SLOTS ----------
create table volunteer_slots (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references volunteer_events(id) on delete cascade,

  slot_type text not null default 'shift' check (slot_type in ('shift', 'item')),
  label text not null,                          -- "9:00 AM - 12:00 PM" or "Bring napkins (2 needed)"
  start_time timestamptz,
  end_time timestamptz,

  capacity int not null default 1 check (capacity > 0),
  created_at timestamptz not null default now()
);

create index idx_volunteer_slots_event on volunteer_slots (event_id);

-- ---------- SIGNUPS ----------
create table volunteer_signups (
  id uuid primary key default gen_random_uuid(),
  slot_id uuid not null references volunteer_slots(id) on delete cascade,

  name text not null,
  email text not null,
  phone text,
  qty int not null default 1 check (qty > 0),   -- lets one signup fill >1 unit of an item slot
  notes text,
  waiver_signed boolean not null default false,

  source text not null default 'portal' check (source in ('portal', 'wordpress')),
  created_at timestamptz not null default now()
);

create index idx_volunteer_signups_slot on volunteer_signups (slot_id);

-- ---------- Capacity guard ----------
-- Prevents overbooking under concurrent signups (two people submitting
-- the last open spot at the same time). Raises a clear error the API
-- route / WP plugin proxy can catch and turn into "slot just filled up".
create or replace function check_volunteer_slot_capacity()
returns trigger
language plpgsql
as $$
declare
  v_capacity int;
  v_taken int;
begin
  select capacity into v_capacity from volunteer_slots where id = new.slot_id for update;

  select coalesce(sum(qty), 0) into v_taken
  from volunteer_signups
  where slot_id = new.slot_id;

  if v_taken + new.qty > v_capacity then
    raise exception 'slot_full' using errcode = 'P0001';
  end if;

  return new;
end;
$$;

create trigger trg_volunteer_slot_capacity
  before insert on volunteer_signups
  for each row execute function check_volunteer_slot_capacity();

-- ---------- Availability view (what the public API / WP plugin reads) ----------
create view volunteer_slot_availability as
select
  s.id as slot_id,
  s.event_id,
  s.slot_type,
  s.label,
  s.start_time,
  s.end_time,
  s.capacity,
  coalesce(sum(g.qty), 0)::int as claimed,
  (s.capacity - coalesce(sum(g.qty), 0))::int as spots_remaining
from volunteer_slots s
left join volunteer_signups g on g.slot_id = s.id
group by s.id;

grant select on volunteer_slot_availability to authenticated, anon;

-- ============================================================
-- RLS
-- ============================================================

alter table volunteer_events enable row level security;
alter table volunteer_slots enable row level security;
alter table volunteer_signups enable row level security;

-- Events -----------------------------------------------------
create policy "volunteer admin full access events" on volunteer_events
  for all using (is_admin());

create policy "volunteer staff insert own office" on volunteer_events
  for insert with check (office_id = my_assigned_office());

create policy "volunteer staff select own office" on volunteer_events
  for select using (office_id = my_assigned_office());

create policy "volunteer staff update own office" on volunteer_events
  for update using (office_id = my_assigned_office());

create policy "volunteer regional director select" on volunteer_events
  for select using (is_regional_director_for((select region from b2s_offices where id = volunteer_events.office_id)));

-- Public (anon key — portal public page + WordPress plugin) only ever
-- sees published events, and only read access.
create policy "public read published events" on volunteer_events
  for select using (is_published = true);

-- Slots --------------------------------------------------------
create policy "volunteer admin full access slots" on volunteer_slots
  for all using (is_admin());

create policy "volunteer staff manage own office slots" on volunteer_slots
  for all using (
    exists (
      select 1 from volunteer_events e
      where e.id = volunteer_slots.event_id
      and e.office_id = my_assigned_office()
    )
  );

create policy "public read slots of published events" on volunteer_slots
  for select using (
    exists (
      select 1 from volunteer_events e
      where e.id = volunteer_slots.event_id
      and e.is_published = true
    )
  );

-- Signups --------------------------------------------------------
create policy "volunteer admin full access signups" on volunteer_signups
  for all using (is_admin());

create policy "volunteer staff select own office signups" on volunteer_signups
  for select using (
    exists (
      select 1 from volunteer_slots s
      join volunteer_events e on e.id = s.event_id
      where s.id = volunteer_signups.slot_id
      and e.office_id = my_assigned_office()
    )
  );

-- Public can claim a slot on a published event. Capacity is enforced
-- by the trigger above, not by RLS (RLS can't see other rows' sums
-- reliably under concurrency the way a locking trigger can).
create policy "public insert signup on published event" on volunteer_signups
  for insert with check (
    exists (
      select 1 from volunteer_slots s
      join volunteer_events e on e.id = s.event_id
      where s.id = volunteer_signups.slot_id
      and e.is_published = true
    )
  );
