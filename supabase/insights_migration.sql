-- Insights dashboard fact layer (applied directly via Supabase MCP).
-- One row per (date, office, program, metric, value) across every program's data,
-- plus insights_query() which returns everything /admin/insights needs for one filter state.

create or replace function insights_program(p text) returns text language sql immutable as $$
  select case
    when p is null or trim(p) = '' then 'General'
    when p ilike '%hunger%' then 'Hunger Prevention'
    when p ilike '%refugee%' or p ilike 'rsce%' then 'Refugee Services'
    when p ilike '%back%school%' or p ilike '%back2%' or p ilike 'b2s%' then 'Back2School'
    when p ilike '%disaster%' then 'Disaster Relief'
    when p ilike '%fate%' or p ilike '%muslim family%' or p ilike '%counsel%' then 'Muslim Family Services'
    when p ilike '%health%' or p ilike '%helath%' then 'Health Services'
    when p ilike '%transitional%' then 'Transitional Housing'
    when p ilike '%outreach%' then 'Outreach'
    else 'General' end
$$;

create or replace view insights_facts with (security_invoker = true) as
with price as (
  select
    coalesce(max(new_price) filter (where code = 'POULTRY'), 0) poultry,
    coalesce(max(new_price) filter (where code in ('BEEF-1-LBS')), max(new_price) filter (where code = 'BEEF'), 0) meat,
    coalesce(max(new_price) filter (where code = 'DRY-GROCERY-1LB'), max(new_price) filter (where code = 'NON-PERISHABLE'), 0) grocery
  from items where active
)
-- Hunger Prevention food to registered clients (check-in packages, client profile)
select d.distributed_on fact_date, d.office_id, 'Hunger Prevention'::text program, m.metric, m.value
from hp_food_distributions d
cross join lateral (values ('people_served', d.individuals_served::numeric), ('food_lbs', d.total_lbs), ('food_value', d.total_value), ('food_distributions', 1::numeric)) m(metric, value)
union all
-- Orlando live distributions, valued at the current price list
select (e.scanned_at at time zone 'America/Chicago')::date, e.office_id, 'Hunger Prevention', m.metric, m.value
from live_distribution_entries e
left join clients c on c.id = e.client_id
cross join price p
cross join lateral (values
  ('people_served', greatest(1, coalesce((select count(*) from clients h where c.household_key is not null and h.household_key = c.household_key), 1))::numeric),
  ('food_lbs', coalesce(e.poultry_lbs, 0) + coalesce(e.meat_lbs, 0) + coalesce(e.grocery_lbs, 0)),
  ('food_value', coalesce(e.poultry_lbs, 0) * p.poultry + coalesce(e.meat_lbs, 0) * p.meat + coalesce(e.grocery_lbs, 0) * p.grocery),
  ('food_distributions', 1::numeric)
) m(metric, value)
where e.food_distributed
union all
-- Bulk distributions (Hunger Prevention food drives, Refugee Services household items…)
select b.distributed_on, b.office_id, insights_program(b.program), m.metric, m.value
from bulk_distributions b
cross join lateral (values
  ('people_served', b.people_served::numeric),
  ('households_served', b.households_served::numeric),
  ('food_lbs', (select coalesce(sum((v->>'qty')::numeric), 0) from jsonb_each(b.food) j(k, v) where k in ('grocery','produce','meat','poultry','fish','qurbani_meat'))),
  (case when b.program = 'Hunger Prevention' then 'food_value' else 'services_value' end, b.total_value),
  ('bulk_distributions', 1::numeric)
) m(metric, value)
where m.value is not null
union all
-- Refugee Services case services
select s.delivered_on, s.office_id, 'Refugee Services', m.metric, m.value
from rsce_services s
cross join lateral (values ('people_served', s.beneficiaries::numeric), ('services_value', s.value), ('services_delivered', 1::numeric)) m(metric, value)
union all
-- IRFAS financial assistance (approved/paid, not voided)
select (z.decided_at at time zone 'America/Chicago')::date, z.office_id, insights_program(z.program), m.metric, m.value
from zakat_applications z
cross join lateral (values ('financial_assistance', coalesce(z.amount_approved, z.amount_requested)), ('people_served', coalesce(z.household_size, 1)::numeric), ('irfas_applications', 1::numeric)) m(metric, value)
where z.status in ('approved', 'paid') and z.voided_at is null and z.decided_at is not null
union all
-- Volunteer hours from check-in / check-out
select h.service_date, h.office_id, insights_program(h.program), m.metric, m.value
from volunteer_hours h
cross join lateral (values ('volunteer_hours', h.hours), ('volunteer_value', h.value)) m(metric, value)
where h.checked_out_at is not null
union all
-- In-kind donations received (completed intake sessions)
-- (sessions from before in-kind went multi-office have no office: they were all Houston)
select s.date_received, coalesce(s.office_id, (select id from b2s_offices where field_office = 'Houston Office' limit 1)), insights_program(d.program), 'inkind_value',
       sum(case when d.is_manual_price then d.unit_price else d.unit_price * d.qty end)
from sessions s join donations d on d.session_id = s.id
where s.status = 'completed' and s.date_received is not null
group by s.id, s.date_received, s.office_id, insights_program(d.program)
union all
-- Cash / check donations at the intake station
select cd.date_received, cd.office_id, 'General', 'cash_received', cd.amount from inkind_cash_donations cd
union all
-- Donations synced from Salesforce
select r.received_on, r.office_id, insights_program(r.program), 'revenue', r.amount from revenue_transactions r
union all
-- Grants
select coalesce(g.received_date, make_date(g.fiscal_year, 1, 1)), g.office_id, insights_program(g.program), 'grants', g.amount
from grants g where g.stream = 'grant' and (g.received_date is not null or g.fiscal_year is not null)
union all
-- Back to School: backpacks handed out from client profiles
select (bd.distributed_at at time zone 'America/Chicago')::date, c.office_id, 'Back2School', 'backpacks', bd.backpacks_distributed::numeric
from b2s_client_distributions bd left join clients c on c.id = bd.client_id
union all
-- Back to School monthly office submissions
select make_date(s.year, s.month, 1), s.office_id, 'Back2School', m.metric, m.value
from b2s_submissions s
cross join lateral (values
  ('backpacks', (coalesce(s.elementary_backpacks,0) + coalesce(s.middle_backpacks,0) + coalesce(s.high_backpacks,0))::numeric),
  ('households_served', s.households_served::numeric),
  ('inkind_value', s.in_kind_donation_value),
  ('cash_received', s.cash_donations),
  ('financial_assistance', coalesce(s.sfa_amount_disbursed,0) + coalesce(s.empower_amount_disbursed,0))
) m(metric, value)
where coalesce(s.status, '') <> 'rejected' and s.year is not null and s.month between 1 and 12 and m.value is not null
union all
-- Disaster Relief monthly office submissions
select make_date(s.year, s.month, 1), s.office_id, 'Disaster Relief', m.metric, m.value
from drs_submissions s
cross join lateral (values
  ('people_served', s.individuals_served::numeric), ('households_served', s.households_served::numeric),
  ('volunteer_hours', s.volunteer_hours), ('services_value', s.value_of_services),
  ('inkind_value', s.in_kind_value), ('cash_received', s.receipts_value)
) m(metric, value)
where coalesce(s.status, '') <> 'rejected' and s.year is not null and s.month between 1 and 12 and m.value is not null
union all
-- FATE / Muslim Family Services monthly office submissions
select make_date(s.year, s.month, 1), s.office_id, 'Muslim Family Services', m.metric, m.value
from fate_submissions s
cross join lateral (values
  ('people_served', (coalesce(s.people_served_new,0) + coalesce(s.people_served_ongoing,0))::numeric),
  ('volunteer_hours', coalesce(s.volunteer_hours,0) + coalesce(s.professional_volunteer_hours,0)),
  ('services_value', coalesce(s.consultation_value,0) + coalesce(s.referrals_value,0) + coalesce(s.other_assistance_value,0)),
  ('inkind_value', s.in_kind_donation), ('cash_received', s.cash_donation)
) m(metric, value)
where coalesce(s.status, '') <> 'rejected' and s.year is not null and s.month between 1 and 12 and m.value is not null
union all
-- Transitional Housing admissions
select t.move_in_date, c.office_id, 'Transitional Housing', m.metric, m.value
from th_stays t left join clients c on c.id = t.client_id
cross join lateral (values ('th_admissions', 1::numeric), ('people_served', 1::numeric)) m(metric, value)
where t.move_in_date is not null
union all
-- New client registrations
select c.registration_date::date, c.office_id, 'General', 'new_clients', 1::numeric
from clients c where c.registration_date is not null
union all
-- Completed food pickups
select sl.slot_date, sl.office_id, 'Hunger Prevention', 'pickups', 1::numeric
from pickup_bookings pb join pickup_slots sl on sl.id = pb.slot_id
where pb.status = 'completed';

revoke all on insights_facts from anon, authenticated;

-- Everything the dashboard needs for one filter state, in one round trip.
create or replace function insights_query(p_from date, p_to date, p_region text default null, p_office uuid default null, p_program text default null)
returns jsonb language sql stable set search_path = public as $$
  with scoped as (
    select f.*, o.region
    from insights_facts f
    left join b2s_offices o on o.id = f.office_id
    where (p_region is null or o.region = p_region)
      and (p_office is null or f.office_id = p_office)
      and (p_program is null or f.program = p_program)
  ),
  cur as (select * from scoped where fact_date between p_from and p_to),
  prev as (select * from scoped where fact_date between p_from - (p_to - p_from + 1) and p_from - 1)
  select jsonb_build_object(
    'totals', coalesce((select jsonb_object_agg(metric, v) from (select metric, sum(value) v from cur group by metric) x), '{}'::jsonb),
    'prev_totals', coalesce((select jsonb_object_agg(metric, v) from (select metric, sum(value) v from prev group by metric) x), '{}'::jsonb),
    'monthly', coalesce((select jsonb_agg(jsonb_build_object('month', mo, 'metric', metric, 'value', v) order by mo) from (select to_char(date_trunc('month', fact_date), 'YYYY-MM') mo, metric, sum(value) v from cur group by 1, 2) x), '[]'::jsonb),
    'prev_monthly', coalesce((select jsonb_agg(jsonb_build_object('month', mo, 'metric', metric, 'value', v)) from (select to_char(date_trunc('month', fact_date), 'YYYY-MM') mo, metric, sum(value) v from prev group by 1, 2) x), '[]'::jsonb),
    'by_office', coalesce((select jsonb_agg(jsonb_build_object('office_id', office_id, 'metric', metric, 'value', v)) from (select office_id, metric, sum(value) v from cur group by 1, 2) x), '[]'::jsonb),
    'by_program', coalesce((select jsonb_agg(jsonb_build_object('program', program, 'metric', metric, 'value', v)) from (select program, metric, sum(value) v from cur group by 1, 2) x), '[]'::jsonb),
    'data_range', (select jsonb_build_object('min', min(fact_date), 'max', max(fact_date)) from scoped)
  )
$$;

revoke all on function insights_query(date, date, text, uuid, text) from public, anon, authenticated;
grant execute on function insights_query(date, date, text, uuid, text) to service_role;
