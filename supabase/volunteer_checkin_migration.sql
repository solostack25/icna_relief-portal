-- ============================================================
-- Volunteer check-in / check-out, volunteer profiles, hours
-- ------------------------------------------------------------
-- Replaces what the Master Cleaner's Volunteers report needed from
-- the old volunteer-platform export: actual attended hours, a
-- persistent volunteer ID (for year-over-year retention), age,
-- gender, ethnicity, home city/state/zip, waiver signed, and the
-- program each event belongs to.
--
-- Pieces:
--   volunteers              one row per person (matched by email, else phone)
--   volunteer_events        + program, starts_at/ends_at, timezone, check-in token
--   volunteer_signups       + volunteer_id, status, 'qr' / 'walk_in' sources
--   volunteer_attendance    check-in / check-out rows (self, staff or auto)
--   volunteer_hour_rates    dated $/hour value (34.79 → 36.14 on 2026-04-01)
--   volunteer_auto_checkout()  closes open check-ins at the event's end
--                              time; scheduled every 5 min via pg_cron
--   volunteer_hours         view: one row per attendance with hours + value
--
-- Already applied directly to the live Supabase project.
-- ============================================================

-- ---------- Volunteers (persistent identity) ----------
create table if not exists volunteers (
  id uuid primary key default gen_random_uuid(),
  first_name text not null,
  last_name text not null default '',
  email text,
  phone text,
  phone_digits text generated always as (nullif(regexp_replace(coalesce(phone, ''), '\D', '', 'g'), '')) stored,
  date_of_birth date,
  gender text check (gender in ('Male', 'Female', 'Prefer not to say')),
  ethnicity text check (ethnicity in (
    'Asian', 'Black or African-American', 'Hispanic or Latino',
    'Middle Eastern or North African', 'Native American or Indigenous',
    'Pacific Islander', 'White or Caucasian', 'Two or More', 'Prefer not to say'
  )),
  home_city text,
  home_state text,
  home_zip text,
  waiver_signed_at timestamptz,
  waiver_version text,
  waiver_signature text,            -- typed full name
  waiver_guardian_name text,        -- required by the UI when under 18
  salesforce_contact_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint volunteers_contact_required check (email is not null or phone is not null)
);

create unique index if not exists volunteers_email_key on volunteers (lower(email)) where email is not null;
create index if not exists volunteers_phone_digits_idx on volunteers (phone_digits);

-- ---------- Events: program, real start/end, timezone, check-in token ----------
alter table volunteer_events
  add column if not exists program text check (program in (
    'Back2School', 'Disaster Relief Services', 'Health Services', 'Hunger Prevention',
    'Muslim Family Services', 'FATE', 'Refugee Services & Community Empowerment',
    'Transitional Housing', 'Outreach', 'General'
  )),
  add column if not exists starts_at timestamptz,
  add column if not exists ends_at timestamptz,
  add column if not exists timezone text not null default 'America/Chicago',
  add column if not exists checkin_token text not null default encode(gen_random_bytes(12), 'hex');

create unique index if not exists volunteer_events_checkin_token_key on volunteer_events (checkin_token);

-- ---------- Signups: link to volunteer, status, new sources ----------
alter table volunteer_signups
  add column if not exists volunteer_id uuid references volunteers(id),
  add column if not exists status text not null default 'signed_up' check (status in ('signed_up', 'cancelled'));

alter table volunteer_signups drop constraint if exists volunteer_signups_source_check;
alter table volunteer_signups add constraint volunteer_signups_source_check
  check (source in ('portal', 'wordpress', 'website', 'qr', 'walk_in'));

create index if not exists idx_volunteer_signups_volunteer on volunteer_signups (volunteer_id);

-- Walk-ins must never be blocked by a full slot: capacity only counts
-- active signups, and walk-ins (no slot capacity promise) are exempt.
create or replace function check_volunteer_slot_capacity()
returns trigger
language plpgsql
as $$
declare
  v_capacity int;
  v_taken int;
begin
  if new.source = 'walk_in' or new.status = 'cancelled' then
    return new;
  end if;

  select capacity into v_capacity from volunteer_slots where id = new.slot_id for update;

  select coalesce(sum(qty), 0) into v_taken
  from volunteer_signups
  where slot_id = new.slot_id and status = 'signed_up';

  if v_taken + new.qty > v_capacity then
    raise exception 'slot_full' using errcode = 'P0001';
  end if;

  return new;
end;
$$;

create or replace view volunteer_slot_availability as
select
  s.id as slot_id,
  s.event_id,
  s.slot_type,
  s.label,
  s.start_time,
  s.end_time,
  s.capacity,
  coalesce(sum(g.qty) filter (where g.status = 'signed_up'), 0)::int as claimed,
  (s.capacity - coalesce(sum(g.qty) filter (where g.status = 'signed_up'), 0))::int as spots_remaining
from volunteer_slots s
left join volunteer_signups g on g.slot_id = s.id
group by s.id;

-- ---------- Attendance ----------
create table if not exists volunteer_attendance (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references volunteer_events(id) on delete cascade,
  volunteer_id uuid not null references volunteers(id),
  signup_id uuid references volunteer_signups(id) on delete set null,
  checked_in_at timestamptz not null default now(),
  checked_out_at timestamptz,
  checkin_method text not null default 'self' check (checkin_method in ('self', 'staff')),
  checkout_method text check (checkout_method in ('self', 'staff', 'auto')),
  self_token text not null default encode(gen_random_bytes(16), 'hex'),  -- lets the volunteer's own phone check out
  staff_note text,
  created_at timestamptz not null default now(),
  constraint volunteer_attendance_order check (checked_out_at is null or checked_out_at >= checked_in_at)
);

create index if not exists idx_volunteer_attendance_event on volunteer_attendance (event_id);
create index if not exists idx_volunteer_attendance_volunteer on volunteer_attendance (volunteer_id);
-- one open check-in per person per event
create unique index if not exists volunteer_attendance_one_open
  on volunteer_attendance (event_id, volunteer_id) where checked_out_at is null;

-- ---------- Dated hourly value ----------
create table if not exists volunteer_hour_rates (
  effective_from date primary key,
  rate numeric(8,2) not null check (rate > 0)
);

insert into volunteer_hour_rates (effective_from, rate) values
  ('1900-01-01', 34.79),
  ('2026-04-01', 36.14)
on conflict (effective_from) do nothing;

create or replace function volunteer_hour_rate(p_date date)
returns numeric
language sql stable
set search_path = public
as $$
  select rate from volunteer_hour_rates where effective_from <= p_date order by effective_from desc limit 1;
$$;

-- ---------- When an open check-in gets auto-closed ----------
-- Event end time, applied per day for multi-day events (checked in on
-- day 2 of a 3-day event → closed at day 2's end time). Legacy events
-- with no end time fall back to the shift's end, else 4 hours.
create or replace function volunteer_checkout_cutoff(p_attendance_id uuid)
returns timestamptz
language sql stable
set search_path = public
as $$
  select
    case
      when e.ends_at is not null then
        case
          when daily.cutoff > a.checked_in_at and daily.cutoff < e.ends_at then daily.cutoff
          when e.ends_at > a.checked_in_at then e.ends_at
          else a.checked_in_at
        end
      when sl.end_time is not null and sl.end_time > a.checked_in_at then sl.end_time
      else a.checked_in_at + interval '4 hours'
    end
  from volunteer_attendance a
  join volunteer_events e on e.id = a.event_id
  left join volunteer_signups su on su.id = a.signup_id
  left join volunteer_slots sl on sl.id = su.slot_id
  cross join lateral (
    select ((a.checked_in_at at time zone e.timezone)::date
            + (e.ends_at at time zone e.timezone)::time) at time zone e.timezone as cutoff
  ) daily
  where a.id = p_attendance_id;
$$;

create or replace function volunteer_auto_checkout()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
begin
  with due as (
    select a.id, volunteer_checkout_cutoff(a.id) as cutoff
    from volunteer_attendance a
    where a.checked_out_at is null
  )
  update volunteer_attendance a
     set checked_out_at = due.cutoff,
         checkout_method = 'auto'
    from due
   where a.id = due.id
     and due.cutoff <= now();

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function volunteer_auto_checkout() from public, anon;
grant execute on function volunteer_auto_checkout() to authenticated, service_role;

-- ---------- Hours view (RLS of the caller applies) ----------
create or replace view volunteer_hours
with (security_invoker = true) as
select
  a.id as attendance_id,
  a.event_id,
  a.volunteer_id,
  a.signup_id,
  e.office_id,
  e.title as event_title,
  coalesce(e.program, 'General') as program,
  e.starts_at as event_starts_at,
  coalesce((a.checked_in_at at time zone e.timezone)::date, e.starts_on) as service_date,
  a.checked_in_at,
  a.checked_out_at,
  a.checkin_method,
  a.checkout_method,
  round((extract(epoch from (a.checked_out_at - a.checked_in_at)) / 3600.0)::numeric, 2) as hours,
  volunteer_hour_rate((a.checked_in_at at time zone e.timezone)::date) as hour_rate,
  round((extract(epoch from (a.checked_out_at - a.checked_in_at)) / 3600.0)::numeric
        * volunteer_hour_rate((a.checked_in_at at time zone e.timezone)::date), 2) as value
from volunteer_attendance a
join volunteer_events e on e.id = a.event_id;

-- ============================================================
-- RLS
-- ============================================================
alter table volunteers enable row level security;
alter table volunteer_attendance enable row level security;
alter table volunteer_hour_rates enable row level security;

-- Volunteers: admin everything; staff see/update people who signed up
-- for or attended their own office's events. Public writes go through
-- token-checked API routes using the service role, never anon.
create policy "volunteers admin all" on volunteers for all using (is_admin());

create policy "volunteers staff select own office" on volunteers for select using (
  exists (
    select 1 from volunteer_signups su
    join volunteer_slots sl on sl.id = su.slot_id
    join volunteer_events e on e.id = sl.event_id
    where su.volunteer_id = volunteers.id and e.office_id = my_assigned_office()
  ) or exists (
    select 1 from volunteer_attendance a
    join volunteer_events e on e.id = a.event_id
    where a.volunteer_id = volunteers.id and e.office_id = my_assigned_office()
  )
);

create policy "volunteers regional director select" on volunteers for select using (
  exists (
    select 1 from volunteer_attendance a
    join volunteer_events e on e.id = a.event_id
    join b2s_offices o on o.id = e.office_id
    where a.volunteer_id = volunteers.id and is_regional_director_for(o.region)
  )
);

-- Attendance
create policy "attendance admin all" on volunteer_attendance for all using (is_admin());

create policy "attendance staff manage own office" on volunteer_attendance for all using (
  exists (select 1 from volunteer_events e where e.id = volunteer_attendance.event_id and e.office_id = my_assigned_office())
) with check (
  exists (select 1 from volunteer_events e where e.id = volunteer_attendance.event_id and e.office_id = my_assigned_office())
);

create policy "attendance regional director select" on volunteer_attendance for select using (
  exists (
    select 1 from volunteer_events e join b2s_offices o on o.id = e.office_id
    where e.id = volunteer_attendance.event_id and is_regional_director_for(o.region)
  )
);

-- Signups: staff of the office can now update (cancel / link) their own signups
create policy "volunteer staff update own office signups" on volunteer_signups for update using (
  exists (
    select 1 from volunteer_slots s join volunteer_events e on e.id = s.event_id
    where s.id = volunteer_signups.slot_id and e.office_id = my_assigned_office()
  )
);

-- Rates: readable by any signed-in user, editable by admins
create policy "hour rates read" on volunteer_hour_rates for select using (auth.role() = 'authenticated');
create policy "hour rates admin write" on volunteer_hour_rates for all using (is_admin());

-- The check-in token must never leak to the public: anon can read
-- published events, so hide that one column from anon.
revoke select on volunteer_events from anon;
grant select (id, office_id, employee_id, slug, title, description, location_name, location_address,
              starts_on, ends_on, is_published, created_at, program, starts_at, ends_at, timezone)
  on volunteer_events to anon;

-- ============================================================
-- Backfill: one volunteer per distinct email on existing signups
-- ============================================================
insert into volunteers (first_name, last_name, email, phone, created_at)
select distinct on (lower(trim(email)))
  split_part(trim(name), ' ', 1),
  trim(substr(trim(name), length(split_part(trim(name), ' ', 1)) + 1)),
  lower(trim(email)),
  phone,
  created_at
from volunteer_signups
where email is not null and trim(email) <> ''
order by lower(trim(email)), created_at
on conflict do nothing;

update volunteer_signups su
   set volunteer_id = v.id
  from volunteers v
 where su.volunteer_id is null and lower(trim(su.email)) = lower(v.email);

-- Legacy events: real start/end from the date + their shift times when present
update volunteer_events e
   set starts_at = coalesce(
         (select min(start_time) from volunteer_slots s where s.event_id = e.id),
         (e.starts_on::timestamp + time '09:00') at time zone e.timezone),
       ends_at = coalesce(
         (select max(end_time) from volunteer_slots s where s.event_id = e.id),
         (coalesce(e.ends_on, e.starts_on)::timestamp + time '17:00') at time zone e.timezone)
 where e.starts_at is null and e.starts_on is not null;

-- ============================================================
-- Every 5 minutes: close check-ins whose event has ended
-- ============================================================
create extension if not exists pg_cron;

select cron.unschedule('volunteer-auto-checkout')
 where exists (select 1 from cron.job where jobname = 'volunteer-auto-checkout');

select cron.schedule('volunteer-auto-checkout', '*/5 * * * *', $$select public.volunteer_auto_checkout()$$);

-- ---------- Hardening (applied right after) ----------
revoke all on volunteers, volunteer_attendance, volunteer_hour_rates from anon;
revoke all on volunteer_hours from anon;
alter function public.check_volunteer_slot_capacity() set search_path = public;
